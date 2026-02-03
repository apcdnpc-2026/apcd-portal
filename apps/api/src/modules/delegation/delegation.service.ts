import { DelegationType } from '@apcd/database';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface CreateDelegationDto {
  fromUserId: string;
  toUserId: string;
  type: DelegationType;
  reason: string;
  startDate: Date;
  endDate?: Date;
}

@Injectable()
export class DelegationService {
  private readonly logger = new Logger(DelegationService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditLogService,
  ) {}

  /**
   * Create a new delegation record and log it to the audit trail.
   */
  async createDelegation(dto: CreateDelegationDto, approvedBy: string) {
    const delegation = await this.prisma.delegation.create({
      data: {
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId,
        delegationType: dto.type,
        reason: dto.reason,
        startDate: dto.startDate,
        endDate: dto.endDate ?? null,
        approvedBy,
        isActive: true,
      },
      include: {
        fromUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        toUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    await this.auditService.log({
      userId: approvedBy,
      action: 'DELEGATION_CREATED',
      entityType: 'Delegation',
      entityId: delegation.id,
      category: 'USER',
      severity: 'INFO',
      newValues: {
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId,
        type: dto.type,
        reason: dto.reason,
        startDate: dto.startDate.toISOString(),
        endDate: dto.endDate?.toISOString() ?? null,
      },
    });

    return delegation;
  }

  /**
   * Revoke a delegation by setting isActive=false and recording who revoked it.
   */
  async revokeDelegation(delegationId: string, revokedByUserId: string) {
    const existing = await this.prisma.delegation.findUnique({
      where: { id: delegationId },
    });

    if (!existing) {
      throw new NotFoundException(`Delegation with ID ${delegationId} not found`);
    }

    const delegation = await this.prisma.delegation.update({
      where: { id: delegationId },
      data: {
        isActive: false,
        // The Delegation model has updatedAt @updatedAt which auto-updates.
        // We record the revokedBy in the audit log since the schema doesn't
        // have a dedicated revokedAt/revokedBy column -- the updatedAt serves
        // as revokedAt and audit log records who revoked it.
      },
      include: {
        fromUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        toUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    await this.auditService.log({
      userId: revokedByUserId,
      action: 'DELEGATION_REVOKED',
      entityType: 'Delegation',
      entityId: delegationId,
      category: 'USER',
      severity: 'WARNING',
      oldValues: { isActive: true },
      newValues: { isActive: false, revokedBy: revokedByUserId },
    });

    return delegation;
  }

  /**
   * Get all active delegations for a user (either as delegator or delegate)
   * where the current time falls within the delegation period.
   */
  async getActiveDelegations(userId: string) {
    const now = new Date();

    return this.prisma.delegation.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
        AND: [
          {
            OR: [{ fromUserId: userId }, { toUserId: userId }],
          },
        ],
      },
      include: {
        fromUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        toUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all active delegations system-wide (admin view).
   */
  async getAllActiveDelegations() {
    const now = new Date();

    return this.prisma.delegation.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        fromUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        toUser: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get the effective role for a user by checking if they have an active
   * delegation granting them the delegator's role/permissions.
   *
   * Returns the delegator's role if an active delegation exists where
   * the user is the delegate (toUser), otherwise returns null.
   */
  async getEffectiveRole(userId: string) {
    const now = new Date();

    const activeDelegation = await this.prisma.delegation.findFirst({
      where: {
        toUserId: userId,
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        fromUser: {
          select: { id: true, role: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeDelegation) {
      return null;
    }

    return {
      delegationId: activeDelegation.id,
      delegationType: activeDelegation.delegationType,
      effectiveRole: activeDelegation.fromUser.role,
      delegatedFrom: activeDelegation.fromUser,
      startDate: activeDelegation.startDate,
      endDate: activeDelegation.endDate,
    };
  }

  /**
   * Check if actorId has an active delegation from targetUserId.
   * This means targetUserId delegated their responsibilities to actorId.
   */
  async isActingAs(actorId: string, targetUserId: string): Promise<boolean> {
    const now = new Date();

    const delegation = await this.prisma.delegation.findFirst({
      where: {
        fromUserId: targetUserId,
        toUserId: actorId,
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });

    return delegation !== null;
  }

  /**
   * Auto-expire delegations whose endDate has passed but are still marked active.
   * Can be called from a cron job or invoked on-demand.
   */
  async expireOverdueDelegations(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.delegation.updateMany({
      where: {
        isActive: true,
        endDate: { lt: now },
        NOT: { endDate: null },
      },
      data: {
        isActive: false,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Auto-expired ${result.count} overdue delegation(s)`);

      await this.auditService.log({
        action: 'DELEGATIONS_AUTO_EXPIRED',
        entityType: 'Delegation',
        entityId: 'batch',
        category: 'SYSTEM',
        severity: 'INFO',
        newValues: { expiredCount: result.count },
      });
    }

    return result.count;
  }
}
