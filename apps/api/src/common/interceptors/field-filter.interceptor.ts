import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  FIELD_ACCESS_RULES,
  RoleType,
  FieldAccessRule,
  RESTRICTED_FROM_OEM,
  ADMIN_ONLY,
  SENSITIVE,
  hasFullAccess,
} from '../config/field-access.config';
import { FILTER_FIELDS_KEY, FilterFieldsOptions } from '../decorators/filter-fields.decorator';

/**
 * User interface for request user object
 */
interface RequestUser {
  sub?: string;
  role?: RoleType;
  userId?: string;
}

/**
 * Field Filter Interceptor
 *
 * Filters response fields based on user role and endpoint configuration.
 * Supports:
 * - Role-based field exclusion
 * - Sensitive field masking
 * - Recursive filtering of nested objects and arrays
 * - Per-endpoint configuration via @FilterFields() decorator
 *
 * Rules:
 * - OEM: Cannot see internal notes, evaluation scores, reviewer comments, or audit history
 * - OFFICER: Can see all fields except ADMIN-only fields
 * - COMMITTEE: Can see evaluation-related fields but not system logs or audit history
 * - ADMIN/SUPER_ADMIN: Can see everything
 */
@Injectable()
export class FieldFilterInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    const role = user?.role;

    // Get endpoint-specific configuration from @FilterFields() decorator
    const endpointOptions = this.reflector.getAllAndOverride<FilterFieldsOptions | undefined>(
      FILTER_FIELDS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no role, return data unfiltered (unauthenticated requests handled by guards)
    if (!role) {
      return next.handle();
    }

    // ADMIN and SUPER_ADMIN see everything (unless endpoint specifies otherwise)
    if (hasFullAccess(role) && !endpointOptions) {
      return next.handle();
    }

    return next
      .handle()
      .pipe(map((data) => this.filterData(data, role, user?.sub, endpointOptions)));
  }

  /**
   * Filter data based on role and configuration
   */
  private filterData(
    data: unknown,
    role: RoleType,
    userId?: string,
    endpointOptions?: FilterFieldsOptions,
  ): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.filterData(item, role, userId, endpointOptions));
    }

    // Handle objects
    if (typeof data === 'object' && data !== null) {
      return this.filterObject(data as Record<string, unknown>, role, userId, endpointOptions);
    }

    // Primitive values pass through
    return data;
  }

  /**
   * Filter object fields based on role and configuration
   */
  private filterObject(
    obj: Record<string, unknown>,
    role: RoleType,
    userId?: string,
    endpointOptions?: FilterFieldsOptions,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Determine entity type from object (if it has a type indicator)
    const entityType = this.detectEntityType(obj);

    // Get rules for this entity and role
    const entityRule = entityType ? FIELD_ACCESS_RULES[entityType]?.[role] : undefined;

    // Build combined exclusion and mask lists
    const excludeFields = this.buildExcludeList(role, entityRule, endpointOptions);
    const maskFields = this.buildMaskList(role, entityRule, endpointOptions, obj, userId);

    // If include list is specified, use whitelist mode
    const includeFields = endpointOptions?.include;

    for (const [key, value] of Object.entries(obj)) {
      // Whitelist mode: only include specified fields
      if (includeFields && includeFields.length > 0) {
        if (!includeFields.includes(key)) {
          continue;
        }
      }

      // Skip excluded fields
      if (excludeFields.has(key)) {
        continue;
      }

      // Mask sensitive fields
      if (maskFields.has(key)) {
        result[key] = this.maskValue(value);
        continue;
      }

      // Recursively filter nested objects and arrays
      result[key] = this.filterData(value, role, userId, endpointOptions);
    }

    return result;
  }

  /**
   * Detect entity type from object structure
   */
  private detectEntityType(obj: Record<string, unknown>): string | undefined {
    // Check for explicit entity type marker
    if (typeof obj.__entityType === 'string') {
      return obj.__entityType;
    }

    // Heuristic detection based on common field patterns
    if ('applicationNumber' in obj || 'applicationType' in obj) {
      return 'Application';
    }
    if ('email' in obj && 'passwordHash' in obj) {
      return 'User';
    }
    if ('paymentType' in obj && 'razorpayOrderId' in obj) {
      return 'Payment';
    }
    if ('evaluationScore' in obj && 'evaluatorId' in obj) {
      return 'Evaluation';
    }
    if ('action' in obj && 'severity' in obj && 'category' in obj) {
      return 'AuditLog';
    }

    return undefined;
  }

  /**
   * Build the set of fields to exclude based on role and configuration
   */
  private buildExcludeList(
    role: RoleType,
    entityRule?: FieldAccessRule,
    endpointOptions?: FilterFieldsOptions,
  ): Set<string> {
    const excludeFields = new Set<string>();

    // Add role-based exclusions
    if (!hasFullAccess(role)) {
      // OEM restrictions
      if (role === 'OEM') {
        RESTRICTED_FROM_OEM.forEach((field) => excludeFields.add(field));
        ADMIN_ONLY.forEach((field) => excludeFields.add(field));
      }

      // Non-admin restrictions
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        ADMIN_ONLY.forEach((field) => excludeFields.add(field));
      }
    }

    // Add entity-specific exclusions
    if (entityRule?.exclude) {
      entityRule.exclude.forEach((field) => excludeFields.add(field));
    }

    // Add endpoint-specific exclusions
    if (endpointOptions?.exclude) {
      endpointOptions.exclude.forEach((field) => excludeFields.add(field));
    }

    return excludeFields;
  }

  /**
   * Build the set of fields to mask based on role and configuration
   */
  private buildMaskList(
    role: RoleType,
    entityRule?: FieldAccessRule,
    endpointOptions?: FilterFieldsOptions,
    obj?: Record<string, unknown>,
    userId?: string,
  ): Set<string> {
    const maskFields = new Set<string>();

    // ADMIN and SUPER_ADMIN don't need masking
    if (hasFullAccess(role)) {
      // Still apply endpoint-specific masking if explicitly configured
      if (endpointOptions?.mask) {
        endpointOptions.mask.forEach((field) => maskFields.add(field));
      }
      return maskFields;
    }

    // Check if user is the owner of this record
    const isOwner = this.checkOwnership(obj, userId);

    // Sensitive fields are masked for non-owners
    if (!isOwner) {
      SENSITIVE.forEach((field) => maskFields.add(field));
    }

    // Add entity-specific masking
    if (entityRule?.mask) {
      entityRule.mask.forEach((field) => {
        // Only mask if not owner
        if (!isOwner) {
          maskFields.add(field);
        }
      });
    }

    // Add endpoint-specific masking
    if (endpointOptions?.mask) {
      endpointOptions.mask.forEach((field) => maskFields.add(field));
    }

    return maskFields;
  }

  /**
   * Check if the current user owns this record
   */
  private checkOwnership(obj?: Record<string, unknown>, userId?: string): boolean {
    if (!obj || !userId) {
      return false;
    }

    // Check common ownership fields
    const ownerFields = ['userId', 'ownerId', 'createdBy', 'applicantId'];
    for (const field of ownerFields) {
      if (obj[field] === userId) {
        return true;
      }
    }

    // Check nested user object
    if (typeof obj.user === 'object' && obj.user !== null) {
      const user = obj.user as Record<string, unknown>;
      if (user.id === userId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mask a sensitive value, showing only the last 4 characters
   */
  private maskValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '****';
    }

    const strValue = String(value);
    if (strValue.length <= 4) {
      return '****';
    }

    const visiblePart = strValue.slice(-4);
    const maskedPart = '*'.repeat(Math.min(strValue.length - 4, 8));
    return maskedPart + visiblePart;
  }
}
