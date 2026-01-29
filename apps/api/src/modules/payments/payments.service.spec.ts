import * as crypto from 'crypto';

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaClient,
  ApplicationStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentType,
} from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { PaymentsService } from './payments.service';

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomBytes: jest.fn().mockReturnValue(Buffer.from('a1b2c3d4e5f6a1b2c3d4e5f6')),
    createHmac: jest.fn(),
  };
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: DeepMockProxy<PrismaClient>;
  const mockUserId = 'user-001';
  const mockOfficerId = 'officer-001';
  const mockAppId = 'app-001';
  const mockPaymentId = 'pay-001';

  const mockApplication = {
    id: mockAppId,
    applicantId: mockUserId,
    status: ApplicationStatus.SUBMITTED,
    applicant: { id: mockUserId, email: 'test@example.com', phone: '9876543210' },
    oemProfile: null,
    applicationApcds: [],
  };

  const mockPayment = {
    id: mockPaymentId,
    applicationId: mockAppId,
    paymentType: PaymentType.APPLICATION_FEE,
    paymentMethod: PaymentMethod.RAZORPAY,
    status: PaymentStatus.INITIATED,
    baseAmount: 25000,
    gstRate: 18,
    gstAmount: 4500,
    totalAmount: 29500,
    apcdTypeCount: 1,
    razorpayOrderId: 'order_abc123',
    razorpayPaymentId: null,
    razorpaySignature: null,
    utrNumber: null,
    neftDate: null,
    neftAmount: null,
    remitterBankName: null,
    verifiedById: null,
    verifiedAt: null,
    verificationNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    application: mockApplication,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const map: Record<string, string> = {
                RAZORPAY_KEY_ID: 'rzp_test_key',
                RAZORPAY_KEY_SECRET: 'rzp_test_secret',
              };
              return map[key] ?? defaultValue ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get(PrismaService);
    module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────── getBankDetails ─────────────────────────────

  describe('getBankDetails', () => {
    it('should return NPC bank details', () => {
      const details = service.getBankDetails();
      expect(details).toEqual({
        bankName: 'State Bank of India',
        accountName: 'National Productivity Council',
        accountNumber: expect.any(String),
        ifscCode: expect.any(String),
        branch: 'New Delhi',
      });
    });
  });

  // ───────────────────────────── calculateFees ──────────────────────────────

  describe('calculateFees', () => {
    it('should calculate fees for application with 1 APCD type (no discount)', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: false, isStartup: false, isLocalSupplier: false } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);

      expect(result.applicationFee.baseAmount).toBe(25000);
      expect(result.applicationFee.gstAmount).toBe(4500);
      expect(result.applicationFee.total).toBe(29500);
      expect(result.empanelmentFee.baseAmount).toBe(65000);
      expect(result.empanelmentFee.gstAmount).toBe(11700);
      expect(result.empanelmentFee.total).toBe(76700);
      expect(result.grandTotal).toBe(106200);
      expect(result.isDiscountEligible).toBe(false);
      expect(result.refundAmount).toBe(0);
      expect(result.apcdCount).toBe(1);
    });

    it('should multiply empanelment fee by APCD count', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: null,
        applicationApcds: [
          { seekingEmpanelment: true },
          { seekingEmpanelment: true },
          { seekingEmpanelment: true },
        ] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);

      expect(result.apcdCount).toBe(3);
      expect(result.empanelmentFee.baseAmount).toBe(195000); // 65000 * 3
      expect(result.empanelmentFee.gstAmount).toBe(35100); // 195000 * 0.18
      expect(result.empanelmentFee.total).toBe(230100);
    });

    it('should flag discount eligibility for MSE', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: true, isStartup: false, isLocalSupplier: false } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);

      expect(result.isDiscountEligible).toBe(true);
      // refundAmount = (25000 + 65000 * 1) * 0.15 = 13500
      expect(result.refundAmount).toBe(13500);
    });

    it('should flag discount eligibility for startup', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: false, isStartup: true, isLocalSupplier: false } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.isDiscountEligible).toBe(true);
    });

    it('should flag discount eligibility for local supplier', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: false, isStartup: false, isLocalSupplier: true } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.isDiscountEligible).toBe(true);
    });

    it('should default apcdCount to 1 when no APCD entries', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        applicationApcds: [],
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.apcdCount).toBe(1);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.calculateFees(mockAppId, mockUserId)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────── createRazorpayOrder ─────────────────────────────

  describe('createRazorpayOrder', () => {
    const dto = {
      applicationId: mockAppId,
      paymentType: PaymentType.APPLICATION_FEE,
      baseAmount: 25000,
      apcdTypeCount: 1,
    };

    it('should create a Razorpay order and return order details', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.payment.create.mockResolvedValue({ ...mockPayment, id: 'pay-new' } as any);

      const result = await service.createRazorpayOrder(mockUserId, dto);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: mockAppId,
          paymentType: PaymentType.APPLICATION_FEE,
          paymentMethod: PaymentMethod.RAZORPAY,
          status: PaymentStatus.INITIATED,
          baseAmount: 25000,
          gstRate: 18,
          gstAmount: 4500,
          totalAmount: 29500,
          apcdTypeCount: 1,
          razorpayOrderId: expect.stringContaining('order_'),
        }),
      });
      expect(result.amount).toBe(2950000); // 29500 * 100 paise
      expect(result.currency).toBe('INR');
      expect(result.keyId).toBe('rzp_test_key');
      expect(result.prefill.email).toBe('test@example.com');
    });

    it('should throw NotFoundException if application not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.createRazorpayOrder(mockUserId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user is not the applicant', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        applicantId: 'different-user',
      } as any);

      await expect(service.createRazorpayOrder(mockUserId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ──────────────────────── verifyRazorpayPayment ───────────────────────────

  describe('verifyRazorpayPayment', () => {
    const dto = {
      orderId: 'order_abc123',
      paymentId: 'pay_razor_001',
      signature: 'valid_sig',
    };

    it('should verify payment and mark as COMPLETED on valid signature', async () => {
      prisma.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.application.update.mockResolvedValue({} as any);

      // Mock crypto HMAC to produce the matching signature
      const mockDigest = jest.fn().mockReturnValue('valid_sig');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      (crypto.createHmac as jest.Mock).mockReturnValue({ update: mockUpdate });

      const result = await service.verifyRazorpayPayment(dto);

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'rzp_test_secret');
      expect(mockUpdate).toHaveBeenCalledWith('order_abc123|pay_razor_001');
      expect(mockDigest).toHaveBeenCalledWith('hex');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId },
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
            razorpayPaymentId: 'pay_razor_001',
            razorpaySignature: 'valid_sig',
          }),
        }),
      );
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should mark payment FAILED and throw on invalid signature', async () => {
      prisma.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      } as any);

      const mockDigest = jest.fn().mockReturnValue('wrong_sig');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      (crypto.createHmac as jest.Mock).mockReturnValue({ update: mockUpdate });

      await expect(service.verifyRazorpayPayment(dto)).rejects.toThrow(BadRequestException);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('should throw NotFoundException if payment not found by orderId', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.verifyRazorpayPayment(dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────── recordManualPayment ─────────────────────────────

  describe('recordManualPayment', () => {
    const dto = {
      applicationId: mockAppId,
      paymentType: PaymentType.APPLICATION_FEE,
      baseAmount: 25000,
      utrNumber: 'UTR123456',
      neftDate: '2025-06-15',
      remitterBankName: 'HDFC Bank',
      apcdTypeCount: 1,
    };

    it('should create a manual payment with VERIFICATION_PENDING status', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.payment.create.mockResolvedValue({
        ...mockPayment,
        paymentMethod: PaymentMethod.NEFT,
        status: PaymentStatus.VERIFICATION_PENDING,
        utrNumber: dto.utrNumber,
      } as any);

      const result = await service.recordManualPayment(mockUserId, dto);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: mockAppId,
          paymentType: PaymentType.APPLICATION_FEE,
          paymentMethod: PaymentMethod.NEFT,
          status: PaymentStatus.VERIFICATION_PENDING,
          baseAmount: 25000,
          gstRate: 18,
          gstAmount: 4500,
          totalAmount: 29500,
          apcdTypeCount: 1,
          utrNumber: 'UTR123456',
          neftDate: new Date('2025-06-15'),
          remitterBankName: 'HDFC Bank',
          neftAmount: 29500,
        }),
      });
      expect(result.status).toBe(PaymentStatus.VERIFICATION_PENDING);
    });

    it('should throw NotFoundException if application not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.recordManualPayment(mockUserId, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────── verifyManualPayment ─────────────────────────────

  describe('verifyManualPayment', () => {
    const pendingPayment = {
      ...mockPayment,
      paymentMethod: PaymentMethod.NEFT,
      status: PaymentStatus.VERIFICATION_PENDING,
    };

    it('should mark payment VERIFIED when approved', async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...pendingPayment,
        status: PaymentStatus.VERIFIED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.application.update.mockResolvedValue({} as any);

      const result = await service.verifyManualPayment(
        mockPaymentId,
        mockOfficerId,
        true,
        'Looks good',
      );

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: expect.objectContaining({
          status: PaymentStatus.VERIFIED,
          verifiedById: mockOfficerId,
          verificationNote: 'Looks good',
          verifiedAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe(PaymentStatus.VERIFIED);
    });

    it('should mark payment FAILED when rejected and not update application', async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...pendingPayment,
        status: PaymentStatus.FAILED,
      } as any);

      await service.verifyManualPayment(mockPaymentId, mockOfficerId, false, 'UTR mismatch');

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
          verificationNote: 'UTR mismatch',
        }),
      });
      // Should NOT call application.findUnique for status update
      expect(prisma.application.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.verifyManualPayment(mockPaymentId, mockOfficerId, true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if payment is not VERIFICATION_PENDING', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);

      await expect(service.verifyManualPayment(mockPaymentId, mockOfficerId, true)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ──────────────────── getPaymentsForApplication ───────────────────────────

  describe('getPaymentsForApplication', () => {
    it('should return payments for an application ordered by createdAt desc', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPayment] as any);

      const result = await service.getPaymentsForApplication(mockAppId);

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { applicationId: mockAppId },
        include: {
          verifiedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  // ─────────────── getPendingVerificationPayments ───────────────────────────

  describe('getPendingVerificationPayments', () => {
    it('should return payments with VERIFICATION_PENDING status', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPayment] as any);

      const result = await service.getPendingVerificationPayments();

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { status: PaymentStatus.VERIFICATION_PENDING },
        include: expect.objectContaining({
          application: expect.any(Object),
        }),
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  // ───────────────────────── getPaymentById ─────────────────────────────────

  describe('getPaymentById', () => {
    it('should return payment with related data', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as any);

      const result = await service.getPaymentById(mockPaymentId);

      expect(prisma.payment.findUnique).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        include: expect.objectContaining({
          application: expect.any(Object),
          verifiedBy: expect.any(Object),
        }),
      });
      expect(result.id).toBe(mockPaymentId);
    });

    it('should throw NotFoundException when payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.getPaymentById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────── getPaymentStats ─────────────────────────────────

  describe('getPaymentStats', () => {
    it('should return aggregated payment statistics', async () => {
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 500000 }, _count: 10 } as any)
        .mockResolvedValueOnce({ _sum: { totalAmount: 300000 }, _count: 6 } as any);
      prisma.payment.count.mockResolvedValueOnce(3 as any).mockResolvedValueOnce(1 as any);

      const result = await service.getPaymentStats();

      expect(result).toEqual({
        totalPayments: 10,
        totalAmount: 500000,
        verifiedPayments: 6,
        verifiedAmount: 300000,
        pendingVerification: 3,
        failedPayments: 1,
      });
    });

    it('should default totalAmount to 0 when null', async () => {
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: null }, _count: 0 } as any)
        .mockResolvedValueOnce({ _sum: { totalAmount: null }, _count: 0 } as any);
      prisma.payment.count.mockResolvedValueOnce(0 as any).mockResolvedValueOnce(0 as any);

      const result = await service.getPaymentStats();

      expect(result.totalAmount).toBe(0);
      expect(result.verifiedAmount).toBe(0);
    });
  });

  // ──────────── updateApplicationStatusAfterPayment (private) ───────────────

  describe('updateApplicationStatusAfterPayment (via verifyRazorpayPayment)', () => {
    it('should move SUBMITTED application to UNDER_REVIEW after payment verification', async () => {
      const submittedApp = {
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      };

      prisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        paymentType: PaymentType.APPLICATION_FEE,
      } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(submittedApp as any);
      prisma.application.update.mockResolvedValue({} as any);

      const mockDigest = jest.fn().mockReturnValue('valid_sig');
      const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
      (crypto.createHmac as jest.Mock).mockReturnValue({ update: mockUpdate });

      await service.verifyRazorpayPayment({
        orderId: 'order_abc123',
        paymentId: 'pay_razor_001',
        signature: 'valid_sig',
      });

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: mockAppId },
        data: {
          status: ApplicationStatus.UNDER_REVIEW,
          statusHistory: {
            create: expect.objectContaining({
              fromStatus: ApplicationStatus.SUBMITTED,
              toStatus: ApplicationStatus.UNDER_REVIEW,
            }),
          },
        },
      });
    });
  });
});
