import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Logs mutating API calls (POST, PUT, PATCH, DELETE) to the audit_logs table.
 * Apply selectively to controllers that need audit trails.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    // Only audit mutating requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const user = request.user as { sub?: string } | undefined;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              userId: user?.sub || null,
              action: `${controllerName}.${handlerName}`,
              entityType: controllerName.replace('Controller', ''),
              entityId: (request.params?.id as string) || 'N/A',
              newValues: responseData ? JSON.parse(JSON.stringify(responseData)) : null,
              ipAddress: request.ip || request.socket.remoteAddress,
              userAgent: request.headers['user-agent'] || null,
            },
          });
        } catch {
          // Don't let audit logging failures break the request
          console.error('Audit log write failed');
        }
      }),
    );
  }
}
