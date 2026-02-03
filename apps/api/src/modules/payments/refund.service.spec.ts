import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import { RefundService } from './refund.service';

describe('RefundService', () => {
  let service: RefundService;
  let prisma: DeepMockProxy<PrismaClient>;
  let auditService: { log: jest.Mock };

  const mockPaymentId = 'pay-001';
  const mockRefundId = 'refund-001';
  const mockUserId = 'user-001';
  const mockAdminId = 'admin-001';

  const mockPayment = {
    id: mockPaymentId,
    applicationId: 'app-001',
    status: 'COMPLETED',
    totalAmount: new Prisma.Decimal(29500),
    baseAmount: new Prisma.Decimal(25000),
    gstRate: new Prisma.Decimal(18),
    gstAmount: new Prisma.Decimal(4500),
    refunds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRefund = {
    id: mockRefundId,
    paymentId: mockPaymentId,
    refundAmount: new Prisma.Decimal(10000),
    reason: 'Overcharged',
    status: 'PENDING',
    gatewayRefundId: null,
    requestedBy: mockUserId,
    approvedBy: null,
    approvedAt: null,
    processedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
        {
          provide: AuditLogService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get<RefundService>(RefundService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────── requestRefund ──────────────────────────────

  describe('requestRefund', () => {
    it('should create a PENDING refund record', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        refunds: [],
      } as unknown as never);

      prisma.paymentRefund.create.mockResolvedValue({
        ...mockRefund,
        status: 'PENDING',
      } as unknown as never);

      const result = await service.requestRefund(mockPaymentId, 10000, 'Overcharged', mockUserId);

      expect(result.status).toBe('PENDING');
      expect(prisma.paymentRefund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: mockPaymentId,
          refundAmount: expect.any(Prisma.Decimal),
          reason: 'Overcharged',
          status: 'PENDING',
          requestedBy: mockUserId,
        }),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFUND_REQUESTED',
          entityType: 'PaymentRefund',
        }),
      );
    });

    it('should throw NotFoundException when payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.requestRefund(mockPaymentId, 10000, 'Test', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when payment is not in refundable state', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        status: 'INITIATED',
        refunds: [],
      } as unknown as never);

      await expect(service.requestRefund(mockPaymentId, 10000, 'Test', mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when refund amount exceeds payment amount', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        refunds: [],
      } as unknown as never);

      await expect(service.requestRefund(mockPaymentId, 50000, 'Test', mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when refund amount exceeds remaining refundable', async () => {
      const existingRefund = {
        ...mockRefund,
        status: 'COMPLETED',
        refundAmount: new Prisma.Decimal(25000),
      };

      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        refunds: [existingRefund],
      } as unknown as never);

      // Remaining is 29500 - 25000 = 4500, requesting 5000
      await expect(service.requestRefund(mockPaymentId, 5000, 'Test', mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow refund when existing refunds leave enough remaining', async () => {
      const existingRefund = {
        ...mockRefund,
        status: 'COMPLETED',
        refundAmount: new Prisma.Decimal(10000),
      };

      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        refunds: [existingRefund],
      } as unknown as never);

      prisma.paymentRefund.create.mockResolvedValue({
        ...mockRefund,
        refundAmount: new Prisma.Decimal(5000),
      } as unknown as never);

      // Remaining is 29500 - 10000 = 19500, requesting 5000 should succeed
      const result = await service.requestRefund(mockPaymentId, 5000, 'Partial refund', mockUserId);

      expect(result).toBeDefined();
      expect(prisma.paymentRefund.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when refund amount is zero or negative', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        refunds: [],
      } as unknown as never);

      await expect(service.requestRefund(mockPaymentId, 0, 'Test', mockUserId)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.requestRefund(mockPaymentId, -100, 'Test', mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not count non-COMPLETED refunds toward already refunded total', async () => {
      const pendingRefund = {
        ...mockRefund,
        status: 'PENDING',
        refundAmount: new Prisma.Decimal(29000),
      };

      prisma.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        refunds: [pendingRefund],
      } as unknown as never);

      prisma.paymentRefund.create.mockResolvedValue({
        ...mockRefund,
      } as unknown as never);

      // PENDING refund should not count, so full 29500 is available
      const result = await service.requestRefund(mockPaymentId, 10000, 'Test', mockUserId);

      expect(result).toBeDefined();
    });
  });

  // ───────────────────────────── approveRefund ──────────────────────────────

  describe('approveRefund', () => {
    it('should set status to APPROVED with approvedBy and approvedAt', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        status: 'PENDING',
      } as unknown as never);

      prisma.paymentRefund.update.mockResolvedValue({
        ...mockRefund,
        status: 'APPROVED',
        approvedBy: mockAdminId,
        approvedAt: new Date(),
      } as unknown as never);

      const result = await service.approveRefund(mockRefundId, mockAdminId);

      expect(result.status).toBe('APPROVED');
      expect(result.approvedBy).toBe(mockAdminId);
      expect(result.approvedAt).toBeInstanceOf(Date);
      expect(prisma.paymentRefund.update).toHaveBeenCalledWith({
        where: { id: mockRefundId },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedBy: mockAdminId,
          approvedAt: expect.any(Date),
        }),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFUND_APPROVED',
          entityType: 'PaymentRefund',
          entityId: mockRefundId,
        }),
      );
    });

    it('should throw NotFoundException when refund does not exist', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue(null);

      await expect(service.approveRefund('nonexistent', mockAdminId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when refund is not PENDING', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        status: 'COMPLETED',
      } as unknown as never);

      await expect(service.approveRefund(mockRefundId, mockAdminId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ───────────────────────────── processRefund ──────────────────────────────

  describe('processRefund', () => {
    it('should update status through PROCESSING to COMPLETED with gatewayRefundId and processedAt', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        status: 'APPROVED',
        payment: mockPayment,
      } as unknown as never);

      prisma.paymentRefund.update
        .mockResolvedValueOnce({
          ...mockRefund,
          status: 'PROCESSING',
        } as unknown as never)
        .mockResolvedValueOnce({
          ...mockRefund,
          status: 'COMPLETED',
          gatewayRefundId: expect.any(String),
          processedAt: new Date(),
        } as unknown as never);

      const result = await service.processRefund(mockRefundId);

      expect(result.status).toBe('COMPLETED');

      // First call sets PROCESSING
      expect(prisma.paymentRefund.update).toHaveBeenNthCalledWith(1, {
        where: { id: mockRefundId },
        data: { status: 'PROCESSING' },
      });

      // Second call sets COMPLETED with gateway details
      expect(prisma.paymentRefund.update).toHaveBeenNthCalledWith(2, {
        where: { id: mockRefundId },
        data: expect.objectContaining({
          status: 'COMPLETED',
          gatewayRefundId: expect.stringContaining('rfnd_placeholder_'),
          processedAt: expect.any(Date),
        }),
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFUND_PROCESSED',
          entityType: 'PaymentRefund',
        }),
      );
    });

    it('should throw NotFoundException when refund does not exist', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue(null);

      await expect(service.processRefund('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when refund is not APPROVED', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        status: 'PENDING',
      } as unknown as never);

      await expect(service.processRefund(mockRefundId)).rejects.toThrow(BadRequestException);
    });
  });

  // ───────────────────────────── rejectRefund ───────────────────────────────

  describe('rejectRefund', () => {
    it('should set status to FAILED with rejection reason', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        status: 'PENDING',
      } as unknown as never);

      prisma.paymentRefund.update.mockResolvedValue({
        ...mockRefund,
        status: 'FAILED',
        rejectionReason: 'Invalid refund request',
      } as unknown as never);

      const result = await service.rejectRefund(
        mockRefundId,
        mockAdminId,
        'Invalid refund request',
      );

      expect(result.status).toBe('FAILED');
      expect(result.rejectionReason).toBe('Invalid refund request');
      expect(prisma.paymentRefund.update).toHaveBeenCalledWith({
        where: { id: mockRefundId },
        data: {
          status: 'FAILED',
          rejectionReason: 'Invalid refund request',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFUND_REJECTED',
          userId: mockAdminId,
        }),
      );
    });

    it('should throw NotFoundException when refund does not exist', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue(null);

      await expect(service.rejectRefund('nonexistent', mockAdminId, 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when refund is not PENDING', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        status: 'APPROVED',
      } as unknown as never);

      await expect(service.rejectRefund(mockRefundId, mockAdminId, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─────────────────────── getRefundsByPayment ──────────────────────────────

  describe('getRefundsByPayment', () => {
    it('should return all refunds for a payment', async () => {
      const refunds = [
        { ...mockRefund, id: 'refund-1' },
        { ...mockRefund, id: 'refund-2' },
      ];
      prisma.paymentRefund.findMany.mockResolvedValue(refunds as unknown as never);

      const result = await service.getRefundsByPayment(mockPaymentId);

      expect(result).toHaveLength(2);
      expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith({
        where: { paymentId: mockPaymentId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ──────────────────────────── getRefund ────────────────────────────────────

  describe('getRefund', () => {
    it('should return refund with payment details', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        ...mockRefund,
        payment: mockPayment,
      } as unknown as never);

      const result = await service.getRefund(mockRefundId);

      expect(result.id).toBe(mockRefundId);
      expect(prisma.paymentRefund.findUnique).toHaveBeenCalledWith({
        where: { id: mockRefundId },
        include: expect.objectContaining({
          payment: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException when refund does not exist', async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue(null);

      await expect(service.getRefund('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────── getPendingRefunds ────────────────────────────────

  describe('getPendingRefunds', () => {
    it('should return only PENDING refunds', async () => {
      prisma.paymentRefund.findMany.mockResolvedValue([mockRefund] as unknown as never);

      const result = await service.getPendingRefunds();

      expect(result).toHaveLength(1);
      expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        }),
      );
    });
  });

  // ─────────────────────── getTotalRefunded ─────────────────────────────────

  describe('getTotalRefunded', () => {
    it('should return sum of COMPLETED refund amounts', async () => {
      prisma.paymentRefund.aggregate.mockResolvedValue({
        _sum: { refundAmount: new Prisma.Decimal(15000) },
        _count: 2,
        _avg: { refundAmount: null },
        _min: { refundAmount: null },
        _max: { refundAmount: null },
      } as unknown as never);

      const result = await service.getTotalRefunded(mockPaymentId);

      expect(result).toBe(15000);
      expect(prisma.paymentRefund.aggregate).toHaveBeenCalledWith({
        where: {
          paymentId: mockPaymentId,
          status: 'COMPLETED',
        },
        _sum: { refundAmount: true },
      });
    });

    it('should return 0 when no completed refunds exist', async () => {
      prisma.paymentRefund.aggregate.mockResolvedValue({
        _sum: { refundAmount: null },
        _count: 0,
        _avg: { refundAmount: null },
        _min: { refundAmount: null },
        _max: { refundAmount: null },
      } as unknown as never);

      const result = await service.getTotalRefunded(mockPaymentId);

      expect(result).toBe(0);
    });
  });
});
