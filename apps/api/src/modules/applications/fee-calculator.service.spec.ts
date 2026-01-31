import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { FeeCalculatorService } from './fee-calculator.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockProfileNoDiscount = {
  id: 'profile-1',
  userId: 'user-1',
  companyName: 'Regular Corp',
  isMSE: false,
  isStartup: false,
  isLocalSupplier: false,
};

const mockProfileMSE = {
  id: 'profile-2',
  userId: 'user-2',
  companyName: 'MSE Corp',
  isMSE: true,
  isStartup: false,
  isLocalSupplier: false,
};

const mockProfileStartup = {
  id: 'profile-3',
  userId: 'user-3',
  companyName: 'Startup Inc',
  isMSE: false,
  isStartup: true,
  isLocalSupplier: false,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FeeCalculatorService', () => {
  let service: FeeCalculatorService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeCalculatorService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeeCalculatorService>(FeeCalculatorService);
    prisma = mockPrisma;
  });

  // =========================================================================
  // calculateForApplication()
  // =========================================================================

  describe('calculateForApplication', () => {
    it('should calculate fees without discount for regular profile', async () => {
      prisma.applicationApcd.count.mockResolvedValue(3);
      prisma.oemProfile.findFirst.mockResolvedValue(mockProfileNoDiscount as any);

      const result = await service.calculateForApplication('app-1', 'user-1');

      expect(result.isDiscountEligible).toBe(false);
      // Application fee: 25000 + 18% GST = 29500
      expect(result.applicationFee.baseAmount).toBe(25000);
      expect(result.applicationFee.discountPercent).toBe(0);
      expect(result.applicationFee.gstRate).toBe(18);
      expect(result.applicationFee.totalAmount).toBe(29500);
      // Empanelment fee: 65000 * 3 = 195000, + 18% GST = 230100
      expect(result.empanelmentFee.baseAmount).toBe(65000);
      expect(result.empanelmentFee.quantity).toBe(3);
      expect(result.empanelmentFee.subtotal).toBe(195000);
      expect(result.empanelmentFee.totalAmount).toBe(230100);
      // Grand total: 29500 + 230100 = 259600
      expect(result.grandTotal).toBe(259600);
    });

    it('should apply 15% discount for MSE profile', async () => {
      prisma.applicationApcd.count.mockResolvedValue(1);
      prisma.oemProfile.findFirst.mockResolvedValue(mockProfileMSE as any);

      const result = await service.calculateForApplication('app-1', 'user-2');

      expect(result.isDiscountEligible).toBe(true);
      // Application fee: 25000 - 15% = 21250, + 18% GST = 21250 + 3825 = 25075
      expect(result.applicationFee.discountPercent).toBe(15);
      expect(result.applicationFee.discountAmount).toBe(3750);
      expect(result.applicationFee.amountAfterDiscount).toBe(21250);
      expect(result.applicationFee.gstAmount).toBe(3825);
      expect(result.applicationFee.totalAmount).toBe(25075);
    });

    it('should apply 15% discount for startup profile', async () => {
      prisma.applicationApcd.count.mockResolvedValue(2);
      prisma.oemProfile.findFirst.mockResolvedValue(mockProfileStartup as any);

      const result = await service.calculateForApplication('app-1', 'user-3');

      expect(result.isDiscountEligible).toBe(true);
      expect(result.applicationFee.discountPercent).toBe(15);
      // Empanelment fee: 65000 * 2 = 130000 - 15% = 110500, + 18% GST = 130390
      expect(result.empanelmentFee.subtotal).toBe(130000);
      expect(result.empanelmentFee.discountAmount).toBe(19500);
      expect(result.empanelmentFee.amountAfterDiscount).toBe(110500);
      expect(result.empanelmentFee.gstAmount).toBe(19890);
      expect(result.empanelmentFee.totalAmount).toBe(130390);
    });

    it('should use minimum 1 APCD type when count is 0', async () => {
      prisma.applicationApcd.count.mockResolvedValue(0);
      prisma.oemProfile.findFirst.mockResolvedValue(mockProfileNoDiscount as any);

      const result = await service.calculateForApplication('app-1', 'user-1');

      // Should use Math.max(0, 1) = 1 for empanelment quantity
      expect(result.empanelmentFee.quantity).toBe(1);
    });

    it('should not be discount eligible when profile is null', async () => {
      prisma.applicationApcd.count.mockResolvedValue(1);
      prisma.oemProfile.findFirst.mockResolvedValue(null);

      const result = await service.calculateForApplication('app-1', 'user-1');

      expect(result.isDiscountEligible).toBe(false);
    });

    it('should calculate SOP example: 5 products = 25,000 + (65,000 x 5)', async () => {
      prisma.applicationApcd.count.mockResolvedValue(5);
      prisma.oemProfile.findFirst.mockResolvedValue(mockProfileNoDiscount as any);

      const result = await service.calculateForApplication('app-1', 'user-1');

      // Application: 25000 + 4500 GST = 29500
      // Empanelment: 325000 + 58500 GST = 383500
      // Grand total: 413000
      expect(result.applicationFee.subtotal).toBe(25000);
      expect(result.empanelmentFee.subtotal).toBe(325000);
      expect(result.grandTotal).toBe(29500 + 383500);
    });
  });

  // =========================================================================
  // calculateSingleFee()
  // =========================================================================

  describe('calculateSingleFee', () => {
    it('should calculate APPLICATION_FEE without discount', () => {
      const result = service.calculateSingleFee('APPLICATION_FEE' as any, 1, false);

      expect(result.baseAmount).toBe(25000);
      expect(result.subtotal).toBe(25000);
      expect(result.discountPercent).toBe(0);
      expect(result.gstAmount).toBe(4500);
      expect(result.totalAmount).toBe(29500);
    });

    it('should calculate APPLICATION_FEE with discount', () => {
      const result = service.calculateSingleFee('APPLICATION_FEE' as any, 1, true);

      expect(result.discountPercent).toBe(15);
      expect(result.discountAmount).toBe(3750);
      expect(result.amountAfterDiscount).toBe(21250);
      expect(result.totalAmount).toBe(25075);
    });

    it('should calculate EMPANELMENT_FEE for multiple items', () => {
      const result = service.calculateSingleFee('EMPANELMENT_FEE' as any, 3, false);

      expect(result.baseAmount).toBe(65000);
      expect(result.quantity).toBe(3);
      expect(result.subtotal).toBe(195000);
      expect(result.gstAmount).toBe(35100);
      expect(result.totalAmount).toBe(230100);
    });

    it('should calculate FIELD_VERIFICATION fee without discount even when eligible', () => {
      const result = service.calculateSingleFee('FIELD_VERIFICATION' as any, 1, true);

      // FIELD_VERIFICATION is not in DISCOUNT_ELIGIBLE_FEE_TYPES
      expect(result.baseAmount).toBe(57000);
      expect(result.discountPercent).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.gstAmount).toBe(10260);
      expect(result.totalAmount).toBe(67260);
    });

    it('should calculate ANNUAL_RENEWAL with discount when eligible', () => {
      const result = service.calculateSingleFee('ANNUAL_RENEWAL' as any, 1, true);

      // ANNUAL_RENEWAL is discount eligible
      expect(result.baseAmount).toBe(35000);
      expect(result.discountPercent).toBe(15);
      expect(result.discountAmount).toBe(5250);
      expect(result.amountAfterDiscount).toBe(29750);
      expect(result.gstAmount).toBe(5355);
      expect(result.totalAmount).toBe(35105);
    });

    it('should return 0 total for EMISSION_TESTING (charged on actuals)', () => {
      const result = service.calculateSingleFee('EMISSION_TESTING' as any, 1, false);

      expect(result.baseAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });
});
