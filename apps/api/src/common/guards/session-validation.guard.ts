import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import { SessionSecurityService } from '../../modules/session/session-security.service';

@Injectable()
export class SessionValidationGuard implements CanActivate {
  constructor(private sessionSecurityService: SessionSecurityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No session token provided');
    }

    const session = await this.sessionSecurityService.validateSession(token);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session. Please log in again.');
    }

    return true;
  }

  /**
   * Extract the session token from the Authorization header (Bearer scheme)
   * or from a cookie named 'session_token'.
   */
  private extractToken(request: Request): string | null {
    // Try Authorization header first
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        return token;
      }
    }

    // Fall back to cookie
    const cookies = request.cookies as Record<string, string> | undefined;
    if (cookies?.session_token) {
      return cookies.session_token;
    }

    return null;
  }
}
