import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Original interface kept for backward compatibility.
 * All existing callers using this shape continue to work.
 */
export interface AuditLogEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditCategory =
  | 'APPLICATION'
  | 'DOCUMENT'
  | 'PAYMENT'
  | 'USER'
  | 'EVALUATION'
  | 'FIELD_VERIFICATION'
  | 'CERTIFICATE'
  | 'QUERY'
  | 'NOTIFICATION'
  | 'SYSTEM'
  | 'GENERAL';

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/**
 * Enhanced audit entry with additional metadata.
 * Extends the original interface additively -- all new fields are optional.
 */
export interface DetailedAuditEntry {
  userId?: string;
  userRole?: string;
  sessionId?: string;
  action: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log an action with SHA-256 hash chain for immutability verification.
   * Backward compatible: callers using the old AuditLogEntry shape still work.
   */
  async log(entry: AuditLogEntry | DetailedAuditEntry) {
    try {
      const previousHash = await this.getLastRecordHash();
      const recordHash = this.computeRecordHash(entry, previousHash);

      return await this.prisma.auditLog.create({
        data: {
          userId: entry.userId || null,
          userRole: (entry as DetailedAuditEntry).userRole || null,
          sessionId: (entry as DetailedAuditEntry).sessionId || null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId || '',
          category: (entry as DetailedAuditEntry).category || 'GENERAL',
          severity: (entry as DetailedAuditEntry).severity || 'INFO',
          oldValues: entry.oldValues ?? null,
          newValues: entry.newValues ?? null,
          ipAddress: entry.ipAddress || null,
          userAgent: entry.userAgent || null,
          recordHash,
          previousHash,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write audit log entry', error);
      throw error;
    }
  }

  /**
   * Get audit logs with enhanced filters and pagination.
   */
  async findAll(params: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    category?: AuditCategory;
    severity?: AuditSeverity;
    startDate?: Date;
    endDate?: Date;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      userId,
      entityType,
      entityId,
      action,
      category,
      severity,
      page = 1,
      limit = 50,
    } = params;

    // Support both old (startDate/endDate) and new (dateFrom/dateTo) param names
    const effectiveDateFrom = params.dateFrom || params.startDate;
    const effectiveDateTo = params.dateTo || params.endDate;

    const where: any = {};

    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = { contains: action };
    if (category) where.category = category;
    if (severity) where.severity = severity;
    if (effectiveDateFrom || effectiveDateTo) {
      where.createdAt = {};
      if (effectiveDateFrom) where.createdAt.gte = effectiveDateFrom;
      if (effectiveDateTo) where.createdAt.lte = effectiveDateTo;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit logs for a specific entity.
   */
  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get user activity history.
   */
  async findByUser(userId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get recent activity summary with severity breakdown.
   */
  async getRecentActivitySummary() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [totalActions, uniqueUsers, byAction, bySeverity, byCategory] = await Promise.all([
      this.prisma.auditLog.count({
        where: { createdAt: { gte: oneDayAgo } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: oneDayAgo }, userId: { not: null } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: oneDayAgo } },
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      this.prisma.auditLog.groupBy({
        by: ['severity'],
        where: { createdAt: { gte: oneDayAgo } },
        _count: true,
      }),
      this.prisma.auditLog.groupBy({
        by: ['category'],
        where: { createdAt: { gte: oneDayAgo } },
        _count: true,
        orderBy: { _count: { category: 'desc' } },
      }),
    ]);

    const severityBreakdown: Record<string, number> = {};
    for (const s of bySeverity) {
      severityBreakdown[s.severity] = typeof s._count === 'number' ? s._count : 0;
    }

    return {
      last24Hours: {
        totalActions,
        uniqueUsers: uniqueUsers.length,
        topActions: byAction.map((a) => ({
          action: a.action,
          count: a._count,
        })),
        severityBreakdown,
        categoryBreakdown: byCategory.map((c) => ({
          category: c.category,
          count: c._count,
        })),
      },
    };
  }

  /**
   * Full chronological audit trail for an entity.
   */
  async getEntityTimeline(entityType: string, entityId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      entityType,
      entityId,
      totalEvents: logs.length,
      timeline: logs.map((log) => ({
        id: log.id,
        sequenceNumber: log.sequenceNumber,
        action: log.action,
        category: log.category,
        severity: log.severity,
        user: log.user,
        oldValues: log.oldValues,
        newValues: log.newValues,
        recordHash: log.recordHash,
        previousHash: log.previousHash,
        createdAt: log.createdAt,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Hash chain helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the hash of the most recent audit log entry (for chain linking).
   */
  private async getLastRecordHash(): Promise<string> {
    const last = await this.prisma.auditLog.findFirst({
      orderBy: { sequenceNumber: 'desc' },
      select: { recordHash: true },
    });
    return last?.recordHash || 'GENESIS';
  }

  /**
   * Compute a SHA-256 hash of the entry payload including the previous hash,
   * forming an immutable hash chain.
   */
  private computeRecordHash(
    entry: AuditLogEntry | DetailedAuditEntry,
    previousHash: string,
  ): string {
    const payload = JSON.stringify({
      action: entry.action,
      entityId: entry.entityId,
      entityType: entry.entityType,
      userId: entry.userId,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      previousHash,
      timestamp: new Date().toISOString(),
    });
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }
}
