import { Injectable } from '@nestjs/common';
import { calculateFee, calculateApplicationTotalFees, FeeCalculation } from '@apcd/shared';
import { PaymentType } from '@apcd/database';

import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class FeeCalculatorService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate total fees for a new application based on selected APCD types
   */
  async calculateForApplication(
    applicationId: string,
    userId: string,
  ): Promise<{
    applicationFee: FeeCalculation;
    empanelmentFee: FeeCalculation;
    grandTotal: number;
    isDiscountEligible: boolean;
  }> {
    // Count APCD types seeking empanelment
    const apcdCount = await this.prisma.applicationApcd.count({
      where: { applicationId, seekingEmpanelment: true },
    });

    // Check discount eligibility
    const profile = await this.prisma.oemProfile.findFirst({
      where: { userId },
    });

    const isDiscountEligible =
      !!profile && (profile.isMSE || profile.isStartup || profile.isLocalSupplier);

    const result = calculateApplicationTotalFees(
      Math.max(apcdCount, 1),
      isDiscountEligible,
    );

    return { ...result, isDiscountEligible };
  }

  /**
   * Calculate a single fee (e.g., field verification, renewal)
   */
  calculateSingleFee(
    paymentType: PaymentType,
    quantity: number,
    isDiscountEligible: boolean,
  ): FeeCalculation {
    return calculateFee(paymentType as any, quantity, isDiscountEligible);
  }
}
