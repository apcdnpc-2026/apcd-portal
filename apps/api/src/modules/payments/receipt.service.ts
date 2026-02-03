import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../../infrastructure/storage/minio.service';
import { AuditLogService } from '../audit-log/audit-log.service';

interface ReceiptData {
  receiptNumber: string;
  receiptDate: Date;
  financialYear: string;
  paymentId: string;
  applicationNumber: string;
  applicantName: string;
  companyName: string;
  paymentType: string;
  paymentMethod: string;
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    private auditService: AuditLogService,
  ) {}

  /**
   * Generate a receipt for a completed payment.
   */
  async generateReceipt(paymentId: string, generatedBy: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
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
        receipt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.receipt) {
      return payment.receipt;
    }

    const financialYear = this.getCurrentFinancialYear();
    const sequenceNumber = await this.getNextSequenceNumber(financialYear);
    const receiptNumber = this.formatReceiptNumber(financialYear, sequenceNumber);
    const receiptDate = new Date();

    const receiptData: ReceiptData = {
      receiptNumber,
      receiptDate,
      financialYear,
      paymentId: payment.id,
      applicationNumber: payment.application.applicationNumber || payment.applicationId,
      applicantName: `${payment.application.applicant.firstName} ${payment.application.applicant.lastName}`,
      companyName: payment.application.oemProfile?.companyName || 'N/A',
      paymentType: payment.paymentType,
      paymentMethod: payment.paymentMethod,
      baseAmount: Number(payment.baseAmount),
      gstRate: Number(payment.gstRate),
      gstAmount: Number(payment.gstAmount),
      totalAmount: Number(payment.totalAmount),
    };

    const qrCodeData = this.generateQrData(receiptData, payment.application);

    // Generate PDF buffer (placeholder implementation)
    const pdfBuffer = this.generateReceiptPdf(receiptData);

    // Store PDF in MinIO
    const pdfPath = `receipts/${payment.applicationId}/${receiptNumber}.pdf`;
    await this.minio.uploadFile(pdfPath, pdfBuffer, 'application/pdf', {
      receiptNumber,
      paymentId,
    });

    // Create PaymentReceipt record
    const receipt = await this.prisma.paymentReceipt.create({
      data: {
        paymentId,
        receiptNumber,
        financialYear,
        sequenceNumber,
        receiptDate,
        qrCodeData,
        signedBy: generatedBy,
        pdfPath,
      },
    });

    // Audit log
    await this.auditService.log({
      userId: generatedBy,
      action: 'RECEIPT_GENERATED',
      category: 'PAYMENT',
      severity: 'INFO',
      entityType: 'PaymentReceipt',
      entityId: receipt.id,
      newValues: {
        receiptNumber,
        paymentId,
        totalAmount: receiptData.totalAmount,
      },
    });

    this.logger.log(`Generated receipt ${receiptNumber} for payment ${paymentId}`);

    return receipt;
  }

  /**
   * Get a receipt by its ID.
   */
  async getReceipt(receiptId: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
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
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  /**
   * Get a receipt by payment ID.
   */
  async getReceiptByPayment(paymentId: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({
      where: { paymentId },
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
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found for this payment');
    }

    return receipt;
  }

  /**
   * Generate a presigned download URL for the receipt PDF.
   */
  async getReceiptPdfUrl(receiptId: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    if (!receipt.pdfPath) {
      throw new NotFoundException('Receipt PDF not available');
    }

    const url = await this.minio.getPresignedUrl(receipt.pdfPath, 3600);

    return { url, receiptNumber: receipt.receiptNumber };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the next sequence number for the given financial year.
   */
  private async getNextSequenceNumber(financialYear: string): Promise<number> {
    const lastReceipt = await this.prisma.paymentReceipt.findFirst({
      where: { financialYear },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });

    return (lastReceipt?.sequenceNumber || 0) + 1;
  }

  /**
   * Format receipt number: APCD/REC/YYYY-YY/NNNNNN
   */
  private formatReceiptNumber(financialYear: string, sequenceNumber: number): string {
    const paddedSequence = String(sequenceNumber).padStart(6, '0');
    return `APCD/REC/${financialYear}/${paddedSequence}`;
  }

  /**
   * Get current financial year in YYYY-YY format (April to March).
   * e.g., if current date is Feb 2026, returns '2025-26'
   *        if current date is May 2026, returns '2026-27'
   */
  getCurrentFinancialYear(date?: Date): string {
    const now = date || new Date();
    const month = now.getMonth(); // 0-indexed: 0=Jan, 3=Apr
    const year = now.getFullYear();

    if (month >= 3) {
      // April (3) onwards: FY starts this year
      const startYear = year;
      const endYear = (startYear + 1) % 100;
      return `${startYear}-${String(endYear).padStart(2, '0')}`;
    } else {
      // Jan-Mar: FY started previous year
      const startYear = year - 1;
      const endYear = year % 100;
      return `${startYear}-${String(endYear).padStart(2, '0')}`;
    }
  }

  /**
   * Generate QR code data as JSON string containing receipt details.
   */
  private generateQrData(
    receiptData: ReceiptData,
    application: { applicationNumber?: string | null; id: string },
  ): string {
    return JSON.stringify({
      receiptNumber: receiptData.receiptNumber,
      amount: receiptData.totalAmount,
      date: receiptData.receiptDate.toISOString(),
      applicationNumber: application.applicationNumber || application.id,
      verifyUrl: `https://apcd.npc.gov.in/verify/receipt/${receiptData.receiptNumber}`,
    });
  }

  /**
   * Generate receipt PDF content.
   * Placeholder implementation -- returns a simple text-based buffer
   * that can be replaced with a proper PDF library (e.g., pdfkit) later.
   */
  private generateReceiptPdf(receiptData: ReceiptData): Buffer {
    const lines = [
      '='.repeat(60),
      '           NATIONAL PRODUCTIVITY COUNCIL',
      '         APCD OEM Empanelment Portal',
      '                PAYMENT RECEIPT',
      '='.repeat(60),
      '',
      `Receipt No:      ${receiptData.receiptNumber}`,
      `Date:            ${receiptData.receiptDate.toLocaleDateString('en-IN')}`,
      `Financial Year:  ${receiptData.financialYear}`,
      '',
      '-'.repeat(60),
      '',
      `Applicant:       ${receiptData.applicantName}`,
      `Company:         ${receiptData.companyName}`,
      `Application:     ${receiptData.applicationNumber}`,
      '',
      '-'.repeat(60),
      '',
      `Payment Type:    ${receiptData.paymentType}`,
      `Payment Method:  ${receiptData.paymentMethod}`,
      '',
      `Base Amount:     Rs. ${receiptData.baseAmount.toLocaleString('en-IN')}`,
      `GST (${receiptData.gstRate}%):      Rs. ${receiptData.gstAmount.toLocaleString('en-IN')}`,
      '-'.repeat(40),
      `Total Amount:    Rs. ${receiptData.totalAmount.toLocaleString('en-IN')}`,
      '',
      '='.repeat(60),
      'This is a computer-generated receipt.',
      '='.repeat(60),
    ];

    return Buffer.from(lines.join('\n'), 'utf-8');
  }
}
