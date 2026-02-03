import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, DelegationType } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import { DelegationService } from './delegation.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockFromUser = {
  id: 'user-from',
  email: 'officer@apcd.gov.in',
  firstName: 'Officer',
  lastName: 'One',
  role: 'OFFICER',
};

const mockToUser = {
  id: 'user-to',
  email: 'officer2@apcd.gov.in',
  firstName: 'Officer',
  lastName: 'Two',
  role: 'OFFICER',
};

const now = new Date('2025-07-01T12:00:00Z');
const yesterday = new Date('2025-06-30T12:00:00Z');
const tomorrow = new Date('2025-07-02T12:00:00Z');

const mockDelegation = {
  id: 'delegation-1',
  fromUserId: mockFromUser.id,
  toUserId: mockToUser.id,
  delegationType: DelegationType.LEAVE,
  reason: 'On annual leave',
  startDate: yesterday,
  endDate: tomorrow,
  approvedBy: 'admin-1',
  isActive: true,
  scope: null,
  createdAt: yesterday,
  updatedAt: yesterday,
  fromUser: mockFromUser,
  toUser: mockToUser,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DelegationService', () => {
  let service: DelegationService;
  let prisma: DeepMockProxy<PrismaClient>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();
    const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelegationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<DelegationService>(DelegationService);
    prisma = mockPrisma;
    auditService = mockAuditService;

    // Fix Date.now for consistent tests
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // =========================================================================
  // createDelegation()
  // =========================================================================

  describe('createDelegation', () => {
    it('should create a delegation and log an audit entry', async () => {
      prisma.delegation.create.mockResolvedValue(mockDelegation as never);

      const result = await service.createDelegation(
        {
          fromUserId: mockFromUser.id,
          toUserId: mockToUser.id,
          type: DelegationType.LEAVE,
          reason: 'On annual leave',
          startDate: yesterday,
          endDate: tomorrow,
        },
        'admin-1',
      );

      expect(result).toEqual(mockDelegation);
      expect(prisma.delegation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromUserId: mockFromUser.id,
          toUserId: mockToUser.id,
          delegationType: DelegationType.LEAVE,
          reason: 'On annual leave',
          isActive: true,
          approvedBy: 'admin-1',
        }),
        include: expect.objectContaining({
          fromUser: expect.anything(),
          toUser: expect.anything(),
        }),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELEGATION_CREATED',
          entityType: 'Delegation',
          entityId: mockDelegation.id,
        }),
      );
    });

    it('should handle delegation without an endDate', async () => {
      const openEndedDelegation = { ...mockDelegation, endDate: null };
      prisma.delegation.create.mockResolvedValue(openEndedDelegation as never);

      const result = await service.createDelegation(
        {
          fromUserId: mockFromUser.id,
          toUserId: mockToUser.id,
          type: DelegationType.TRANSFER,
          reason: 'Permanent transfer',
          startDate: yesterday,
        },
        'admin-1',
      );

      expect(result.endDate).toBeNull();
      expect(prisma.delegation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          endDate: null,
        }),
        include: expect.anything(),
      });
    });
  });

  // =========================================================================
  // revokeDelegation()
  // =========================================================================

  describe('revokeDelegation', () => {
    it('should revoke an existing delegation and log audit', async () => {
      prisma.delegation.findUnique.mockResolvedValue(mockDelegation as never);
      const revokedDelegation = { ...mockDelegation, isActive: false };
      prisma.delegation.update.mockResolvedValue(revokedDelegation as never);

      const result = await service.revokeDelegation('delegation-1', 'admin-1');

      expect(result.isActive).toBe(false);
      expect(prisma.delegation.update).toHaveBeenCalledWith({
        where: { id: 'delegation-1' },
        data: expect.objectContaining({ isActive: false }),
        include: expect.anything(),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELEGATION_REVOKED',
          entityType: 'Delegation',
          entityId: 'delegation-1',
          severity: 'WARNING',
        }),
      );
    });

    it('should throw NotFoundException if delegation does not exist', async () => {
      prisma.delegation.findUnique.mockResolvedValue(null as never);

      await expect(service.revokeDelegation('nonexistent-id', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getActiveDelegations()
  // =========================================================================

  describe('getActiveDelegations', () => {
    it('should return active delegations for a user filtered by date', async () => {
      prisma.delegation.findMany.mockResolvedValue([mockDelegation] as never);

      const result = await service.getActiveDelegations(mockFromUser.id);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockDelegation);
      expect(prisma.delegation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            startDate: { lte: now },
          }),
        }),
      );
    });

    it('should return empty array when no active delegations exist', async () => {
      prisma.delegation.findMany.mockResolvedValue([] as never);

      const result = await service.getActiveDelegations('no-delegations-user');

      expect(result).toEqual([]);
    });

    it('should match both fromUserId and toUserId', async () => {
      prisma.delegation.findMany.mockResolvedValue([mockDelegation] as never);

      await service.getActiveDelegations(mockToUser.id);

      const callArgs = prisma.delegation.findMany.mock.calls[0][0] as Record<string, unknown>;
      const where = callArgs.where as Record<string, unknown>;

      // Should have AND clause containing OR for fromUserId/toUserId
      expect(where.AND).toBeDefined();
    });
  });

  // =========================================================================
  // getEffectiveRole()
  // =========================================================================

  describe('getEffectiveRole', () => {
    it('should return the delegated role when an active delegation exists', async () => {
      prisma.delegation.findFirst.mockResolvedValue({
        ...mockDelegation,
        fromUser: mockFromUser,
      } as never);

      const result = await service.getEffectiveRole(mockToUser.id);

      expect(result).not.toBeNull();
      expect(result?.effectiveRole).toBe('OFFICER');
      expect(result?.delegationType).toBe(DelegationType.LEAVE);
    });

    it('should return null when no active delegation exists', async () => {
      prisma.delegation.findFirst.mockResolvedValue(null as never);

      const result = await service.getEffectiveRole('user-without-delegation');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // isActingAs()
  // =========================================================================

  describe('isActingAs', () => {
    it('should return true when active delegation exists from target to actor', async () => {
      prisma.delegation.findFirst.mockResolvedValue(mockDelegation as never);

      const result = await service.isActingAs(mockToUser.id, mockFromUser.id);

      expect(result).toBe(true);
      expect(prisma.delegation.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          fromUserId: mockFromUser.id,
          toUserId: mockToUser.id,
          isActive: true,
          startDate: { lte: now },
        }),
      });
    });

    it('should return false when no delegation exists', async () => {
      prisma.delegation.findFirst.mockResolvedValue(null as never);

      const result = await service.isActingAs('random-user', mockFromUser.id);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // expireOverdueDelegations()
  // =========================================================================

  describe('expireOverdueDelegations', () => {
    it('should deactivate delegations past their endDate', async () => {
      prisma.delegation.updateMany.mockResolvedValue({ count: 3 } as never);

      const count = await service.expireOverdueDelegations();

      expect(count).toBe(3);
      expect(prisma.delegation.updateMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          endDate: { lt: now },
          NOT: { endDate: null },
        },
        data: { isActive: false },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELEGATIONS_AUTO_EXPIRED',
          entityType: 'Delegation',
          category: 'SYSTEM',
        }),
      );
    });

    it('should not log audit when no delegations are expired', async () => {
      prisma.delegation.updateMany.mockResolvedValue({ count: 0 } as never);

      const count = await service.expireOverdueDelegations();

      expect(count).toBe(0);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should not expire delegations with null endDate', async () => {
      prisma.delegation.updateMany.mockResolvedValue({ count: 0 } as never);

      await service.expireOverdueDelegations();

      expect(prisma.delegation.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          NOT: { endDate: null },
        }),
        data: { isActive: false },
      });
    });
  });
});
