import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { AuditLogService, AuditLogEntry, DetailedAuditEntry } from './audit-log.service';

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
  sequenceNumber: BigInt(1),
  userId: 'user-1',
  userRole: null,
  sessionId: null,
  action: 'APPLICATION_SUBMITTED',
  entityType: 'Application',
  entityId: 'app-1',
  category: 'GENERAL',
  severity: 'INFO',
  oldValues: { status: 'DRAFT' },
  newValues: { status: 'SUBMITTED' },
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  recordHash: 'abc123',
  previousHash: 'GENESIS',
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
      providers: [AuditLogService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // log() -- backward compatibility
  // =========================================================================

  describe('log', () => {
    beforeEach(() => {
      // Default: no previous hash (genesis)
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);
    });

    it('should create an audit log entry with all fields including hash chain', async () => {
      const result = await service.log(mockAuditLogEntry);

      expect(result).toEqual(mockAuditLog);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'APPLICATION_SUBMITTED',
          entityType: 'Application',
          entityId: 'app-1',
          oldValues: { status: 'DRAFT' },
          newValues: { status: 'SUBMITTED' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          recordHash: expect.any(String),
          previousHash: 'GENESIS',
        }),
      });
    });

    it('should default entityId to empty string when not provided', async () => {
      const entryWithoutEntityId: AuditLogEntry = {
        action: 'USER_LOGIN',
        entityType: 'User',
      };

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

      await service.log(minimalEntry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          action: 'SYSTEM_EVENT',
          entityType: 'System',
          entityId: '',
          category: 'GENERAL',
          severity: 'INFO',
          recordHash: expect.any(String),
          previousHash: 'GENESIS',
        }),
      });
    });

    it('should pass oldValues and newValues correctly', async () => {
      const entry: AuditLogEntry = {
        action: 'STATUS_CHANGE',
        entityType: 'Application',
        entityId: 'app-2',
        oldValues: { status: 'SUBMITTED', assignedTo: null },
        newValues: { status: 'UNDER_REVIEW', assignedTo: 'officer-1' },
      };

      await service.log(entry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValues: { status: 'SUBMITTED', assignedTo: null },
          newValues: { status: 'UNDER_REVIEW', assignedTo: 'officer-1' },
        }),
      });
    });

    it('should accept DetailedAuditEntry with category, severity, userRole, sessionId', async () => {
      const detailedEntry: DetailedAuditEntry = {
        userId: 'user-1',
        userRole: 'ADMIN',
        sessionId: 'sess-123',
        action: 'APPLICATION_APPROVED',
        category: 'APPLICATION',
        severity: 'CRITICAL',
        entityType: 'Application',
        entityId: 'app-1',
        oldValues: { status: 'UNDER_REVIEW' },
        newValues: { status: 'APPROVED' },
      };

      await service.log(detailedEntry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userRole: 'ADMIN',
          sessionId: 'sess-123',
          category: 'APPLICATION',
          severity: 'CRITICAL',
        }),
      });
    });

    it('should propagate errors from prisma create', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.log(mockAuditLogEntry)).rejects.toThrow('DB connection lost');
    });
  });

  // =========================================================================
  // Hash chain computation
  // =========================================================================

  describe('hash chain', () => {
    it('should use GENESIS as previousHash when no prior records exist', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      await service.log(mockAuditLogEntry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousHash: 'GENESIS',
        }),
      });
    });

    it('should use the last record hash as previousHash when prior records exist', async () => {
      const previousRecordHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      prisma.auditLog.findFirst.mockResolvedValue({
        recordHash: previousRecordHash,
      } as any);
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      await service.log(mockAuditLogEntry);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousHash: previousRecordHash,
        }),
      });
    });

    it('should compute a valid SHA-256 recordHash (64 hex characters)', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      await service.log(mockAuditLogEntry);

      const createCall = prisma.auditLog.create.mock.calls[0][0] as any;
      const recordHash = createCall.data.recordHash;

      // SHA-256 produces 64 hex characters
      expect(recordHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different entries', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      await service.log({
        action: 'ACTION_A',
        entityType: 'TypeA',
        entityId: 'id-a',
      });

      const hash1 = (prisma.auditLog.create.mock.calls[0][0] as any).data.recordHash;

      await service.log({
        action: 'ACTION_B',
        entityType: 'TypeB',
        entityId: 'id-b',
      });

      const hash2 = (prisma.auditLog.create.mock.calls[1][0] as any).data.recordHash;

      // While timestamp might differ making them unique, the different
      // payloads should certainly produce different hashes
      expect(hash1).not.toEqual(hash2);
    });

    it('should include previousHash in the record hash computation', async () => {
      // This validates that changing the previousHash changes the recordHash,
      // proving the chain linkage.
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      // First call: GENESIS
      prisma.auditLog.findFirst.mockResolvedValueOnce(null);
      await service.log({
        action: 'SAME_ACTION',
        entityType: 'Same',
        entityId: 'same-id',
      });
      const hash1 = (prisma.auditLog.create.mock.calls[0][0] as any).data.recordHash;

      // Second call: has a previous hash
      prisma.auditLog.findFirst.mockResolvedValueOnce({
        recordHash: 'some-previous-hash',
      } as any);
      await service.log({
        action: 'SAME_ACTION',
        entityType: 'Same',
        entityId: 'same-id',
      });
      const hash2 = (prisma.auditLog.create.mock.calls[1][0] as any).data.recordHash;

      // Different previousHash means different recordHash
      expect(hash1).not.toEqual(hash2);
    });

    it('should look up the last record by sequenceNumber descending', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue(mockAuditLog as any);

      await service.log(mockAuditLogEntry);

      expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
        orderBy: { sequenceNumber: 'desc' },
        select: { recordHash: true },
      });
    });
  });

  // =========================================================================
  // findAll() -- with enhanced filters
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

    it('should apply category filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ category: 'APPLICATION' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'APPLICATION' }),
        }),
      );
    });

    it('should apply severity filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ severity: 'CRITICAL' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: 'CRITICAL' }),
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

    it('should apply entityId filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ entityId: 'app-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityId: 'app-1' }),
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

    it('should apply date range filter with startDate and endDate (backward compat)', async () => {
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

    it('should apply date range filter with dateFrom and dateTo', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-12-31');

      await service.findAll({ dateFrom, dateTo });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
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

    it('should apply only endDate when startDate is not provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const endDate = new Date('2025-12-31');

      await service.findAll({ endDate });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: endDate },
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

    it('should handle zero total results', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const result = await service.findAll({});

      expect(result.pagination.totalPages).toBe(0);
      expect(result.logs).toEqual([]);
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

    it('should apply multiple filters simultaneously', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        userId: 'user-1',
        entityType: 'Application',
        action: 'SUBMIT',
        category: 'APPLICATION',
        severity: 'CRITICAL',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            entityType: 'Application',
            action: { contains: 'SUBMIT' },
            category: 'APPLICATION',
            severity: 'CRITICAL',
          }),
        }),
      );
    });

    it('should not include createdAt filter when no dates provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ userId: 'user-1' });

      const callArgs = prisma.auditLog.findMany.mock.calls[0][0] as any;
      expect(callArgs.where.createdAt).toBeUndefined();
    });

    it('should use page 1 skip 0 by default', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
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

    it('should return multiple logs for same entity', async () => {
      const logs = [
        { ...mockAuditLogWithUser, id: 'log-1', action: 'CREATED' },
        { ...mockAuditLogWithUser, id: 'log-2', action: 'UPDATED' },
        { ...mockAuditLogWithUser, id: 'log-3', action: 'SUBMITTED' },
      ];
      prisma.auditLog.findMany.mockResolvedValue(logs as any);

      const result = await service.findByEntity('Application', 'app-1');

      expect(result).toHaveLength(3);
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

    it('should order by createdAt descending', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.findByUser('user-1');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // =========================================================================
  // getRecentActivitySummary() -- with severity breakdown
  // =========================================================================

  describe('getRecentActivitySummary', () => {
    it('should return summary with severity and category breakdowns', async () => {
      prisma.auditLog.count.mockResolvedValue(42);
      // @ts-expect-error Prisma groupBy circular type
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ] as any);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([
        { action: 'APPLICATION_SUBMITTED', _count: 15 },
        { action: 'USER_LOGIN', _count: 10 },
      ] as any);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([
        { severity: 'INFO', _count: 30 },
        { severity: 'WARNING', _count: 8 },
        { severity: 'CRITICAL', _count: 4 },
      ] as any);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([
        { category: 'APPLICATION', _count: 20 },
        { category: 'USER', _count: 12 },
      ] as any);

      const result = await service.getRecentActivitySummary();

      expect(result.last24Hours.totalActions).toBe(42);
      expect(result.last24Hours.uniqueUsers).toBe(3);
      expect(result.last24Hours.topActions).toHaveLength(2);
      expect(result.last24Hours.severityBreakdown).toEqual({
        INFO: 30,
        WARNING: 8,
        CRITICAL: 4,
      });
      expect(result.last24Hours.categoryBreakdown).toHaveLength(2);
    });

    it('should return zero counts when no recent activity', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([] as any);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([] as any);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([] as any);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValueOnce([] as any);

      const result = await service.getRecentActivitySummary();

      expect(result.last24Hours.totalActions).toBe(0);
      expect(result.last24Hours.uniqueUsers).toBe(0);
      expect(result.last24Hours.topActions).toEqual([]);
      expect(result.last24Hours.severityBreakdown).toEqual({});
    });

    it('should use date filter for last 24 hours', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      (prisma.auditLog.groupBy as jest.Mock).mockResolvedValue([] as any);

      await service.getRecentActivitySummary();

      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: expect.any(Date) } },
      });
    });
  });

  // =========================================================================
  // getEntityTimeline()
  // =========================================================================

  describe('getEntityTimeline', () => {
    it('should return chronological timeline for an entity', async () => {
      const timelineLogs = [
        {
          ...mockAuditLogWithUser,
          id: 'log-1',
          action: 'CREATED',
          createdAt: new Date('2025-06-15T08:00:00Z'),
        },
        {
          ...mockAuditLogWithUser,
          id: 'log-2',
          action: 'SUBMITTED',
          createdAt: new Date('2025-06-15T10:00:00Z'),
        },
        {
          ...mockAuditLogWithUser,
          id: 'log-3',
          action: 'APPROVED',
          createdAt: new Date('2025-06-15T12:00:00Z'),
        },
      ];

      prisma.auditLog.findMany.mockResolvedValue(timelineLogs as any);

      const result = await service.getEntityTimeline('Application', 'app-1');

      expect(result.entityType).toBe('Application');
      expect(result.entityId).toBe('app-1');
      expect(result.totalEvents).toBe(3);
      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0].action).toBe('CREATED');
      expect(result.timeline[2].action).toBe('APPROVED');
    });

    it('should query with ascending order for chronological timeline', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.getEntityTimeline('Application', 'app-1');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { entityType: 'Application', entityId: 'app-1' },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return empty timeline for nonexistent entity', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.getEntityTimeline('Application', 'nonexistent');

      expect(result.totalEvents).toBe(0);
      expect(result.timeline).toEqual([]);
    });

    it('should include hash fields in timeline entries', async () => {
      const logWithHash = {
        ...mockAuditLogWithUser,
        recordHash: 'abc123',
        previousHash: 'GENESIS',
      };
      prisma.auditLog.findMany.mockResolvedValue([logWithHash] as any);

      const result = await service.getEntityTimeline('Application', 'app-1');

      expect(result.timeline[0].recordHash).toBe('abc123');
      expect(result.timeline[0].previousHash).toBe('GENESIS');
    });
  });
});
