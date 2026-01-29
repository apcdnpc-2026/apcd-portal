import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationStatus, PaymentStatus, PaymentMethod, PaymentType } from '@prisma/client';
import * as crypto from 'crypto';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface RazorpayOrderDto {
  applicationId: string;
  paymentType: PaymentType;
  baseAmount: number;
  apcdTypeCount?: number;
}

interface VerifyRazorpayDto {
  orderId: string;
  paymentId: string;
  signature: string;
}

interface ManualPaymentDto {
  applicationId: string;
  paymentType: PaymentType;
  baseAmount: number;
  utrNumber: string;
  neftDate: string;
  remitterBankName: string;
  apcdTypeCount?: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpayKeyId: string;
  private razorpayKeySecret: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.razorpayKeyId = this.config.get('RAZORPAY_KEY_ID', '');
    this.razorpayKeySecret = this.config.get('RAZORPAY_KEY_SECRET', '');
  }

  /**
   * Get NPC bank details for NEFT/RTGS payments
   */
  getBankDetails() {
    return {
      bankName: 'State Bank of India',
      accountName: 'National Productivity Council',
      accountNumber: 'XXXXXXXXXX',
      ifscCode: 'SBIN0000XXX',
      branch: 'New Delhi',
    };
  }

  /**
   * Calculate fees for an application
   */
  async calculateFees(applicationId: string, userId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        applicationApcds: {
          where: { seekingEmpanelment: true },
        },
        oemProfile: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const isDiscountEligible =
      !!application.oemProfile &&
      (application.oemProfile.isMSE || application.oemProfile.isStartup || application.oemProfile.isLocalSupplier);

    const apcdCount = Math.max(application.applicationApcds.length, 1);

    // Fee amounts from the SOP (no discount applied upfront - refunded after Final Certificate)
    const applicationFeeBase = 25000;
    const empanelmentFeeBase = 65000;
    const gstRate = 0.18;

    const applicationFee = this.calculateFeeBreakdown(applicationFeeBase, 1, gstRate);
    const empanelmentFee = this.calculateFeeBreakdown(empanelmentFeeBase, apcdCount, gstRate);

    // Calculate potential refund amount (15% of base, before GST)
    const refundAmount = isDiscountEligible
      ? (applicationFeeBase + empanelmentFeeBase * apcdCount) * 0.15
      : 0;

    return {
      applicationFee,
      empanelmentFee,
      grandTotal: applicationFee.total + empanelmentFee.total,
      isDiscountEligible,
      refundAmount,
      apcdCount,
    };
  }

  private calculateFeeBreakdown(baseAmount: number, count: number, gstRate: number) {
    const subtotal = baseAmount * count;
    const gstAmount = subtotal * gstRate;
    const total = subtotal + gstAmount;

    return {
      baseAmount: subtotal,
      gstRate: gstRate * 100,
      gstAmount,
      total,
    };
  }

  /**
   * Create Razorpay order
   */
  async createRazorpayOrder(userId: string, dto: RazorpayOrderDto) {
    const application = await this.validateApplicationForPayment(dto.applicationId, userId);

    const orderId = `order_${crypto.randomBytes(12).toString('hex')}`;

    // Calculate amounts
    const gstRate = 18;
    const gstAmount = (dto.baseAmount * gstRate) / 100;
    const totalAmount = dto.baseAmount + gstAmount;

    const payment = await this.prisma.payment.create({
      data: {
        applicationId: dto.applicationId,
        paymentType: dto.paymentType,
        paymentMethod: PaymentMethod.RAZORPAY,
        status: PaymentStatus.INITIATED,
        baseAmount: dto.baseAmount,
        gstRate,
        gstAmount,
        totalAmount,
        apcdTypeCount: dto.apcdTypeCount || 1,
        razorpayOrderId: orderId,
      },
    });

    return {
      paymentId: payment.id,
      orderId,
      amount: Math.round(totalAmount * 100), // Razorpay expects amount in paise
      currency: 'INR',
      keyId: this.razorpayKeyId,
      name: 'NPC APCD Portal',
      description: `${dto.paymentType} for Application`,
      prefill: {
        email: application.applicant.email,
        contact: application.applicant.phone,
      },
    };
  }

  /**
   * Verify Razorpay payment
   */
  async verifyRazorpayPayment(dto: VerifyRazorpayDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { razorpayOrderId: dto.orderId },
      include: { application: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', this.razorpayKeySecret)
      .update(`${dto.orderId}|${dto.paymentId}`)
      .digest('hex');

    if (expectedSignature !== dto.signature) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException('Invalid payment signature');
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        razorpayPaymentId: dto.paymentId,
        razorpaySignature: dto.signature,
        verifiedAt: new Date(),
      },
    });

    await this.updateApplicationStatusAfterPayment(payment.applicationId, payment.paymentType);

    return updatedPayment;
  }

  /**
   * Record manual (NEFT/RTGS) payment
   */
  async recordManualPayment(userId: string, dto: ManualPaymentDto) {
    await this.validateApplicationForPayment(dto.applicationId, userId);

    const gstRate = 18;
    const gstAmount = (dto.baseAmount * gstRate) / 100;
    const totalAmount = dto.baseAmount + gstAmount;

    return this.prisma.payment.create({
      data: {
        applicationId: dto.applicationId,
        paymentType: dto.paymentType,
        paymentMethod: PaymentMethod.NEFT,
        status: PaymentStatus.VERIFICATION_PENDING,
        baseAmount: dto.baseAmount,
        gstRate,
        gstAmount,
        totalAmount,
        apcdTypeCount: dto.apcdTypeCount || 1,
        utrNumber: dto.utrNumber,
        neftDate: new Date(dto.neftDate),
        remitterBankName: dto.remitterBankName,
        neftAmount: totalAmount,
      },
    });
  }

  /**
   * Verify manual payment (Officer)
   */
  async verifyManualPayment(
    paymentId: string,
    officerId: string,
    isVerified: boolean,
    remarks?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { application: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.VERIFICATION_PENDING) {
      throw new BadRequestException('Payment is not pending verification');
    }

    const newStatus = isVerified ? PaymentStatus.VERIFIED : PaymentStatus.FAILED;

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        verifiedById: officerId,
        verifiedAt: new Date(),
        verificationNote: remarks,
      },
    });

    if (isVerified) {
      await this.updateApplicationStatusAfterPayment(
        payment.applicationId,
        payment.paymentType,
      );
    }

    return updatedPayment;
  }

  /**
   * Get payments for an application
   */
  async getPaymentsForApplication(applicationId: string) {
    return this.prisma.payment.findMany({
      where: { applicationId },
      include: {
        verifiedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get payments pending verification (Officer view)
   */
  async getPendingVerificationPayments() {
    return this.prisma.payment.findMany({
      where: { status: PaymentStatus.VERIFICATION_PENDING },
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
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        application: {
          include: {
            applicant: {
              select: { id: true, email: true, firstName: true, lastName: true, phone: true },
            },
            oemProfile: {
              select: { companyName: true },
            },
          },
        },
        verifiedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats() {
    const [total, verified, pending, failed] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.VERIFIED },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.VERIFICATION_PENDING },
      }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.FAILED },
      }),
    ]);

    return {
      totalPayments: total._count,
      totalAmount: total._sum.totalAmount || 0,
      verifiedPayments: verified._count,
      verifiedAmount: verified._sum.totalAmount || 0,
      pendingVerification: pending,
      failedPayments: failed,
    };
  }

  private async validateApplicationForPayment(applicationId: string, userId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        applicant: {
          select: { id: true, email: true, phone: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.applicantId !== userId) {
      throw new BadRequestException('Not authorized');
    }

    return application;
  }

  private async updateApplicationStatusAfterPayment(
    applicationId: string,
    paymentType: PaymentType,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) return;

    // If application is in SUBMITTED status and payment is verified, move to UNDER_REVIEW
    if (
      (paymentType === PaymentType.APPLICATION_FEE || paymentType === PaymentType.EMPANELMENT_FEE) &&
      application.status === ApplicationStatus.SUBMITTED
    ) {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.UNDER_REVIEW,
          statusHistory: {
            create: {
              fromStatus: application.status,
              toStatus: ApplicationStatus.UNDER_REVIEW,
              changedBy: application.applicantId,
              remarks: `${paymentType} verified - Application moved to review`,
            },
          },
        },
      });
    }
  }
}
