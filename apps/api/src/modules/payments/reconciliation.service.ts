import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

interface GatewayTransaction {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  capturedAt: Date | null;
}

interface Discrepancy {
  type: 'AMOUNT_MISMATCH' | 'MISSING_IN_GATEWAY' | 'MISSING_IN_DB' | 'STATUS_MISMATCH';
  paymentId: string | null;
  gatewayId: string | null;
  dbAmount: number | null;
  gatewayAmount: number | null;
  dbStatus: string | null;
  gatewayStatus: string | null;
  description: string;
}

interface ReconciliationResult {
  matched: number;
  mismatched: number;
  discrepancies: Discrepancy[];
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditLogService,
  ) {}

  /**
   * Run reconciliation for payments in the last 24 hours
   */
  async runReconciliation(runBy: string) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Create reconciliation record
    const reconciliation = await this.prisma.paymentReconciliation.create({
      data: {
        reconciliationDate: new Date(),
        totalPayments: 0,
        totalGateway: 0,
        totalBank: 0,
        matchedCount: 0,
        mismatchedCount: 0,
        discrepancies: [],
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        runBy,
      },
    });

    try {
      // Fetch DB payments
      const dbPayments = await this.prisma.payment.findMany({
        where: {
          paidAt: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: ['CAPTURED', 'SUCCESS'] },
        },
      });

      // Fetch gateway transactions (placeholder)
      const gatewayTxns = await this.fetchGatewayTransactions(startDate, endDate);

      // Compare transactions
      const result = this.compareTransactions(dbPayments, gatewayTxns);

      // Calculate totals
      const totalPayments = dbPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalGateway = gatewayTxns.reduce((sum, t) => sum + t.amount, 0);

      // Update reconciliation record
      const updated = await this.prisma.paymentReconciliation.update({
        where: { id: reconciliation.id },
        data: {
          totalPayments,
          totalGateway,
          totalBank: totalPayments, // Placeholder - would come from bank statement
          matchedCount: result.matched,
          mismatchedCount: result.mismatched,
          discrepancies: result.discrepancies as unknown as Record<string, unknown>[],
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      await this.auditService.log({
        userId: runBy,
        action: 'RECONCILIATION_COMPLETED',
        entityType: 'PaymentReconciliation',
        entityId: reconciliation.id,
        newValues: {
          matched: result.matched,
          mismatched: result.mismatched,
          discrepancyCount: result.discrepancies.length,
        },
      });

      return updated;
    } catch (error: unknown) {
      this.logger.error('Reconciliation failed:', error);

      await this.prisma.paymentReconciliation.update({
        where: { id: reconciliation.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Get a single reconciliation report
   */
  async getReconciliation(id: string) {
    return this.prisma.paymentReconciliation.findUnique({
      where: { id },
    });
  }

  /**
   * Get paginated history of reconciliation runs
   */
  async getReconciliationHistory(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.paymentReconciliation.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentReconciliation.count(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get discrepancies for a reconciliation
   */
  async getDiscrepancies(reconciliationId: string): Promise<Discrepancy[]> {
    const reconciliation = await this.prisma.paymentReconciliation.findUnique({
      where: { id: reconciliationId },
      select: { discrepancies: true },
    });

    if (!reconciliation) return [];

    return (reconciliation.discrepancies as unknown as Discrepancy[]) || [];
  }

  /**
   * Placeholder: Fetch transactions from payment gateway
   * TODO: Integrate with Razorpay Settlements API
   */
  private async fetchGatewayTransactions(
    startDate: Date,
    endDate: Date,
  ): Promise<GatewayTransaction[]> {
    // In production, this would call Razorpay's settlements/payments API
    // For now, return DB payments as if they came from gateway (simulates 100% match)
    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDate, lte: endDate },
        status: { in: ['CAPTURED', 'SUCCESS'] },
      },
    });

    return payments.map((p) => ({
      id: p.gatewayPaymentId || p.id,
      orderId: p.gatewayOrderId || '',
      amount: Number(p.amount),
      status: p.status,
      capturedAt: p.paidAt,
    }));
  }

  /**
   * Compare DB payments with gateway transactions
   */
  private compareTransactions(
    dbPayments: Array<{
      id: string;
      gatewayPaymentId: string | null;
      amount: unknown;
      status: string;
    }>,
    gatewayTxns: GatewayTransaction[],
  ): ReconciliationResult {
    const discrepancies: Discrepancy[] = [];
    let matched = 0;
    let mismatched = 0;

    const gatewayMap = new Map(gatewayTxns.map((t) => [t.id, t]));
    const processedGatewayIds = new Set<string>();

    // Check each DB payment against gateway
    for (const dbPayment of dbPayments) {
      const gatewayTxn = gatewayMap.get(dbPayment.gatewayPaymentId || '');

      if (!gatewayTxn) {
        discrepancies.push(this.classifyDiscrepancy(dbPayment, null));
        mismatched++;
        continue;
      }

      processedGatewayIds.add(gatewayTxn.id);

      const dbAmount = Number(dbPayment.amount);
      const gatewayAmount = gatewayTxn.amount;

      if (Math.abs(dbAmount - gatewayAmount) > 0.01) {
        discrepancies.push(this.classifyDiscrepancy(dbPayment, gatewayTxn));
        mismatched++;
      } else if (dbPayment.status !== gatewayTxn.status) {
        discrepancies.push({
          type: 'STATUS_MISMATCH',
          paymentId: dbPayment.id,
          gatewayId: gatewayTxn.id,
          dbAmount,
          gatewayAmount,
          dbStatus: dbPayment.status,
          gatewayStatus: gatewayTxn.status,
          description: `Status mismatch: DB=${dbPayment.status}, Gateway=${gatewayTxn.status}`,
        });
        mismatched++;
      } else {
        matched++;
      }
    }

    // Check for gateway transactions not in DB
    for (const gatewayTxn of gatewayTxns) {
      if (!processedGatewayIds.has(gatewayTxn.id)) {
        discrepancies.push({
          type: 'MISSING_IN_DB',
          paymentId: null,
          gatewayId: gatewayTxn.id,
          dbAmount: null,
          gatewayAmount: gatewayTxn.amount,
          dbStatus: null,
          gatewayStatus: gatewayTxn.status,
          description: `Gateway transaction ${gatewayTxn.id} not found in database`,
        });
        mismatched++;
      }
    }

    return { matched, mismatched, discrepancies };
  }

  /**
   * Classify the type of discrepancy
   */
  private classifyDiscrepancy(
    dbRecord: { id: string; amount: unknown; status: string } | null,
    gatewayRecord: GatewayTransaction | null,
  ): Discrepancy {
    if (!gatewayRecord) {
      return {
        type: 'MISSING_IN_GATEWAY',
        paymentId: dbRecord?.id || null,
        gatewayId: null,
        dbAmount: dbRecord ? Number(dbRecord.amount) : null,
        gatewayAmount: null,
        dbStatus: dbRecord?.status || null,
        gatewayStatus: null,
        description: `Payment ${dbRecord?.id} not found in gateway`,
      };
    }

    if (!dbRecord) {
      return {
        type: 'MISSING_IN_DB',
        paymentId: null,
        gatewayId: gatewayRecord.id,
        dbAmount: null,
        gatewayAmount: gatewayRecord.amount,
        dbStatus: null,
        gatewayStatus: gatewayRecord.status,
        description: `Gateway transaction ${gatewayRecord.id} not found in DB`,
      };
    }

    return {
      type: 'AMOUNT_MISMATCH',
      paymentId: dbRecord.id,
      gatewayId: gatewayRecord.id,
      dbAmount: Number(dbRecord.amount),
      gatewayAmount: gatewayRecord.amount,
      dbStatus: dbRecord.status,
      gatewayStatus: gatewayRecord.status,
      description: `Amount mismatch: DB=${dbRecord.amount}, Gateway=${gatewayRecord.amount}`,
    };
  }
}
