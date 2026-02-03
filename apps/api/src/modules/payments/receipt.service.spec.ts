import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../../infrastructure/storage/minio.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import { ReceiptService } from './receipt.service';

describe('ReceiptService', () => {
  let service: ReceiptService;
  let prisma: DeepMockProxy<PrismaClient>;
  let minio: { uploadFile: jest.Mock; getPresignedUrl: jest.Mock };
  let auditService: { log: jest.Mock };

  const mockPaymentId = 'pay-001';
  const mockReceiptId = 'rec-001';
  const mockUserId = 'user-001';
  const mockAppId = 'app-001';

  const mockPayment = {
    id: mockPaymentId,
    applicationId: mockAppId,
    paymentType: 'APPLICATION_FEE',
    paymentMethod: 'RAZORPAY',
    baseAmount: 25000,
    gstRate: 18,
    gstAmount: 4500,
    totalAmount: 29500,
    application: {
      id: mockAppId,
      applicationNumber: 'APCD/2025/000001',
      applicant: {
        id: mockUserId,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
      oemProfile: {
        companyName: 'Test Corp',
      },
    },
    receipt: null,
  };

  const mockReceipt = {
    id: mockReceiptId,
    paymentId: mockPaymentId,
    receiptNumber: 'APCD/REC/2025-26/000001',
    financialYear: '2025-26',
    sequenceNumber: 1,
    receiptDate: new Date('2025-06-15'),
    qrCodeData: '{"receiptNumber":"APCD/REC/2025-26/000001"}',
    digitalSignature: null,
    signedBy: mockUserId,
    pdfPath: `receipts/${mockAppId}/APCD/REC/2025-26/000001.pdf`,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    minio = {
      uploadFile: jest.fn().mockResolvedValue('receipts/app-001/receipt.pdf'),
      getPresignedUrl: jest.fn().mockResolvedValue('https://minio.example.com/presigned-url'),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
        {
          provide: MinioService,
          useValue: minio,
        },
        {
          provide: AuditLogService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get<ReceiptService>(ReceiptService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────── generateReceipt ──────────────────────────────────────

  describe('generateReceipt', () => {
    it('should generate a receipt with correct sequential number', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as unknown as never);
      prisma.paymentReceipt.findFirst.mockResolvedValue(null as unknown as never);
      prisma.paymentReceipt.create.mockResolvedValue(mockReceipt as unknown as never);

      const result = await service.generateReceipt(mockPaymentId, mockUserId);

      expect(prisma.paymentReceipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: mockPaymentId,
          receiptNumber: expect.stringMatching(/^APCD\/REC\/\d{4}-\d{2}\/\d{6}$/),
          sequenceNumber: 1,
          signedBy: mockUserId,
          pdfPath: expect.stringContaining('receipts/'),
        }),
      });

      expect(result).toEqual(mockReceipt);
    });

    it('should increment sequence number when previous receipts exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as unknown as never);
      prisma.paymentReceipt.findFirst.mockResolvedValue({
        sequenceNumber: 42,
      } as unknown as never);
      prisma.paymentReceipt.create.mockResolvedValue({
        ...mockReceipt,
        sequenceNumber: 43,
        receiptNumber: 'APCD/REC/2025-26/000043',
      } as unknown as never);

      await service.generateReceipt(mockPaymentId, mockUserId);

      expect(prisma.paymentReceipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sequenceNumber: 43,
          receiptNumber: expect.stringContaining('000043'),
        }),
      });
    });

    it('should return existing receipt if payment already has one', async () => {
      const existingReceipt = { ...mockReceipt };
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        receipt: existingReceipt,
      } as unknown as never);

      const result = await service.generateReceipt(mockPaymentId, mockUserId);

      expect(result).toEqual(existingReceipt);
      expect(prisma.paymentReceipt.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null as unknown as never);

      await expect(service.generateReceipt(mockPaymentId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should store PDF in MinIO at the correct path', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as unknown as never);
      prisma.paymentReceipt.findFirst.mockResolvedValue(null as unknown as never);
      prisma.paymentReceipt.create.mockResolvedValue(mockReceipt as unknown as never);

      await service.generateReceipt(mockPaymentId, mockUserId);

      expect(minio.uploadFile).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^receipts/${mockAppId}/`)),
        expect.any(Buffer),
        'application/pdf',
        expect.objectContaining({
          receiptNumber: expect.any(String),
          paymentId: mockPaymentId,
        }),
      );
    });

    it('should create an audit log entry', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as unknown as never);
      prisma.paymentReceipt.findFirst.mockResolvedValue(null as unknown as never);
      prisma.paymentReceipt.create.mockResolvedValue(mockReceipt as unknown as never);

      await service.generateReceipt(mockPaymentId, mockUserId);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          action: 'RECEIPT_GENERATED',
          category: 'PAYMENT',
          entityType: 'PaymentReceipt',
          entityId: mockReceiptId,
        }),
      );
    });
  });

  // ─────────────────── getCurrentFinancialYear ──────────────────────────────

  describe('getCurrentFinancialYear', () => {
    it('should return previous year start for months before April (Jan-Mar)', () => {
      // February 2026 -> FY 2025-26
      const febDate = new Date(2026, 1, 15); // month is 0-indexed
      expect(service.getCurrentFinancialYear(febDate)).toBe('2025-26');

      // January 2026 -> FY 2025-26
      const janDate = new Date(2026, 0, 1);
      expect(service.getCurrentFinancialYear(janDate)).toBe('2025-26');

      // March 2026 -> FY 2025-26
      const marDate = new Date(2026, 2, 31);
      expect(service.getCurrentFinancialYear(marDate)).toBe('2025-26');
    });

    it('should return current year start for months April onwards', () => {
      // April 2026 -> FY 2026-27
      const aprDate = new Date(2026, 3, 1);
      expect(service.getCurrentFinancialYear(aprDate)).toBe('2026-27');

      // December 2025 -> FY 2025-26
      const decDate = new Date(2025, 11, 31);
      expect(service.getCurrentFinancialYear(decDate)).toBe('2025-26');

      // May 2025 -> FY 2025-26
      const mayDate = new Date(2025, 4, 15);
      expect(service.getCurrentFinancialYear(mayDate)).toBe('2025-26');
    });

    it('should handle century boundary (year 2099-2100)', () => {
      // December 2099 -> FY 2099-00
      const dec2099 = new Date(2099, 11, 31);
      expect(service.getCurrentFinancialYear(dec2099)).toBe('2099-00');

      // January 2100 -> FY 2099-00
      const jan2100 = new Date(2100, 0, 1);
      expect(service.getCurrentFinancialYear(jan2100)).toBe('2099-00');
    });
  });

  // ─────────────────── QR data ──────────────────────────────────────────────

  describe('generateReceipt - QR data', () => {
    it('should include required fields in QR code data', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as unknown as never);
      prisma.paymentReceipt.findFirst.mockResolvedValue(null as unknown as never);
      prisma.paymentReceipt.create.mockImplementation(((args: { data: { qrCodeData: string } }) => {
        const qrData = JSON.parse(args.data.qrCodeData);

        // Verify QR data contains required fields
        expect(qrData).toHaveProperty('receiptNumber');
        expect(qrData).toHaveProperty('amount');
        expect(qrData).toHaveProperty('date');
        expect(qrData).toHaveProperty('applicationNumber');
        expect(qrData).toHaveProperty('verifyUrl');
        expect(qrData.receiptNumber).toMatch(/^APCD\/REC\//);
        expect(qrData.amount).toBe(29500);
        expect(qrData.applicationNumber).toBe('APCD/2025/000001');

        return Promise.resolve(mockReceipt);
      }) as unknown as typeof prisma.paymentReceipt.create);

      await service.generateReceipt(mockPaymentId, mockUserId);

      expect(prisma.paymentReceipt.create).toHaveBeenCalled();
    });
  });

  // ─────────────────── getReceipt ───────────────────────────────────────────

  describe('getReceipt', () => {
    it('should return receipt with payment and application details', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue({
        ...mockReceipt,
        payment: mockPayment,
      } as unknown as never);

      const result = await service.getReceipt(mockReceiptId);

      expect(result.id).toBe(mockReceiptId);
      expect(prisma.paymentReceipt.findUnique).toHaveBeenCalledWith({
        where: { id: mockReceiptId },
        include: expect.objectContaining({
          payment: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException when receipt does not exist', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue(null as unknown as never);

      await expect(service.getReceipt('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────── getReceiptByPayment ──────────────────────────────────

  describe('getReceiptByPayment', () => {
    it('should return receipt by payment ID', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue({
        ...mockReceipt,
        payment: mockPayment,
      } as unknown as never);

      const result = await service.getReceiptByPayment(mockPaymentId);

      expect(result.paymentId).toBe(mockPaymentId);
      expect(prisma.paymentReceipt.findUnique).toHaveBeenCalledWith({
        where: { paymentId: mockPaymentId },
        include: expect.objectContaining({
          payment: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException when no receipt for payment', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue(null as unknown as never);

      await expect(service.getReceiptByPayment('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────── getReceiptPdfUrl ─────────────────────────────────────

  describe('getReceiptPdfUrl', () => {
    it('should return presigned URL from MinIO', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue(mockReceipt as unknown as never);

      const result = await service.getReceiptPdfUrl(mockReceiptId);

      expect(result.url).toBe('https://minio.example.com/presigned-url');
      expect(result.receiptNumber).toBe(mockReceipt.receiptNumber);
      expect(minio.getPresignedUrl).toHaveBeenCalledWith(mockReceipt.pdfPath, 3600);
    });

    it('should throw NotFoundException when receipt does not exist', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue(null as unknown as never);

      await expect(service.getReceiptPdfUrl('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when receipt has no PDF path', async () => {
      prisma.paymentReceipt.findUnique.mockResolvedValue({
        ...mockReceipt,
        pdfPath: null,
      } as unknown as never);

      await expect(service.getReceiptPdfUrl(mockReceiptId)).rejects.toThrow(NotFoundException);
    });
  });
});
