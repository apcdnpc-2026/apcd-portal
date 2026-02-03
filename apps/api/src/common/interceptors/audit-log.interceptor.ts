import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import {
  AuditLogService,
  AuditCategory,
  AuditSeverity,
} from '../../modules/audit-log/audit-log.service';

/**
 * Enhanced audit-log interceptor that captures detailed metadata for every
 * mutating API call (POST, PUT, PATCH, DELETE).
 *
 * Features:
 * - IP address and User-Agent capture
 * - User role and session ID from JWT payload
 * - Auto-classification of category based on route path
 * - Auto-classification of severity based on action context
 * - Old/new value capture for UPDATE operations
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Only audit mutating requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const user = request.user as { sub?: string; role?: string; sessionId?: string } | undefined;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    const ipAddress =
      (request.headers['x-forwarded-for'] as string) ||
      request.ip ||
      request.socket?.remoteAddress ||
      null;
    const userAgent = (request.headers['user-agent'] as string) || null;
    const userRole = user?.role || null;
    const sessionId = user?.sessionId || null;

    const routePath = request.route?.path || request.path || '';
    const category = this.classifyCategory(routePath);
    const severity = this.classifySeverity(routePath, method, handlerName);

    const entityType = controllerName.replace('Controller', '');
    const entityId = (request.params?.id as string) || 'N/A';

    // For UPDATE operations, try to capture old values before mutation
    let oldValuesPromise: Promise<Record<string, any> | null> = Promise.resolve(null);
    if (['PUT', 'PATCH'].includes(method) && entityId && entityId !== 'N/A') {
      oldValuesPromise = this.fetchOldValues(entityType, entityId);
    }

    return new Observable((subscriber) => {
      oldValuesPromise
        .then((oldValues) => {
          next
            .handle()
            .pipe(
              tap(async (responseData) => {
                try {
                  const newValues = responseData ? JSON.parse(JSON.stringify(responseData)) : null;

                  await this.auditLogService.log({
                    userId: user?.sub,
                    userRole: userRole || undefined,
                    sessionId: sessionId || undefined,
                    action: `${controllerName}.${handlerName}`,
                    category,
                    severity,
                    entityType,
                    entityId,
                    oldValues: oldValues || undefined,
                    newValues: newValues || undefined,
                    ipAddress: ipAddress || undefined,
                    userAgent: userAgent || undefined,
                  });
                } catch (error) {
                  // Don't let audit logging failures break the request
                  this.logger.error('Audit log write failed', error);
                }
              }),
            )
            .subscribe({
              next: (value) => subscriber.next(value),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
        })
        .catch((err) => {
          // If fetching old values fails, proceed without them
          this.logger.warn('Failed to fetch old values for audit log', err);
          next
            .handle()
            .pipe(
              tap(async (responseData) => {
                try {
                  const newValues = responseData ? JSON.parse(JSON.stringify(responseData)) : null;

                  await this.auditLogService.log({
                    userId: user?.sub,
                    userRole: userRole || undefined,
                    sessionId: sessionId || undefined,
                    action: `${controllerName}.${handlerName}`,
                    category,
                    severity,
                    entityType,
                    entityId,
                    newValues: newValues || undefined,
                    ipAddress: ipAddress || undefined,
                    userAgent: userAgent || undefined,
                  });
                } catch (error) {
                  this.logger.error('Audit log write failed', error);
                }
              }),
            )
            .subscribe({
              next: (value) => subscriber.next(value),
              error: (err2) => subscriber.error(err2),
              complete: () => subscriber.complete(),
            });
        });
    });
  }

  /**
   * Classify the audit category based on the route path.
   */
  private classifyCategory(routePath: string): AuditCategory {
    const path = routePath.toLowerCase();

    if (path.includes('/applications') || path.includes('/application')) return 'APPLICATION';
    if (path.includes('/attachments') || path.includes('/documents') || path.includes('/upload'))
      return 'DOCUMENT';
    if (path.includes('/payments') || path.includes('/payment')) return 'PAYMENT';
    if (path.includes('/users') || path.includes('/admin')) return 'USER';
    if (path.includes('/committee') || path.includes('/evaluation')) return 'EVALUATION';
    if (path.includes('/field-verification') || path.includes('/field-verif'))
      return 'FIELD_VERIFICATION';
    if (path.includes('/certificates') || path.includes('/certificate')) return 'CERTIFICATE';
    if (path.includes('/queries') || path.includes('/verification')) return 'QUERY';
    if (path.includes('/notifications') || path.includes('/notification')) return 'NOTIFICATION';

    return 'GENERAL';
  }

  /**
   * Classify severity based on the action context.
   * - Status changes, payments, certificates -> CRITICAL
   * - Queries, evaluations -> WARNING
   * - Everything else -> INFO
   */
  private classifySeverity(routePath: string, method: string, handlerName: string): AuditSeverity {
    const path = routePath.toLowerCase();
    const handler = handlerName.toLowerCase();

    // CRITICAL: status changes, payments, certificates, deletions
    if (handler.includes('status') || handler.includes('transition')) return 'CRITICAL';
    if (path.includes('/payments') || path.includes('/payment')) return 'CRITICAL';
    if (path.includes('/certificates') || path.includes('/certificate')) return 'CRITICAL';
    if (method === 'DELETE') return 'CRITICAL';

    // WARNING: queries, evaluations, committee actions
    if (path.includes('/queries') || path.includes('/query')) return 'WARNING';
    if (path.includes('/committee') || path.includes('/evaluation')) return 'WARNING';
    if (path.includes('/field-verification')) return 'WARNING';

    return 'INFO';
  }

  /**
   * Attempt to fetch old values for an entity before mutation.
   * Uses a best-effort approach based on the entity type.
   */
  private async fetchOldValues(
    entityType: string,
    entityId: string,
  ): Promise<Record<string, any> | null> {
    try {
      const modelName = this.resolveModelName(entityType);
      if (!modelName) return null;

      const model = (this.auditLogService as any).prisma?.[modelName];
      if (!model || typeof model.findUnique !== 'function') return null;

      const existing = await model.findUnique({ where: { id: entityId } });
      return existing ? JSON.parse(JSON.stringify(existing)) : null;
    } catch {
      // Silently fail -- old value capture is best-effort
      return null;
    }
  }

  /**
   * Map controller-derived entity type names to Prisma model names.
   */
  private resolveModelName(entityType: string): string | null {
    const mapping: Record<string, string> = {
      Application: 'application',
      Applications: 'application',
      Payment: 'payment',
      Payments: 'payment',
      User: 'user',
      Users: 'user',
      Certificate: 'certificate',
      Certificates: 'certificate',
      Attachment: 'attachment',
      Attachments: 'attachment',
      Query: 'query',
      Queries: 'query',
      Committee: 'committeeEvaluation',
      FieldVerification: 'fieldVerification',
      Notification: 'notification',
      Notifications: 'notification',
    };

    return mapping[entityType] || null;
  }
}
