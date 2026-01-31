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
  let configGet: jest.Mock;
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

  /**
   * Helper to set up crypto.createHmac mock so it returns a given digest value.
   */
  function mockHmacDigest(digestValue: string) {
    const mockDigest = jest.fn().mockReturnValue(digestValue);
    const mockUpdate = jest.fn().mockReturnValue({ digest: mockDigest });
    (crypto.createHmac as jest.Mock).mockReturnValue({ update: mockUpdate });
    return { mockUpdate, mockDigest };
  }

  beforeEach(async () => {
    configGet = jest.fn((key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        RAZORPAY_KEY_ID: 'rzp_test_key',
        RAZORPAY_KEY_SECRET: 'rzp_test_secret',
      };
      return map[key] ?? defaultValue ?? '';
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────── getBankDetails ─────────────────────────────

  describe('getBankDetails', () => {
    it('should return NPC bank details with all required fields', () => {
      const details = service.getBankDetails();
      expect(details).toEqual({
        bankName: 'State Bank of India',
        accountName: 'National Productivity Council',
        accountNumber: expect.any(String),
        ifscCode: expect.any(String),
        branch: 'New Delhi',
      });
    });

    it('should return consistent results on multiple calls', () => {
      const first = service.getBankDetails();
      const second = service.getBankDetails();
      expect(first).toEqual(second);
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
      expect(result.applicationFee.gstRate).toBe(18);
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
      expect(result.grandTotal).toBe(29500 + 230100);
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
      expect(result.refundAmount).toBe(13500);
    });

    it('should flag discount eligibility for local supplier', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: false, isStartup: false, isLocalSupplier: true } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.isDiscountEligible).toBe(true);
      expect(result.refundAmount).toBe(13500);
    });

    it('should flag discount when multiple eligibility flags are true', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: true, isStartup: true, isLocalSupplier: true } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.isDiscountEligible).toBe(true);
      // refund amount is the same regardless of how many flags are true
      expect(result.refundAmount).toBe(13500);
    });

    it('should compute correct refund amount with multiple APCDs and discount', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: true, isStartup: false, isLocalSupplier: false } as any,
        applicationApcds: [
          { seekingEmpanelment: true },
          { seekingEmpanelment: true },
        ] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);

      expect(result.apcdCount).toBe(2);
      // refundAmount = (25000 + 65000 * 2) * 0.15 = 155000 * 0.15 = 23250
      expect(result.refundAmount).toBe(23250);
    });

    it('should NOT be discount eligible when oemProfile exists but all flags false', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: { isMSE: false, isStartup: false, isLocalSupplier: false } as any,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.isDiscountEligible).toBe(false);
      expect(result.refundAmount).toBe(0);
    });

    it('should NOT be discount eligible when oemProfile is null', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        oemProfile: null,
        applicationApcds: [{ seekingEmpanelment: true }] as any,
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.isDiscountEligible).toBe(false);
      expect(result.refundAmount).toBe(0);
    });

    it('should default apcdCount to 1 when no APCD entries', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        applicationApcds: [],
      } as any);

      const result = await service.calculateFees(mockAppId, mockUserId);
      expect(result.apcdCount).toBe(1);
      // empanelment fee should still be computed for 1
      expect(result.empanelmentFee.baseAmount).toBe(65000);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.calculateFees(mockAppId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
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
      expect(result.name).toBe('NPC APCD Portal');
      expect(result.description).toContain('APPLICATION_FEE');
      expect(result.prefill.email).toBe('test@example.com');
      expect(result.prefill.contact).toBe('9876543210');
    });

    it('should default apcdTypeCount to 1 when not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.payment.create.mockResolvedValue({ ...mockPayment } as any);

      const dtoWithoutCount = {
        applicationId: mockAppId,
        paymentType: PaymentType.EMPANELMENT_FEE,
        baseAmount: 65000,
      };

      await service.createRazorpayOrder(mockUserId, dtoWithoutCount);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          apcdTypeCount: 1,
        }),
      });
    });

    it('should compute correct GST for empanelment fee', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.payment.create.mockResolvedValue({ ...mockPayment } as any);

      const empanelmentDto = {
        applicationId: mockAppId,
        paymentType: PaymentType.EMPANELMENT_FEE,
        baseAmount: 195000, // 65000 * 3
        apcdTypeCount: 3,
      };

      await service.createRazorpayOrder(mockUserId, empanelmentDto);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          baseAmount: 195000,
          gstAmount: 35100,
          totalAmount: 230100,
          apcdTypeCount: 3,
        }),
      });
    });

    it('should throw NotFoundException if application not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.createRazorpayOrder(mockUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
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

      mockHmacDigest('valid_sig');

      const result = await service.verifyRazorpayPayment(dto);

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'rzp_test_secret');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId },
          data: expect.objectContaining({
            status: PaymentStatus.COMPLETED,
            razorpayPaymentId: 'pay_razor_001',
            razorpaySignature: 'valid_sig',
            verifiedAt: expect.any(Date),
          }),
        }),
      );
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should pass correct HMAC input: orderId|paymentId', async () => {
      prisma.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.application.update.mockResolvedValue({} as any);

      const { mockUpdate } = mockHmacDigest('valid_sig');

      await service.verifyRazorpayPayment(dto);

      expect(mockUpdate).toHaveBeenCalledWith('order_abc123|pay_razor_001');
    });

    it('should mark payment FAILED and throw on invalid signature', async () => {
      prisma.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      } as any);

      mockHmacDigest('wrong_sig');

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

    it('should use RAZORPAY_KEY_SECRET from config for HMAC', async () => {
      prisma.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.application.update.mockResolvedValue({} as any);

      mockHmacDigest('valid_sig');

      await service.verifyRazorpayPayment(dto);

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'rzp_test_secret');
    });
  });

  describe('verifyRazorpayPayment with empty RAZORPAY_KEY_SECRET', () => {
    let serviceEmptySecret: PaymentsService;
    let prismaEmpty: DeepMockProxy<PrismaClient>;

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
                  RAZORPAY_KEY_SECRET: '',
                };
                return map[key] ?? defaultValue ?? '';
              }),
            },
          },
        ],
      }).compile();

      serviceEmptySecret = module.get<PaymentsService>(PaymentsService);
      prismaEmpty = module.get(PrismaService);
    });

    it('should use empty string as HMAC secret when RAZORPAY_KEY_SECRET is empty', async () => {
      prismaEmpty.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prismaEmpty.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prismaEmpty.application.findUnique.mockResolvedValue(mockApplication as any);
      prismaEmpty.application.update.mockResolvedValue({} as any);

      mockHmacDigest('some_sig');

      await serviceEmptySecret.verifyRazorpayPayment({
        orderId: 'order_abc123',
        paymentId: 'pay_razor_001',
        signature: 'some_sig',
      });

      // The HMAC was created with an empty string as the secret
      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', '');
    });

    it('should fail signature verification when secret is empty and signature does not match', async () => {
      prismaEmpty.payment.findFirst.mockResolvedValue({ ...mockPayment } as any);
      prismaEmpty.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      } as any);

      // The HMAC with empty secret will produce a different digest
      mockHmacDigest('digest_with_empty_secret');

      await expect(
        serviceEmptySecret.verifyRazorpayPayment({
          orderId: 'order_abc123',
          paymentId: 'pay_razor_001',
          signature: 'attacker_signature',
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('should default apcdTypeCount to 1 when not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.payment.create.mockResolvedValue({
        ...mockPayment,
        paymentMethod: PaymentMethod.NEFT,
        status: PaymentStatus.VERIFICATION_PENDING,
      } as any);

      const dtoWithoutCount = {
        applicationId: mockAppId,
        paymentType: PaymentType.APPLICATION_FEE,
        baseAmount: 25000,
        utrNumber: 'UTR999',
        neftDate: '2025-08-01',
        remitterBankName: 'SBI',
      };

      await service.recordManualPayment(mockUserId, dtoWithoutCount);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          apcdTypeCount: 1,
        }),
      });
    });

    it('should throw NotFoundException if application not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.recordManualPayment(mockUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if user is not the applicant', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        applicantId: 'someone-else',
      } as any);

      await expect(service.recordManualPayment(mockUserId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // ─── Date format edge cases (known bug pattern) ───

    describe('neftDate parsing edge cases', () => {
      it('should correctly parse ISO format date string (YYYY-MM-DD)', async () => {
        prisma.application.findUnique.mockResolvedValue(mockApplication as any);
        prisma.payment.create.mockResolvedValue({
          ...mockPayment,
          status: PaymentStatus.VERIFICATION_PENDING,
        } as any);

        const isoDto = { ...dto, neftDate: '2026-02-21' };
        await service.recordManualPayment(mockUserId, isoDto);

        const createCall = prisma.payment.create.mock.calls[0][0];
        const parsedDate = createCall.data.neftDate as Date;

        expect(parsedDate).toBeInstanceOf(Date);
        expect(parsedDate.getFullYear()).toBe(2026);
        expect(parsedDate.getMonth()).toBe(1); // February = 1 (0-indexed)
        expect(parsedDate.getDate()).toBe(21);
      });

      it('should demonstrate DD-MM-YYYY date string bug: new Date("21-02-2026") produces Invalid Date', async () => {
        prisma.application.findUnique.mockResolvedValue(mockApplication as any);
        prisma.payment.create.mockResolvedValue({
          ...mockPayment,
          status: PaymentStatus.VERIFICATION_PENDING,
        } as any);

        const badDto = { ...dto, neftDate: '21-02-2026' };
        await service.recordManualPayment(mockUserId, badDto);

        const createCall = prisma.payment.create.mock.calls[0][0];
        const parsedDate = createCall.data.neftDate as Date;

        // new Date('21-02-2026') results in Invalid Date because JS Date
        // constructor does not understand DD-MM-YYYY format.
        // This test documents the bug: the service passes an invalid Date to Prisma.
        expect(isNaN(parsedDate.getTime())).toBe(true);
      });

      it('should demonstrate MM-DD-YYYY ambiguity: "02-21-2026" is parsed as Feb 21', async () => {
        prisma.application.findUnique.mockResolvedValue(mockApplication as any);
        prisma.payment.create.mockResolvedValue({
          ...mockPayment,
          status: PaymentStatus.VERIFICATION_PENDING,
        } as any);

        const ambiguousDto = { ...dto, neftDate: '02-21-2026' };
        await service.recordManualPayment(mockUserId, ambiguousDto);

        const createCall = prisma.payment.create.mock.calls[0][0];
        const parsedDate = createCall.data.neftDate as Date;

        // JS interprets MM-DD-YYYY, so this works but could be ambiguous
        expect(parsedDate.getMonth()).toBe(1); // February
        expect(parsedDate.getDate()).toBe(21);
      });

      it('should handle ISO-8601 datetime string with timezone', async () => {
        prisma.application.findUnique.mockResolvedValue(mockApplication as any);
        prisma.payment.create.mockResolvedValue({
          ...mockPayment,
          status: PaymentStatus.VERIFICATION_PENDING,
        } as any);

        const isoDatetime = { ...dto, neftDate: '2026-02-21T00:00:00.000Z' };
        await service.recordManualPayment(mockUserId, isoDatetime);

        const createCall = prisma.payment.create.mock.calls[0][0];
        const parsedDate = createCall.data.neftDate as Date;

        expect(parsedDate).toBeInstanceOf(Date);
        expect(isNaN(parsedDate.getTime())).toBe(false);
      });
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

    it('should mark payment FAILED when rejected and not update application status', async () => {
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
      // Should NOT call application.findUnique for status update when rejected
      expect(prisma.application.findUnique).not.toHaveBeenCalled();
    });

    it('should pass undefined as verificationNote when remarks is omitted', async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...pendingPayment,
        status: PaymentStatus.VERIFIED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.verifyManualPayment(mockPaymentId, mockOfficerId, true);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: expect.objectContaining({
          verificationNote: undefined,
        }),
      });
    });

    it('should throw NotFoundException if payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if payment is not VERIFICATION_PENDING', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payment is already VERIFIED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.VERIFIED,
      } as any);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payment status is FAILED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      } as any);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payment status is INITIATED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.INITIATED,
      } as any);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payment status is PENDING', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.PENDING,
      } as any);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payment status is REFUNDED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.REFUNDED,
      } as any);

      await expect(
        service.verifyManualPayment(mockPaymentId, mockOfficerId, true),
      ).rejects.toThrow(BadRequestException);
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

    it('should return empty array when no payments exist', async () => {
      prisma.payment.findMany.mockResolvedValue([]);

      const result = await service.getPaymentsForApplication(mockAppId);
      expect(result).toHaveLength(0);
    });

    it('should return multiple payments in order', async () => {
      const payments = [
        { ...mockPayment, id: 'pay-1' },
        { ...mockPayment, id: 'pay-2' },
        { ...mockPayment, id: 'pay-3' },
      ];
      prisma.payment.findMany.mockResolvedValue(payments as any);

      const result = await service.getPaymentsForApplication(mockAppId);
      expect(result).toHaveLength(3);
    });
  });

  // ─────────────── getPendingVerificationPayments ───────────────────────────

  describe('getPendingVerificationPayments', () => {
    it('should return payments with VERIFICATION_PENDING status ordered by createdAt asc', async () => {
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

    it('should return empty array when no pending payments', async () => {
      prisma.payment.findMany.mockResolvedValue([]);

      const result = await service.getPendingVerificationPayments();
      expect(result).toHaveLength(0);
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

    it('should include applicant and oemProfile selects in the query', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment as any);

      await service.getPaymentById(mockPaymentId);

      expect(prisma.payment.findUnique).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
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
      expect(result.totalPayments).toBe(0);
      expect(result.verifiedPayments).toBe(0);
      expect(result.pendingVerification).toBe(0);
      expect(result.failedPayments).toBe(0);
    });

    it('should query VERIFIED status for verified aggregate', async () => {
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 100 }, _count: 1 } as any)
        .mockResolvedValueOnce({ _sum: { totalAmount: 100 }, _count: 1 } as any);
      prisma.payment.count.mockResolvedValueOnce(0 as any).mockResolvedValueOnce(0 as any);

      await service.getPaymentStats();

      // Second aggregate call should filter by VERIFIED
      expect(prisma.payment.aggregate).toHaveBeenCalledWith({
        where: { status: PaymentStatus.VERIFIED },
        _sum: { totalAmount: true },
        _count: true,
      });
    });

    it('should query VERIFICATION_PENDING and FAILED for counts', async () => {
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 100 }, _count: 1 } as any)
        .mockResolvedValueOnce({ _sum: { totalAmount: 100 }, _count: 1 } as any);
      prisma.payment.count.mockResolvedValueOnce(0 as any).mockResolvedValueOnce(0 as any);

      await service.getPaymentStats();

      expect(prisma.payment.count).toHaveBeenCalledWith({
        where: { status: PaymentStatus.VERIFICATION_PENDING },
      });
      expect(prisma.payment.count).toHaveBeenCalledWith({
        where: { status: PaymentStatus.FAILED },
      });
    });
  });

  // ──────────── updateApplicationStatusAfterPayment (private) ───────────────

  describe('updateApplicationStatusAfterPayment (via verifyRazorpayPayment)', () => {
    it('should move SUBMITTED application to UNDER_REVIEW after APPLICATION_FEE verification', async () => {
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

      mockHmacDigest('valid_sig');

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
              changedBy: mockUserId,
              remarks: expect.stringContaining('APPLICATION_FEE'),
            }),
          },
        },
      });
    });

    it('should move SUBMITTED application to UNDER_REVIEW after EMPANELMENT_FEE verification', async () => {
      const submittedApp = {
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      };

      prisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        paymentType: PaymentType.EMPANELMENT_FEE,
      } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(submittedApp as any);
      prisma.application.update.mockResolvedValue({} as any);

      mockHmacDigest('valid_sig');

      await service.verifyRazorpayPayment({
        orderId: 'order_abc123',
        paymentId: 'pay_razor_001',
        signature: 'valid_sig',
      });

      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.UNDER_REVIEW,
          }),
        }),
      );
    });

    it('should NOT update application status if app is not in SUBMITTED status', async () => {
      const underReviewApp = {
        ...mockApplication,
        status: ApplicationStatus.UNDER_REVIEW,
      };

      prisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        paymentType: PaymentType.APPLICATION_FEE,
      } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      prisma.application.findUnique.mockResolvedValue(underReviewApp as any);

      mockHmacDigest('valid_sig');

      await service.verifyRazorpayPayment({
        orderId: 'order_abc123',
        paymentId: 'pay_razor_001',
        signature: 'valid_sig',
      });

      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should NOT update application status if application is not found during status update', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        paymentType: PaymentType.APPLICATION_FEE,
      } as any);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      } as any);
      // First findUnique for payment includes application, but the second call
      // (in updateApplicationStatusAfterPayment) returns null
      prisma.application.findUnique.mockResolvedValue(null);

      mockHmacDigest('valid_sig');

      // Should not throw -- the method silently returns when app not found
      await expect(
        service.verifyRazorpayPayment({
          orderId: 'order_abc123',
          paymentId: 'pay_razor_001',
          signature: 'valid_sig',
        }),
      ).resolves.toBeDefined();

      expect(prisma.application.update).not.toHaveBeenCalled();
    });
  });

  describe('updateApplicationStatusAfterPayment (via verifyManualPayment)', () => {
    const pendingPayment = {
      ...mockPayment,
      paymentMethod: PaymentMethod.NEFT,
      status: PaymentStatus.VERIFICATION_PENDING,
      paymentType: PaymentType.APPLICATION_FEE,
    };

    it('should move SUBMITTED application to UNDER_REVIEW after manual payment verification', async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...pendingPayment,
        status: PaymentStatus.VERIFIED,
      } as any);
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.verifyManualPayment(mockPaymentId, mockOfficerId, true);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: mockAppId },
        data: expect.objectContaining({
          status: ApplicationStatus.UNDER_REVIEW,
        }),
      });
    });

    it('should NOT move application when manual payment is rejected', async () => {
      prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...pendingPayment,
        status: PaymentStatus.FAILED,
      } as any);

      await service.verifyManualPayment(mockPaymentId, mockOfficerId, false);

      expect(prisma.application.findUnique).not.toHaveBeenCalled();
      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should NOT update application if payment type is FIELD_VERIFICATION and app is SUBMITTED', async () => {
      const fvPayment = {
        ...pendingPayment,
        paymentType: PaymentType.FIELD_VERIFICATION,
      };

      prisma.payment.findUnique.mockResolvedValue({ ...fvPayment } as any);
      prisma.payment.update.mockResolvedValue({
        ...fvPayment,
        status: PaymentStatus.VERIFIED,
      } as any);
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await service.verifyManualPayment(mockPaymentId, mockOfficerId, true);

      // FIELD_VERIFICATION does not trigger SUBMITTED -> UNDER_REVIEW
      expect(prisma.application.update).not.toHaveBeenCalled();
    });
  });
});
