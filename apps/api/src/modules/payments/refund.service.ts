import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

/** Refund status constants matching the PaymentRefund.status string field */
const RefundStatus = {
  REQUESTED: 'REQUESTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditLogService,
  ) {}

  /**
   * Request a refund for a payment.
   * Validates payment exists and is in a refundable state,
   * and that refund amount does not exceed remaining refundable amount.
   */
  async requestRefund(paymentId: string, amount: number, reason: string, requestedBy: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Payment must be in a completed/captured state to be refundable
    const refundableStatuses = ['COMPLETED', 'VERIFIED'];
    if (!refundableStatuses.includes(payment.status)) {
      throw new BadRequestException(
        `Payment is not in a refundable state. Current status: ${payment.status}`,
      );
    }

    // Calculate already refunded amount (only COMPLETED refunds count)
    const alreadyRefunded = payment.refunds
      .filter((r) => r.status === RefundStatus.COMPLETED)
      .reduce((sum, r) => sum + Number(r.refundAmount), 0);

    const paymentAmount = Number(payment.totalAmount);
    const remainingRefundable = paymentAmount - alreadyRefunded;

    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    if (amount > remainingRefundable) {
      throw new BadRequestException(
        `Refund amount (${amount}) exceeds remaining refundable amount (${remainingRefundable})`,
      );
    }

    const refund = await this.prisma.paymentRefund.create({
      data: {
        paymentId,
        refundAmount: new Prisma.Decimal(amount),
        reason,
        status: RefundStatus.PENDING,
        requestedBy,
      },
    });

    await this.auditService.log({
      userId: requestedBy,
      action: 'REFUND_REQUESTED',
      entityType: 'PaymentRefund',
      entityId: refund.id,
      category: 'PAYMENT',
      severity: 'INFO',
      newValues: {
        paymentId,
        amount,
        reason,
        status: RefundStatus.PENDING,
      },
    });

    this.logger.log(`Refund ${refund.id} requested for payment ${paymentId} amount ${amount}`);

    return refund;
  }

  /**
   * Approve a pending refund request.
   */
  async approveRefund(refundId: string, approvedBy: string) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException(`Refund cannot be approved. Current status: ${refund.status}`);
    }

    const updatedRefund = await this.prisma.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.APPROVED,
        approvedBy,
        approvedAt: new Date(),
      },
    });

    await this.auditService.log({
      userId: approvedBy,
      action: 'REFUND_APPROVED',
      entityType: 'PaymentRefund',
      entityId: refundId,
      category: 'PAYMENT',
      severity: 'INFO',
      oldValues: { status: RefundStatus.PENDING },
      newValues: { status: RefundStatus.APPROVED, approvedBy },
    });

    this.logger.log(`Refund ${refundId} approved by ${approvedBy}`);

    return updatedRefund;
  }

  /**
   * Process an approved refund by calling the payment gateway.
   * Updates status through PROCESSING -> COMPLETED or FAILED.
   */
  async processRefund(refundId: string) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.APPROVED) {
      throw new BadRequestException(`Refund cannot be processed. Current status: ${refund.status}`);
    }

    // Mark as processing
    await this.prisma.paymentRefund.update({
      where: { id: refundId },
      data: { status: RefundStatus.PROCESSING },
    });

    try {
      // TODO: Integrate with Razorpay refund API
      // For now, simulate a successful refund by updating status to COMPLETED
      const gatewayRefundId = `rfnd_placeholder_${refundId.slice(0, 8)}`;

      const updatedRefund = await this.prisma.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: RefundStatus.COMPLETED,
          gatewayRefundId,
          processedAt: new Date(),
        },
      });

      await this.auditService.log({
        action: 'REFUND_PROCESSED',
        entityType: 'PaymentRefund',
        entityId: refundId,
        category: 'PAYMENT',
        severity: 'INFO',
        newValues: {
          status: RefundStatus.COMPLETED,
          gatewayRefundId,
        },
      });

      this.logger.log(`Refund ${refundId} processed successfully`);

      return updatedRefund;
    } catch (error: unknown) {
      const failureReason =
        error instanceof Error ? error.message : 'Unknown error during refund processing';

      const failedRefund = await this.prisma.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: RefundStatus.FAILED,
          rejectionReason: failureReason,
        },
      });

      await this.auditService.log({
        action: 'REFUND_FAILED',
        entityType: 'PaymentRefund',
        entityId: refundId,
        category: 'PAYMENT',
        severity: 'WARNING',
        newValues: {
          status: RefundStatus.FAILED,
          failureReason,
        },
      });

      this.logger.error(`Refund ${refundId} failed: ${failureReason}`);

      return failedRefund;
    }
  }

  /**
   * Reject a pending refund request.
   */
  async rejectRefund(refundId: string, rejectedBy: string, reason: string) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException(`Refund cannot be rejected. Current status: ${refund.status}`);
    }

    const updatedRefund = await this.prisma.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.FAILED,
        rejectionReason: reason,
      },
    });

    await this.auditService.log({
      userId: rejectedBy,
      action: 'REFUND_REJECTED',
      entityType: 'PaymentRefund',
      entityId: refundId,
      category: 'PAYMENT',
      severity: 'INFO',
      oldValues: { status: RefundStatus.PENDING },
      newValues: { status: RefundStatus.FAILED, rejectionReason: reason },
    });

    this.logger.log(`Refund ${refundId} rejected by ${rejectedBy}: ${reason}`);

    return updatedRefund;
  }

  /**
   * Get all refunds for a specific payment.
   */
  async getRefundsByPayment(paymentId: string) {
    return this.prisma.paymentRefund.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single refund with payment details.
   */
  async getRefund(refundId: string) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
      include: {
        payment: {
          include: {
            application: {
              include: {
                applicant: {
                  select: { id: true, email: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    return refund;
  }

  /**
   * Get all pending refunds (for admin dashboard).
   */
  async getPendingRefunds() {
    return this.prisma.paymentRefund.findMany({
      where: { status: RefundStatus.PENDING },
      include: {
        payment: {
          include: {
            application: {
              include: {
                applicant: {
                  select: { id: true, email: true, firstName: true, lastName: true },
                },
                oemProfile: {
                  select: { companyName: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get total refunded amount for a payment (sum of COMPLETED refunds).
   */
  async getTotalRefunded(paymentId: string): Promise<number> {
    const result = await this.prisma.paymentRefund.aggregate({
      where: {
        paymentId,
        status: RefundStatus.COMPLETED,
      },
      _sum: { refundAmount: true },
    });

    return Number(result._sum.refundAmount) || 0;
  }
}
