import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface ActionCount {
  action: string;
  count: number;
}

export interface EntityCount {
  entity: string;
  count: number;
}

export interface Anomaly {
  type: 'AFTER_HOURS' | 'BULK_OPERATION' | 'FAILED_ACCESS' | 'SUSPICIOUS_PATTERN';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
  userId?: string;
  details: Record<string, unknown>;
}

export interface RTIReport {
  period: { start: Date; end: Date };
  totalEntries: number;
  byAction: ActionCount[];
  byEntity: EntityCount[];
  criticalEvents: Array<Record<string, unknown>>;
  summary: string;
}

export interface MonthlyBreakdown {
  month: string;
  totalActions: number;
  byCategory: Record<string, number>;
}

export interface CAGReport {
  financialYear: string;
  monthlyBreakdown: MonthlyBreakdown[];
  paymentAudit: Array<Record<string, unknown>>;
  statusTransitions: Array<Record<string, unknown>>;
  userActivitySummary: Array<{ userId: string; role: string; actionCount: number }>;
}

export interface ComplianceReport {
  period: { start: Date; end: Date };
  totalActions: number;
  anomalies: Anomaly[];
  complianceScore: number;
  recommendations: string[];
}

@Injectable()
export class AuditReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate RTI (Right to Information) compliant report
   */
  async generateRTIReport(startDate: Date, endDate: Date, entityType?: string): Promise<RTIReport> {
    const where = {
      createdAt: { gte: startDate, lte: endDate },
      ...(entityType ? { entityType } : {}),
    };

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Group by action
    const actionCounts = new Map<string, number>();
    logs.forEach((log) => {
      const count = actionCounts.get(log.action) || 0;
      actionCounts.set(log.action, count + 1);
    });

    // Group by entity type
    const entityCounts = new Map<string, number>();
    logs.forEach((log) => {
      const count = entityCounts.get(log.entityType) || 0;
      entityCounts.set(log.entityType, count + 1);
    });

    // Get critical events
    const criticalEvents = logs.filter((log) => log.severity === 'CRITICAL');

    const byAction: ActionCount[] = Array.from(actionCounts.entries()).map(([action, count]) => ({
      action,
      count,
    }));

    const byEntity: EntityCount[] = Array.from(entityCounts.entries()).map(([entity, count]) => ({
      entity,
      count,
    }));

    return this.formatForRTI({
      period: { start: startDate, end: endDate },
      totalEntries: logs.length,
      byAction,
      byEntity,
      criticalEvents: criticalEvents.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        createdAt: e.createdAt,
      })),
      summary: `Total of ${logs.length} audit entries from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}. ${criticalEvents.length} critical events recorded.`,
    });
  }

  /**
   * Generate CAG (Comptroller and Auditor General) report
   */
  async generateCAGReport(financialYear: string): Promise<CAGReport> {
    // Parse financial year (e.g., "2024-25" -> April 2024 to March 2025)
    const [startYear] = financialYear.split('-').map(Number);
    const startDate = new Date(startYear, 3, 1); // April 1
    const endDate = new Date(startYear + 1, 2, 31, 23, 59, 59); // March 31 next year

    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Monthly breakdown
    const monthlyMap = new Map<string, { total: number; byCategory: Record<string, number> }>();

    logs.forEach((log) => {
      const monthKey = `${log.createdAt.getFullYear()}-${String(log.createdAt.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { total: 0, byCategory: {} });
      }

      const monthData = monthlyMap.get(monthKey)!;
      monthData.total++;

      const category = log.category || 'OTHER';
      monthData.byCategory[category] = (monthData.byCategory[category] || 0) + 1;
    });

    const monthlyBreakdown: MonthlyBreakdown[] = Array.from(monthlyMap.entries()).map(
      ([month, data]) => ({
        month,
        totalActions: data.total,
        byCategory: data.byCategory,
      }),
    );

    // Payment audit
    const paymentLogs = logs.filter((log) => log.category === 'PAYMENT');

    // Status transitions
    const transitionLogs = logs.filter(
      (log) => log.action.includes('STATUS_CHANGE') || log.action.includes('TRANSITION'),
    );

    // User activity summary
    const userActivityMap = new Map<string, { role: string; count: number }>();

    logs.forEach((log) => {
      if (!log.userId) return;

      if (!userActivityMap.has(log.userId)) {
        userActivityMap.set(log.userId, { role: log.userRole || 'UNKNOWN', count: 0 });
      }

      userActivityMap.get(log.userId)!.count++;
    });

    const userActivitySummary = Array.from(userActivityMap.entries())
      .map(([userId, data]) => ({
        userId,
        role: data.role,
        actionCount: data.count,
      }))
      .sort((a, b) => b.actionCount - a.actionCount)
      .slice(0, 50); // Top 50 users

    return {
      financialYear,
      monthlyBreakdown,
      paymentAudit: paymentLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityId: log.entityId,
        createdAt: log.createdAt,
        userId: log.userId,
      })),
      statusTransitions: transitionLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        oldValues: log.oldValues,
        newValues: log.newValues,
        createdAt: log.createdAt,
      })),
      userActivitySummary,
    };
  }

  /**
   * Generate compliance report with anomaly detection
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<ComplianceReport> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    const anomalies = this.detectAnomalies(logs);
    const complianceScore = this.calculateComplianceScore(anomalies, logs.length);

    const recommendations: string[] = [];

    if (anomalies.some((a) => a.type === 'AFTER_HOURS')) {
      recommendations.push(
        'Review after-hours access patterns and consider implementing time-based access controls.',
      );
    }

    if (anomalies.some((a) => a.type === 'BULK_OPERATION')) {
      recommendations.push(
        'Investigate bulk operations for potential automation or security concerns.',
      );
    }

    if (complianceScore < 80) {
      recommendations.push(
        'Overall compliance score is below threshold. Consider security training for users.',
      );
    }

    return {
      period: { start: startDate, end: endDate },
      totalActions: logs.length,
      anomalies,
      complianceScore,
      recommendations,
    };
  }

  /**
   * Generate user activity report
   */
  async generateUserActivityReport(userId: string, startDate: Date, endDate: Date) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const byDay = new Map<string, Array<Record<string, unknown>>>();

    logs.forEach((log) => {
      const dayKey = log.createdAt.toISOString().split('T')[0];

      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, []);
      }

      byDay.get(dayKey)!.push({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        createdAt: log.createdAt,
      });
    });

    // Group by action type
    const byAction = new Map<string, number>();
    logs.forEach((log) => {
      byAction.set(log.action, (byAction.get(log.action) || 0) + 1);
    });

    return {
      userId,
      period: { start: startDate, end: endDate },
      totalActions: logs.length,
      byDay: Object.fromEntries(byDay),
      byAction: Object.fromEntries(byAction),
    };
  }

  /**
   * Detect anomalies in audit logs
   */
  private detectAnomalies(
    logs: Array<{ createdAt: Date; userId: string | null; action: string }>,
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check for after-hours activity (after 10pm, before 6am)
    logs.forEach((log) => {
      const hour = log.createdAt.getHours();
      if (hour >= 22 || hour < 6) {
        anomalies.push({
          type: 'AFTER_HOURS',
          description: `Activity detected at ${log.createdAt.toISOString()} outside business hours`,
          severity: 'MEDIUM',
          timestamp: log.createdAt,
          userId: log.userId || undefined,
          details: { action: log.action, hour },
        });
      }
    });

    // Check for bulk operations (>50 actions per hour by same user)
    const userHourMap = new Map<string, number>();

    logs.forEach((log) => {
      if (!log.userId) return;

      const hourKey = `${log.userId}-${log.createdAt.toISOString().slice(0, 13)}`;
      userHourMap.set(hourKey, (userHourMap.get(hourKey) || 0) + 1);
    });

    userHourMap.forEach((count, key) => {
      if (count > 50) {
        const [userId, hourStr] = key.split('-');
        anomalies.push({
          type: 'BULK_OPERATION',
          description: `User ${userId} performed ${count} actions in one hour`,
          severity: 'HIGH',
          timestamp: new Date(hourStr),
          userId,
          details: { actionCount: count },
        });
      }
    });

    return anomalies;
  }

  /**
   * Calculate compliance score (0-100)
   */
  private calculateComplianceScore(anomalies: Anomaly[], totalActions: number): number {
    if (totalActions === 0) return 100;

    let penaltyPoints = 0;

    anomalies.forEach((anomaly) => {
      switch (anomaly.severity) {
        case 'LOW':
          penaltyPoints += 1;
          break;
        case 'MEDIUM':
          penaltyPoints += 3;
          break;
        case 'HIGH':
          penaltyPoints += 10;
          break;
      }
    });

    // Max penalty is 50 points (so score never goes below 50 for minor issues)
    const adjustedPenalty = Math.min(penaltyPoints, 50);

    return Math.max(0, 100 - adjustedPenalty);
  }

  /**
   * Format data for RTI compliance
   */
  private formatForRTI(data: RTIReport): RTIReport {
    // Add RTI-specific formatting if needed
    return {
      ...data,
      summary: `[RTI COMPLIANT REPORT] ${data.summary}`,
    };
  }
}
