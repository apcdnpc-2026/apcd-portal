import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

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

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  /**
   * Log an action
   */
  async log(entry: AuditLogEntry) {
    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || '',
        oldValues: entry.oldValues,
        newValues: entry.newValues,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }

  /**
   * Get audit logs with filters
   */
  async findAll(params: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      userId,
      entityType,
      entityId,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = params;

    const where: any = {};

    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = { contains: action };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
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
   * Get audit logs for a specific entity
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
   * Get user activity history
   */
  async findByUser(userId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get recent activity summary
   */
  async getRecentActivitySummary() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [totalActions, uniqueUsers, byAction] = await Promise.all([
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
    ]);

    return {
      last24Hours: {
        totalActions,
        uniqueUsers: uniqueUsers.length,
        topActions: byAction.map((a) => ({
          action: a.action,
          count: a._count,
        })),
      },
    };
  }
}
