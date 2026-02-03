import { DelegationType } from '@apcd/database';
import { SetMetadata } from '@nestjs/common';

export const ALLOW_DELEGATED_KEY = 'allowDelegated';

/**
 * Marks an endpoint as accessible by delegated users.
 * Optionally restricts to specific delegation types.
 *
 * Usage:
 *   @AllowDelegated()                          // any delegation type
 *   @AllowDelegated(DelegationType.LEAVE)      // only LEAVE delegations
 */
export const AllowDelegated = (...types: DelegationType[]) =>
  SetMetadata(ALLOW_DELEGATED_KEY, types.length > 0 ? types : true);
