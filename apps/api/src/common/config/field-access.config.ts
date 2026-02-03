/**
 * Field Access Control Configuration
 *
 * Defines role-based field visibility rules for different entity types.
 * Used by FieldFilterInterceptor to filter response data based on user role.
 */

/**
 * Role type matching the database Role enum
 */
export type RoleType =
  | 'OEM'
  | 'OFFICER'
  | 'COMMITTEE'
  | 'FIELD_VERIFIER'
  | 'DEALING_HAND'
  | 'ADMIN'
  | 'SUPER_ADMIN';

/**
 * Field access rule for a specific role
 */
export interface FieldAccessRule {
  /**
   * Fields to exclude from the response for this role
   */
  exclude: string[];

  /**
   * Fields to mask (show last 4 characters) for this role
   */
  mask?: string[];
}

/**
 * Entity-level field access rules mapping roles to their access rules
 */
export type EntityFieldRules = Partial<Record<RoleType, FieldAccessRule>>;

/**
 * Complete field access configuration mapping entity types to their rules
 */
export type FieldAccessConfig = Record<string, EntityFieldRules>;

/**
 * Fields restricted from OEM users (internal use only)
 */
export const RESTRICTED_FROM_OEM = [
  'internalNotes',
  'evaluationScore',
  'reviewerComments',
  'auditHistory',
] as const;

/**
 * Fields only accessible by ADMIN and SUPER_ADMIN
 */
export const ADMIN_ONLY = ['ipAddress', 'userAgent', 'sessionId', 'systemLogs'] as const;

/**
 * Sensitive fields that should be masked for non-owners
 */
export const SENSITIVE = ['aadhaarNumber', 'panNumber'] as const;

/**
 * Role-based field access rules by entity type
 */
export const FIELD_ACCESS_RULES: FieldAccessConfig = {
  /**
   * Application entity field rules
   */
  Application: {
    OEM: {
      exclude: [
        'internalNotes',
        'evaluationScore',
        'reviewerComments',
        'auditHistory',
        'ipAddress',
        'userAgent',
        'sessionId',
        'systemLogs',
      ],
      mask: ['panNumber'],
    },
    OFFICER: {
      exclude: ['systemLogs'],
      mask: [],
    },
    COMMITTEE: {
      exclude: ['systemLogs', 'auditHistory'],
      mask: [],
    },
    FIELD_VERIFIER: {
      exclude: ['internalNotes', 'evaluationScore', 'systemLogs', 'auditHistory'],
      mask: ['panNumber', 'aadhaarNumber'],
    },
    DEALING_HAND: {
      exclude: [
        'internalNotes',
        'evaluationScore',
        'reviewerComments',
        'systemLogs',
        'auditHistory',
      ],
      mask: [],
    },
    ADMIN: {
      exclude: [],
      mask: [],
    },
    SUPER_ADMIN: {
      exclude: [],
      mask: [],
    },
  },

  /**
   * User entity field rules
   */
  User: {
    OEM: {
      exclude: ['ipAddress', 'sessionHistory', 'systemLogs', 'internalNotes', 'auditHistory'],
      mask: ['aadhaarNumber'],
    },
    OFFICER: {
      exclude: ['systemLogs'],
      mask: ['aadhaarNumber'],
    },
    COMMITTEE: {
      exclude: ['systemLogs', 'sessionHistory'],
      mask: ['aadhaarNumber'],
    },
    FIELD_VERIFIER: {
      exclude: ['systemLogs', 'sessionHistory', 'internalNotes'],
      mask: ['aadhaarNumber', 'panNumber'],
    },
    DEALING_HAND: {
      exclude: ['systemLogs', 'sessionHistory', 'internalNotes'],
      mask: ['aadhaarNumber'],
    },
    ADMIN: {
      exclude: [],
      mask: [],
    },
    SUPER_ADMIN: {
      exclude: [],
      mask: [],
    },
  },

  /**
   * Payment entity field rules
   */
  Payment: {
    OEM: {
      exclude: ['internalNotes', 'auditHistory', 'ipAddress', 'systemLogs'],
      mask: [],
    },
    OFFICER: {
      exclude: ['systemLogs'],
      mask: [],
    },
    COMMITTEE: {
      exclude: ['systemLogs', 'auditHistory'],
      mask: [],
    },
    FIELD_VERIFIER: {
      exclude: ['internalNotes', 'auditHistory', 'systemLogs'],
      mask: [],
    },
    DEALING_HAND: {
      exclude: ['systemLogs'],
      mask: [],
    },
    ADMIN: {
      exclude: [],
      mask: [],
    },
    SUPER_ADMIN: {
      exclude: [],
      mask: [],
    },
  },

  /**
   * Evaluation entity field rules
   */
  Evaluation: {
    OEM: {
      exclude: ['internalNotes', 'reviewerComments', 'auditHistory', 'systemLogs'],
      mask: [],
    },
    OFFICER: {
      exclude: ['systemLogs'],
      mask: [],
    },
    COMMITTEE: {
      exclude: ['systemLogs'],
      mask: [],
    },
    FIELD_VERIFIER: {
      exclude: ['internalNotes', 'reviewerComments', 'systemLogs'],
      mask: [],
    },
    DEALING_HAND: {
      exclude: ['internalNotes', 'reviewerComments', 'evaluationScore', 'systemLogs'],
      mask: [],
    },
    ADMIN: {
      exclude: [],
      mask: [],
    },
    SUPER_ADMIN: {
      exclude: [],
      mask: [],
    },
  },

  /**
   * AuditLog entity field rules
   */
  AuditLog: {
    OEM: {
      exclude: ['ipAddress', 'userAgent', 'sessionId', 'systemLogs', 'internalNotes'],
      mask: [],
    },
    OFFICER: {
      exclude: ['systemLogs'],
      mask: [],
    },
    COMMITTEE: {
      exclude: ['ipAddress', 'userAgent', 'sessionId', 'systemLogs'],
      mask: [],
    },
    FIELD_VERIFIER: {
      exclude: ['ipAddress', 'userAgent', 'sessionId', 'systemLogs', 'internalNotes'],
      mask: [],
    },
    DEALING_HAND: {
      exclude: ['ipAddress', 'userAgent', 'sessionId', 'systemLogs', 'internalNotes'],
      mask: [],
    },
    ADMIN: {
      exclude: [],
      mask: [],
    },
    SUPER_ADMIN: {
      exclude: [],
      mask: [],
    },
  },
};

/**
 * Get field access rules for a specific entity and role
 *
 * @param entityType - The entity type (e.g., 'Application', 'User')
 * @param role - The user's role
 * @returns Field access rule or undefined if no rules defined
 */
export function getFieldAccessRule(
  entityType: string,
  role: RoleType,
): FieldAccessRule | undefined {
  const entityRules = FIELD_ACCESS_RULES[entityType];
  if (!entityRules) {
    return undefined;
  }
  return entityRules[role];
}

/**
 * Check if a role has full access (no restrictions)
 *
 * @param role - The user's role
 * @returns True if the role has full access
 */
export function hasFullAccess(role: RoleType): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
