import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Condition types for alert rule matching.
 */
export interface AlertCondition {
  /** Regex pattern to match action field */
  actionPattern?: string;
  /** Exact match for entity type */
  entityType?: string;
  /** Minimum severity level to trigger */
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  /** User role to match */
  userRole?: string;
  /** Time-based condition: after hours (22:00-06:00) */
  afterHours?: boolean;
  /** Bulk operation detection: count threshold */
  bulkThreshold?: number;
  /** Bulk operation detection: time window in seconds */
  bulkTimeWindowSeconds?: number;
  /** Bulk operation detection: action to monitor */
  bulkAction?: string;
}

/**
 * Alert rule definition.
 */
export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  condition: AlertCondition;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  notifyEmail?: string;
  notifyWebhook?: string;
}

/**
 * Audit log entry shape for rule evaluation.
 */
export interface AuditLogForEvaluation {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  userRole?: string | null;
  severity: string;
  createdAt: Date;
}

/**
 * Alert triggered by a rule match.
 */
export interface TriggeredAlert {
  rule: AlertRule;
  auditLog: AuditLogForEvaluation;
  triggeredAt: Date;
  details: string;
}

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger(AlertRulesService.name);

  /**
   * Predefined alert rules.
   * In production, these could be stored in a database table.
   */
  private readonly predefinedRules: AlertRule[] = [
    {
      id: 'CRITICAL_ACTION',
      name: 'Critical Action Alert',
      description: 'Triggers when any audit log has CRITICAL severity',
      condition: {
        severity: 'CRITICAL',
      },
      severity: 'CRITICAL',
      enabled: true,
    },
    {
      id: 'AFTER_HOURS_ADMIN',
      name: 'After Hours Admin Activity',
      description: 'Triggers when ADMIN performs actions between 10pm and 6am',
      condition: {
        userRole: 'ADMIN',
        afterHours: true,
      },
      severity: 'HIGH',
      enabled: true,
    },
    {
      id: 'BULK_DELETE',
      name: 'Bulk Delete Detection',
      description: 'Triggers when multiple DELETE actions occur in a short time',
      condition: {
        bulkAction: 'DELETE',
        bulkThreshold: 10,
        bulkTimeWindowSeconds: 60,
      },
      severity: 'HIGH',
      enabled: true,
    },
    {
      id: 'SUPER_ADMIN_ACTIVITY',
      name: 'Super Admin Activity',
      description: 'Triggers on any SUPER_ADMIN action for monitoring',
      condition: {
        userRole: 'SUPER_ADMIN',
      },
      severity: 'MEDIUM',
      enabled: true,
    },
    {
      id: 'SENSITIVE_DATA_ACCESS',
      name: 'Sensitive Data Access',
      description: 'Triggers on access to sensitive entities like payments',
      condition: {
        entityType: 'Payment',
        actionPattern: '^(VIEW|EXPORT|DOWNLOAD)',
      },
      severity: 'MEDIUM',
      enabled: true,
    },
  ];

  /**
   * Custom rules added at runtime (in-memory storage).
   * In production, these would be persisted to database.
   */
  private customRules: AlertRule[] = [];

  /**
   * Recent action cache for bulk detection.
   * Key: action type, Value: array of timestamps
   */
  private recentActions: Map<string, Date[]> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Evaluate all active rules against an audit log entry.
   * Returns array of triggered alerts.
   */
  async evaluateRules(auditLog: AuditLogForEvaluation): Promise<TriggeredAlert[]> {
    const activeRules = this.getActiveRules();
    const triggeredAlerts: TriggeredAlert[] = [];

    for (const rule of activeRules) {
      const matchResult = await this.matchesCondition(rule.condition, auditLog);
      if (matchResult.matches) {
        const alert: TriggeredAlert = {
          rule,
          auditLog,
          triggeredAt: new Date(),
          details: matchResult.details,
        };
        triggeredAlerts.push(alert);
        await this.triggerAlert(rule, auditLog, matchResult.details);
      }
    }

    // Update recent actions cache for bulk detection
    this.updateRecentActionsCache(auditLog);

    return triggeredAlerts;
  }

  /**
   * Get all enabled alert rules.
   */
  getActiveRules(): AlertRule[] {
    const allRules = [...this.predefinedRules, ...this.customRules];
    return allRules.filter((rule) => rule.enabled);
  }

  /**
   * Get all rules including disabled ones.
   */
  getAllRules(): AlertRule[] {
    return [...this.predefinedRules, ...this.customRules];
  }

  /**
   * Create a new custom alert rule.
   */
  createRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const newRule: AlertRule = {
      ...rule,
      id: `CUSTOM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    this.customRules.push(newRule);
    this.logger.log(`Created new alert rule: ${newRule.name} (${newRule.id})`);
    return newRule;
  }

  /**
   * Update an existing rule.
   */
  updateRule(id: string, updates: Partial<Omit<AlertRule, 'id'>>): AlertRule | null {
    // Check custom rules first
    const customIndex = this.customRules.findIndex((r) => r.id === id);
    if (customIndex >= 0) {
      this.customRules[customIndex] = { ...this.customRules[customIndex], ...updates };
      return this.customRules[customIndex];
    }

    // Check predefined rules (can only enable/disable)
    const predefinedIndex = this.predefinedRules.findIndex((r) => r.id === id);
    if (predefinedIndex >= 0) {
      if (updates.enabled !== undefined) {
        this.predefinedRules[predefinedIndex].enabled = updates.enabled;
      }
      return this.predefinedRules[predefinedIndex];
    }

    return null;
  }

  /**
   * Delete a custom rule (predefined rules cannot be deleted).
   */
  deleteRule(id: string): boolean {
    const index = this.customRules.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.customRules.splice(index, 1);
      this.logger.log(`Deleted alert rule: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Trigger an alert for a matched rule.
   * Logs the alert and (placeholder) sends notifications.
   */
  async triggerAlert(
    rule: AlertRule,
    auditLog: AuditLogForEvaluation,
    details: string,
  ): Promise<void> {
    this.logger.warn(`ALERT TRIGGERED: [${rule.severity}] ${rule.name} - ${details}`, {
      ruleId: rule.id,
      auditLogId: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      userId: auditLog.userId,
    });

    // Placeholder for email notification
    if (rule.notifyEmail) {
      this.logger.log(`[PLACEHOLDER] Would send email to: ${rule.notifyEmail}`);
      // TODO: Integrate with notification service
      // await this.notificationService.sendEmail(rule.notifyEmail, subject, body);
    }

    // Placeholder for webhook notification
    if (rule.notifyWebhook) {
      this.logger.log(`[PLACEHOLDER] Would call webhook: ${rule.notifyWebhook}`);
      // TODO: Integrate with HTTP service for webhook calls
      // await this.httpService.post(rule.notifyWebhook, alertPayload);
    }

    // Log alert to database for audit purposes
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'ALERT_TRIGGERED',
          entityType: 'AlertRule',
          entityId: rule.id,
          category: 'SYSTEM',
          severity: 'WARNING',
          newValues: {
            ruleName: rule.name,
            ruleSeverity: rule.severity,
            triggeredByLogId: auditLog.id,
            triggeredByAction: auditLog.action,
            details,
          },
        },
      });
    } catch (error: unknown) {
      this.logger.error('Failed to log alert to database', error);
    }
  }

  /**
   * Check if an audit log matches a rule condition.
   */
  private async matchesCondition(
    condition: AlertCondition,
    auditLog: AuditLogForEvaluation,
  ): Promise<{ matches: boolean; details: string }> {
    const matchReasons: string[] = [];

    // Check action pattern (regex)
    if (condition.actionPattern) {
      const regex = new RegExp(condition.actionPattern, 'i');
      if (!regex.test(auditLog.action)) {
        return { matches: false, details: '' };
      }
      matchReasons.push(`Action matches pattern: ${condition.actionPattern}`);
    }

    // Check entity type
    if (condition.entityType) {
      if (auditLog.entityType !== condition.entityType) {
        return { matches: false, details: '' };
      }
      matchReasons.push(`Entity type: ${condition.entityType}`);
    }

    // Check severity
    if (condition.severity) {
      if (auditLog.severity !== condition.severity) {
        return { matches: false, details: '' };
      }
      matchReasons.push(`Severity: ${condition.severity}`);
    }

    // Check user role
    if (condition.userRole) {
      if (auditLog.userRole !== condition.userRole) {
        return { matches: false, details: '' };
      }
      matchReasons.push(`User role: ${condition.userRole}`);
    }

    // Check after hours (22:00 - 06:00)
    if (condition.afterHours) {
      const hour = auditLog.createdAt.getHours();
      const isAfterHours = hour >= 22 || hour < 6;
      if (!isAfterHours) {
        return { matches: false, details: '' };
      }
      matchReasons.push(`After hours activity at ${hour}:00`);
    }

    // Check bulk operations
    if (condition.bulkAction && condition.bulkThreshold && condition.bulkTimeWindowSeconds) {
      const isBulk = await this.checkBulkOperation(
        condition.bulkAction,
        auditLog,
        condition.bulkThreshold,
        condition.bulkTimeWindowSeconds,
      );
      if (!isBulk.matches) {
        return { matches: false, details: '' };
      }
      matchReasons.push(isBulk.details);
    }

    // If we have no conditions, don't match
    if (matchReasons.length === 0) {
      return { matches: false, details: '' };
    }

    return {
      matches: true,
      details: matchReasons.join('; '),
    };
  }

  /**
   * Check if we're in a bulk operation scenario.
   */
  private async checkBulkOperation(
    actionPattern: string,
    auditLog: AuditLogForEvaluation,
    threshold: number,
    timeWindowSeconds: number,
  ): Promise<{ matches: boolean; details: string }> {
    // Check if current action matches the pattern
    if (!auditLog.action.includes(actionPattern)) {
      return { matches: false, details: '' };
    }

    // Get recent actions from cache
    const cacheKey = actionPattern;
    const recentTimes = this.recentActions.get(cacheKey) || [];

    // Clean up old entries
    const cutoff = new Date(Date.now() - timeWindowSeconds * 1000);
    const validTimes = recentTimes.filter((t) => t > cutoff);

    // Count including current action
    const count = validTimes.length + 1;

    if (count >= threshold) {
      return {
        matches: true,
        details: `Bulk ${actionPattern} detected: ${count} operations in ${timeWindowSeconds} seconds`,
      };
    }

    return { matches: false, details: '' };
  }

  /**
   * Update the recent actions cache with a new audit log entry.
   */
  private updateRecentActionsCache(auditLog: AuditLogForEvaluation): void {
    // Extract action type (e.g., DELETE from APPLICATION_DELETED)
    const actionTypes = ['DELETE', 'CREATE', 'UPDATE', 'EXPORT'];

    for (const actionType of actionTypes) {
      if (auditLog.action.includes(actionType)) {
        const times = this.recentActions.get(actionType) || [];
        times.push(auditLog.createdAt);

        // Keep only last 5 minutes of data
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        const validTimes = times.filter((t) => t > cutoff);

        this.recentActions.set(actionType, validTimes);
      }
    }
  }
}
