import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for field filtering configuration
 */
export const FILTER_FIELDS_KEY = 'filterFields';

/**
 * Options for field filtering on a per-endpoint basis
 */
export interface FilterFieldsOptions {
  /**
   * Fields to exclude from the response
   */
  exclude?: string[];

  /**
   * Fields to include in the response (if specified, only these fields are returned)
   */
  include?: string[];

  /**
   * Fields to mask in the response (show last 4 characters only)
   */
  mask?: string[];
}

/**
 * Decorator to configure field-level filtering for an endpoint.
 *
 * Usage:
 *   @FilterFields()                                     // Use default role-based rules
 *   @FilterFields({ exclude: ['password', 'secret'] })  // Exclude specific fields
 *   @FilterFields({ mask: ['panNumber'] })              // Mask specific fields
 *
 * @param options - Optional filtering configuration
 */
export const FilterFields = (options?: FilterFieldsOptions) =>
  SetMetadata(FILTER_FIELDS_KEY, options ?? {});
