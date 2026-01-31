import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { AuditLogService, AuditLogEntry } from './audit-log.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-1',
  email: 'admin@apcd.gov.in',
  firstName: 'Admin',
  lastName: 'User',
  role: 'ADMIN',
};

const mockAuditLogEntry: AuditLogEntry = {
  userId: 'user-1',
  action: 'APPLICATION_SUBMITTED',
  entityType: 'Application',
  entityId: 'app-1',
  oldValues: { status: 'DRAFT' },
  newValues: { status: 'SUBMITTED' },
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
};

const mockAuditLog = {
  id: 'log-1',
  userId: 'user-1',
  action: 'APPLICATION_SUBMITTED',
  entityType: 'Application',
  entityId: 'app-1',
  oldValues: { status: 'DRAFT' },
  newValues: { status: 'SUBMITTED' },
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2025-06-15T10:00:00Z'),
};

const mockAuditLogWithUser = {
  ...mockAuditLog,
  user: mockUser,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // log()
  // =========================================================================

  describe('log', () => {
    it('should create an audit log entry with all fields', async () => {
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      const result = await service.log(mockAuditLogEntry);

      expect(result).toEqual(mockAuditLog);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'APPLICATION_SUBMITTED',
          entityType: 'Application',
          entityId: 'app-1',
          oldValues: { status: 'DRAFT' },
          newValues: { status: 'SUBMITTED' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      });
    });

    it('should default entityId to empty string when not provided', async () => {
      const entryWithoutEntityId: AuditLogEntry = {
        action: 'USER_LOGIN',
        entityType: 'User',
      };

      prisma.auditLog.create.mockResolvedValue({ ...mockAuditLog, entityId: '' } as any);

      await service.log(entryWithoutEntityId);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: '',
        }),
      });
    });

    it('should handle entry with only required fields', async () => {
      const minimalEntry: AuditLogEntry = {
        action: 'SYSTEM_EVENT',
        entityType: 'System',
      };

      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      await service.log(minimalEntry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: undefined,
          action: 'SYSTEM_EVENT',
          entityType: 'System',
          entityId: '',
          oldValues: undefined,
          newValues: undefined,
          ipAddress: undefined,
          userAgent: undefined,
        },
      });
    });
  });

  // =========================================================================
  // findAll()
  // =========================================================================

  describe('findAll', () => {
    it('should return paginated results with default pagination', async () => {
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLogWithUser] as any);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({
        logs: [mockAuditLogWithUser],
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should apply userId filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ userId: 'user-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('should apply entityType filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ entityType: 'Application' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'Application' }),
        }),
      );
    });

    it('should apply action filter with contains', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ action: 'SUBMIT' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { contains: 'SUBMIT' },
          }),
        }),
      );
    });

    it('should apply date range filter with startDate and endDate', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      await service.findAll({ startDate, endDate });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate, lte: endDate },
          }),
        }),
      );
    });

    it('should apply only startDate when endDate is not provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date('2025-06-01');

      await service.findAll({ startDate });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate },
          }),
        }),
      );
    });

    it('should apply custom pagination', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(100);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 100,
        totalPages: 10,
      });
    });

    it('should calculate totalPages correctly with ceiling', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(51);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.pagination.totalPages).toBe(6);
    });

    it('should include user relation in results', async () => {
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLogWithUser] as any);
      prisma.auditLog.count.mockResolvedValue(1);

      await service.findAll({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true },
            },
          },
        }),
      );
    });

    it('should order by createdAt descending', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // =========================================================================
  // findByEntity()
  // =========================================================================

  describe('findByEntity', () => {
    it('should return logs for a specific entity', async () => {
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLogWithUser] as any);

      const result = await service.findByEntity('Application', 'app-1');

      expect(result).toEqual([mockAuditLogWithUser]);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { entityType: 'Application', entityId: 'app-1' },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no logs exist for entity', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.findByEntity('Certificate', 'cert-nonexistent');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // findByUser()
  // =========================================================================

  describe('findByUser', () => {
    it('should return logs for a specific user with default limit', async () => {
      prisma.auditLog.findMany.mockResolvedValue([mockAuditLog] as any);

      const result = await service.findByUser('user-1');

      expect(result).toEqual([mockAuditLog]);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('should respect custom limit parameter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.findByUser('user-1', 25);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    it('should return empty array when user has no activity', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.findByUser('inactive-user');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getRecentActivitySummary()
  // =========================================================================

  describe('getRecentActivitySummary', () => {
    it('should return summary of last 24 hours activity', async () => {
      prisma.auditLog.count.mockResolvedValue(42);
      prisma.auditLog.groupBy.mockResolvedValueOnce([
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ] as any);
      prisma.auditLog.groupBy.mockResolvedValueOnce([
        { action: 'APPLICATION_SUBMITTED', _count: 15 },
        { action: 'USER_LOGIN', _count: 10 },
      ] as any);

      const result = await service.getRecentActivitySummary();

      expect(result).toEqual({
        last24Hours: {
          totalActions: 42,
          uniqueUsers: 3,
          topActions: [
            { action: 'APPLICATION_SUBMITTED', count: 15 },
            { action: 'USER_LOGIN', count: 10 },
          ],
        },
      });
    });

    it('should return zero counts when no recent activity', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.auditLog.groupBy.mockResolvedValueOnce([]);
      prisma.auditLog.groupBy.mockResolvedValueOnce([]);

      const result = await service.getRecentActivitySummary();

      expect(result).toEqual({
        last24Hours: {
          totalActions: 0,
          uniqueUsers: 0,
          topActions: [],
        },
      });
    });

    it('should use date filter for last 24 hours', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.auditLog.groupBy.mockResolvedValue([] as any);

      await service.getRecentActivitySummary();

      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: expect.any(Date) } },
      });
    });
  });
});
