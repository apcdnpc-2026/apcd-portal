import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

/** Maximum consecutive failed login attempts before account lockout. */
const MAX_FAILED_ATTEMPTS = 5;

/** Duration (in minutes) for which an account remains locked after exceeding MAX_FAILED_ATTEMPTS. */
const LOCKOUT_DURATION_MINUTES = 30;

/** Maximum number of concurrent active sessions allowed per user. */
const MAX_CONCURRENT_SESSIONS = 3;

/** Session inactivity timeout in minutes. */
const SESSION_TIMEOUT_MINUTES = 30;

@Injectable()
export class SessionSecurityService {
  private readonly logger = new Logger(SessionSecurityService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditLogService,
  ) {}

  /**
   * Record a login attempt (successful or failed) for auditing and lockout enforcement.
   */
  async recordLoginAttempt(
    email: string,
    ipAddress: string,
    success: boolean,
    failureReason?: string,
  ) {
    const attempt = await this.prisma.loginAttempt.create({
      data: {
        email,
        ipAddress,
        success,
        failureReason: failureReason || null,
      },
    });

    await this.auditService.log({
      action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
      entityType: 'LoginAttempt',
      entityId: attempt.id,
      ipAddress,
      newValues: {
        email,
        success,
        ...(failureReason ? { failureReason } : {}),
      },
    });

    return attempt;
  }

  /**
   * Check whether an account is currently locked due to excessive failed login attempts.
   * Returns the lock status and remaining lockout minutes if applicable.
   */
  async isAccountLocked(email: string): Promise<{ locked: boolean; remainingMinutes?: number }> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - LOCKOUT_DURATION_MINUTES);

    const failedAttempts = await this.prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        attemptedAt: { gte: windowStart },
      },
    });

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      // Find the most recent failed attempt to compute remaining lockout time
      const lastFailedAttempt = await this.prisma.loginAttempt.findFirst({
        where: {
          email,
          success: false,
          attemptedAt: { gte: windowStart },
        },
        orderBy: { attemptedAt: 'desc' },
      });

      if (lastFailedAttempt) {
        const lockoutEndsAt = new Date(lastFailedAttempt.attemptedAt);
        lockoutEndsAt.setMinutes(lockoutEndsAt.getMinutes() + LOCKOUT_DURATION_MINUTES);
        const remainingMs = lockoutEndsAt.getTime() - Date.now();
        const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (1000 * 60)));

        return { locked: true, remainingMinutes };
      }

      return { locked: true, remainingMinutes: LOCKOUT_DURATION_MINUTES };
    }

    return { locked: false };
  }

  /**
   * Create a new active session for a user.
   * Enforces MAX_CONCURRENT_SESSIONS by revoking the oldest sessions if the limit is exceeded.
   */
  async createSession(userId: string, token: string, ipAddress: string, userAgent: string) {
    // Enforce concurrent session limit — revoke oldest if over limit
    const activeSessions = await this.prisma.activeSession.findMany({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'asc' },
    });

    if (activeSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const sessionsToRevoke = activeSessions.slice(
        0,
        activeSessions.length - MAX_CONCURRENT_SESSIONS + 1,
      );

      for (const session of sessionsToRevoke) {
        await this.prisma.activeSession.update({
          where: { id: session.id },
          data: { isRevoked: true },
        });
      }

      this.logger.log(
        `Revoked ${sessionsToRevoke.length} oldest session(s) for user ${userId} to enforce concurrent session limit`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + SESSION_TIMEOUT_MINUTES);

    const session = await this.prisma.activeSession.create({
      data: {
        userId,
        token,
        ipAddress,
        userAgent,
        lastActivityAt: new Date(),
        expiresAt,
        isRevoked: false,
      },
    });

    await this.auditService.log({
      userId,
      action: 'SESSION_CREATED',
      entityType: 'ActiveSession',
      entityId: session.id,
      ipAddress,
      newValues: { userAgent },
    });

    return session;
  }

  /**
   * Refresh a session's lastActivityAt timestamp to keep it alive.
   */
  async refreshSession(sessionId: string) {
    return this.prisma.activeSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  /**
   * Revoke a single session by marking it as revoked.
   */
  async revokeSession(sessionId: string) {
    const session = await this.prisma.activeSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      userId: session.userId,
      action: 'SESSION_REVOKED',
      entityType: 'ActiveSession',
      entityId: session.id,
    });

    return session;
  }

  /**
   * Revoke all active sessions for a given user.
   */
  async revokeAllSessions(userId: string) {
    const result = await this.prisma.activeSession.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      userId,
      action: 'ALL_SESSIONS_REVOKED',
      entityType: 'ActiveSession',
      entityId: userId,
      newValues: { revokedCount: result.count },
    });

    return result;
  }

  /**
   * Delete sessions that have passed their expiresAt timestamp.
   * Intended to be called by a scheduled cron job.
   */
  async cleanExpiredSessions() {
    const result = await this.prisma.activeSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired session(s)`);
    }

    return result;
  }

  /**
   * List all active (non-revoked, non-expired) sessions for a user.
   */
  async getActiveSessions(userId: string) {
    return this.prisma.activeSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  /**
   * Validate a session token.
   * Checks that the session exists, is not revoked, and has not expired.
   * On success, updates lastActivityAt to extend the session.
   * Returns the session record if valid, or null if invalid.
   */
  async validateSession(token: string) {
    const session = await this.prisma.activeSession.findFirst({
      where: { token },
    });

    if (!session) {
      return null;
    }

    if (session.isRevoked) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      return null;
    }

    // Extend the session on successful validation
    const updatedSession = await this.prisma.activeSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    return updatedSession;
  }
}
