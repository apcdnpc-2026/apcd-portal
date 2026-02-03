import { DelegationType } from '@apcd/database';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DelegationService } from '../../modules/delegation/delegation.service';
import { ALLOW_DELEGATED_KEY } from '../decorators/delegation.decorator';

/**
 * Guard that checks whether a user is acting under delegation.
 *
 * If the request includes an `x-acting-as` header (containing the target
 * user's ID), this guard verifies that the current user (actor) has an
 * active delegation from that target user.
 *
 * The endpoint must be decorated with @AllowDelegated() for delegated
 * access to be permitted. Without the decorator, any `x-acting-as` header
 * is rejected.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, RolesGuard, DelegationGuard)
 *   @AllowDelegated()
 *   @Get('some-endpoint')
 *   handler() { ... }
 */
@Injectable()
export class DelegationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly delegationService: DelegationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const actingAs = request.headers['x-acting-as'] as string | undefined;

    // No delegation header -- normal access, allow through
    if (!actingAs) {
      return true;
    }

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if the endpoint allows delegated access
    const allowDelegated = this.reflector.getAllAndOverride<true | DelegationType[] | undefined>(
      ALLOW_DELEGATED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowDelegated) {
      throw new ForbiddenException('This endpoint does not accept delegated access');
    }

    // Verify active delegation exists
    const isActing = await this.delegationService.isActingAs(user.sub, actingAs);

    if (!isActing) {
      throw new ForbiddenException('No active delegation found from the specified user');
    }

    // If specific delegation types are required, verify the type matches
    if (Array.isArray(allowDelegated) && allowDelegated.length > 0) {
      const effectiveRole = await this.delegationService.getEffectiveRole(user.sub);

      if (!effectiveRole || !allowDelegated.includes(effectiveRole.delegationType)) {
        throw new ForbiddenException(
          `Delegation type not permitted for this endpoint. Allowed: ${allowDelegated.join(', ')}`,
        );
      }
    }

    // Attach delegation context to the request for downstream handlers
    request.delegatedFrom = actingAs;

    return true;
  }
}
