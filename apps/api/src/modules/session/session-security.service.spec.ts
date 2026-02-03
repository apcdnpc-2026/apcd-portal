import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import { SessionSecurityService } from './session-security.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const now = new Date('2025-07-01T12:00:00Z');

const mockLoginAttempt = {
  id: 'attempt-1',
  email: 'user@example.com',
  ipAddress: '192.168.1.1',
  success: false,
  failureReason: 'Invalid password',
  attemptedAt: now,
};

const futureDate = new Date('2025-07-01T12:30:00Z');

const mockSession = {
  id: 'session-1',
  userId: 'user-1',
  token: 'valid-token-abc',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  lastActivityAt: now,
  expiresAt: futureDate,
  isRevoked: false,
  createdAt: now,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SessionSecurityService', () => {
  let service: SessionSecurityService;
  let prisma: DeepMockProxy<PrismaClient>;
  let auditService: DeepMockProxy<AuditLogService>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();
    const mockAuditService = mockDeep<AuditLogService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionSecurityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<SessionSecurityService>(SessionSecurityService);
    prisma = mockPrisma;
    auditService = mockAuditService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // recordLoginAttempt
  // =========================================================================

  describe('recordLoginAttempt', () => {
    it('should create a login attempt record', async () => {
      prisma.loginAttempt.create.mockResolvedValue(mockLoginAttempt as never);
      auditService.log.mockResolvedValue(undefined as never);

      const result = await service.recordLoginAttempt(
        'user@example.com',
        '192.168.1.1',
        false,
        'Invalid password',
      );

      expect(result).toEqual(mockLoginAttempt);
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          ipAddress: '192.168.1.1',
          success: false,
          failureReason: 'Invalid password',
        },
      });
    });

    it('should record a successful login attempt', async () => {
      const successAttempt = { ...mockLoginAttempt, success: true, failureReason: null };
      prisma.loginAttempt.create.mockResolvedValue(successAttempt as never);
      auditService.log.mockResolvedValue(undefined as never);

      const result = await service.recordLoginAttempt('user@example.com', '192.168.1.1', true);

      expect(result.success).toBe(true);
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          email: 'user@example.com',
          ipAddress: '192.168.1.1',
          success: true,
          failureReason: null,
        },
      });
    });

    it('should create an audit log entry for the login attempt', async () => {
      prisma.loginAttempt.create.mockResolvedValue(mockLoginAttempt as never);
      auditService.log.mockResolvedValue(undefined as never);

      await service.recordLoginAttempt(
        'user@example.com',
        '192.168.1.1',
        false,
        'Invalid password',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_FAILURE',
          entityType: 'LoginAttempt',
          entityId: 'attempt-1',
        }),
      );
    });
  });

  // =========================================================================
  // isAccountLocked
  // =========================================================================

  describe('isAccountLocked', () => {
    it('should return locked=true after 5 failed attempts within lockout window', async () => {
      prisma.loginAttempt.count.mockResolvedValue(5 as never);
      prisma.loginAttempt.findFirst.mockResolvedValue({
        ...mockLoginAttempt,
        attemptedAt: new Date(),
      } as never);

      const result = await service.isAccountLocked('user@example.com');

      expect(result.locked).toBe(true);
      expect(result.remainingMinutes).toBeDefined();
      expect(result.remainingMinutes).toBeGreaterThan(0);
    });

    it('should return locked=false when fewer than 5 failed attempts', async () => {
      prisma.loginAttempt.count.mockResolvedValue(3 as never);

      const result = await service.isAccountLocked('user@example.com');

      expect(result.locked).toBe(false);
      expect(result.remainingMinutes).toBeUndefined();
    });

    it('should return locked=false when account unlocks after lockout period', async () => {
      // Simulate that all failed attempts are older than lockout window
      // The count query uses gte: windowStart, so 0 attempts in window = unlocked
      prisma.loginAttempt.count.mockResolvedValue(0 as never);

      const result = await service.isAccountLocked('user@example.com');

      expect(result.locked).toBe(false);
    });

    it('should query failed attempts within the lockout window only', async () => {
      prisma.loginAttempt.count.mockResolvedValue(0 as never);

      await service.isAccountLocked('user@example.com');

      expect(prisma.loginAttempt.count).toHaveBeenCalledWith({
        where: {
          email: 'user@example.com',
          success: false,
          attemptedAt: { gte: expect.any(Date) },
        },
      });
    });
  });

  // =========================================================================
  // createSession — concurrent session limit enforcement
  // =========================================================================

  describe('createSession', () => {
    it('should create a new session', async () => {
      prisma.activeSession.findMany.mockResolvedValue([] as never);
      prisma.activeSession.create.mockResolvedValue(mockSession as never);
      auditService.log.mockResolvedValue(undefined as never);

      const result = await service.createSession(
        'user-1',
        'new-token',
        '192.168.1.1',
        'Mozilla/5.0',
      );

      expect(result).toEqual(mockSession);
      expect(prisma.activeSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          token: 'new-token',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          isRevoked: false,
        }),
      });
    });

    it('should revoke oldest session when concurrent limit is reached', async () => {
      const existingSessions = [
        { ...mockSession, id: 'session-oldest', createdAt: new Date('2025-07-01T10:00:00Z') },
        { ...mockSession, id: 'session-mid', createdAt: new Date('2025-07-01T11:00:00Z') },
        { ...mockSession, id: 'session-newest', createdAt: new Date('2025-07-01T12:00:00Z') },
      ];

      prisma.activeSession.findMany.mockResolvedValue(existingSessions as never);
      prisma.activeSession.update.mockResolvedValue(mockSession as never);
      prisma.activeSession.create.mockResolvedValue(mockSession as never);
      auditService.log.mockResolvedValue(undefined as never);

      await service.createSession('user-1', 'new-token-4', '192.168.1.1', 'Mozilla/5.0');

      // The oldest session should be revoked
      expect(prisma.activeSession.update).toHaveBeenCalledWith({
        where: { id: 'session-oldest' },
        data: { isRevoked: true },
      });
    });

    it('should not revoke sessions when under the limit', async () => {
      const existingSessions = [
        { ...mockSession, id: 'session-1' },
        { ...mockSession, id: 'session-2' },
      ];

      prisma.activeSession.findMany.mockResolvedValue(existingSessions as never);
      prisma.activeSession.create.mockResolvedValue(mockSession as never);
      auditService.log.mockResolvedValue(undefined as never);

      await service.createSession('user-1', 'new-token-3', '192.168.1.1', 'Mozilla/5.0');

      // update should only be called for the create, not for revoking
      expect(prisma.activeSession.update).not.toHaveBeenCalled();
    });

    it('should log an audit entry when a session is created', async () => {
      prisma.activeSession.findMany.mockResolvedValue([] as never);
      prisma.activeSession.create.mockResolvedValue(mockSession as never);
      auditService.log.mockResolvedValue(undefined as never);

      await service.createSession('user-1', 'new-token', '192.168.1.1', 'Mozilla/5.0');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SESSION_CREATED',
          entityType: 'ActiveSession',
          userId: 'user-1',
        }),
      );
    });
  });

  // =========================================================================
  // validateSession
  // =========================================================================

  describe('validateSession', () => {
    it('should return the session and update lastActivityAt for a valid session', async () => {
      const validSession = { ...mockSession, expiresAt: new Date(Date.now() + 60000) };
      prisma.activeSession.findFirst.mockResolvedValue(validSession as never);
      prisma.activeSession.update.mockResolvedValue({
        ...validSession,
        lastActivityAt: new Date(),
      } as never);

      const result = await service.validateSession('valid-token-abc');

      expect(result).not.toBeNull();
      expect(prisma.activeSession.update).toHaveBeenCalledWith({
        where: { id: validSession.id },
        data: { lastActivityAt: expect.any(Date) },
      });
    });

    it('should return null for a non-existent token', async () => {
      prisma.activeSession.findFirst.mockResolvedValue(null as never);

      const result = await service.validateSession('non-existent-token');

      expect(result).toBeNull();
    });

    it('should return null for a revoked session', async () => {
      const revokedSession = { ...mockSession, isRevoked: true };
      prisma.activeSession.findFirst.mockResolvedValue(revokedSession as never);

      const result = await service.validateSession('valid-token-abc');

      expect(result).toBeNull();
      expect(prisma.activeSession.update).not.toHaveBeenCalled();
    });

    it('should return null for an expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      };
      prisma.activeSession.findFirst.mockResolvedValue(expiredSession as never);

      const result = await service.validateSession('valid-token-abc');

      expect(result).toBeNull();
      expect(prisma.activeSession.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // revokeSession
  // =========================================================================

  describe('revokeSession', () => {
    it('should mark a session as revoked', async () => {
      const revokedSession = { ...mockSession, isRevoked: true };
      prisma.activeSession.update.mockResolvedValue(revokedSession as never);
      auditService.log.mockResolvedValue(undefined as never);

      const result = await service.revokeSession('session-1');

      expect(result.isRevoked).toBe(true);
      expect(prisma.activeSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { isRevoked: true },
      });
    });

    it('should create an audit log entry when revoking a session', async () => {
      const revokedSession = { ...mockSession, isRevoked: true };
      prisma.activeSession.update.mockResolvedValue(revokedSession as never);
      auditService.log.mockResolvedValue(undefined as never);

      await service.revokeSession('session-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SESSION_REVOKED',
          entityType: 'ActiveSession',
        }),
      );
    });
  });

  // =========================================================================
  // revokeAllSessions
  // =========================================================================

  describe('revokeAllSessions', () => {
    it('should revoke all active sessions for a user', async () => {
      prisma.activeSession.updateMany.mockResolvedValue({ count: 3 } as never);
      auditService.log.mockResolvedValue(undefined as never);

      const result = await service.revokeAllSessions('user-1');

      expect(result.count).toBe(3);
      expect(prisma.activeSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });

    it('should create an audit log entry with the revoked count', async () => {
      prisma.activeSession.updateMany.mockResolvedValue({ count: 2 } as never);
      auditService.log.mockResolvedValue(undefined as never);

      await service.revokeAllSessions('user-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ALL_SESSIONS_REVOKED',
          entityType: 'ActiveSession',
          entityId: 'user-1',
          newValues: { revokedCount: 2 },
        }),
      );
    });

    it('should handle case where user has no active sessions', async () => {
      prisma.activeSession.updateMany.mockResolvedValue({ count: 0 } as never);
      auditService.log.mockResolvedValue(undefined as never);

      const result = await service.revokeAllSessions('user-no-sessions');

      expect(result.count).toBe(0);
    });
  });

  // =========================================================================
  // cleanExpiredSessions
  // =========================================================================

  describe('cleanExpiredSessions', () => {
    it('should delete sessions past their expiresAt', async () => {
      prisma.activeSession.deleteMany.mockResolvedValue({ count: 5 } as never);

      const result = await service.cleanExpiredSessions();

      expect(result.count).toBe(5);
      expect(prisma.activeSession.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });
  });

  // =========================================================================
  // getActiveSessions
  // =========================================================================

  describe('getActiveSessions', () => {
    it('should return non-revoked, non-expired sessions for a user', async () => {
      const sessions = [mockSession];
      prisma.activeSession.findMany.mockResolvedValue(sessions as never);

      const result = await service.getActiveSessions('user-1');

      expect(result).toEqual(sessions);
      expect(prisma.activeSession.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isRevoked: false,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { lastActivityAt: 'desc' },
      });
    });
  });

  // =========================================================================
  // refreshSession
  // =========================================================================

  describe('refreshSession', () => {
    it('should update the lastActivityAt timestamp', async () => {
      const refreshed = { ...mockSession, lastActivityAt: new Date() };
      prisma.activeSession.update.mockResolvedValue(refreshed as never);

      const result = await service.refreshSession('session-1');

      expect(result.lastActivityAt).toBeDefined();
      expect(prisma.activeSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { lastActivityAt: expect.any(Date) },
      });
    });
  });
});
