import { PaymentType } from '../types/payment.types';

/** Fee amounts in INR (excluding GST) - as per SOP */
export const FEE_AMOUNTS: Record<PaymentType, number> = {
  [PaymentType.APPLICATION_FEE]: 25000,
  [PaymentType.EMPANELMENT_FEE]: 65000,   // Per APCD model type
  [PaymentType.FIELD_VERIFICATION]: 57000,
  [PaymentType.EMISSION_TESTING]: 0,       // Charged on actuals
  [PaymentType.ANNUAL_RENEWAL]: 35000,
  [PaymentType.SURVEILLANCE_VISIT]: 0,     // Charged on actuals
};

export const GST_RATE = 18; // 18% GST

/**
 * Discount: 15% on Application, Empanelment, and Renewal fees
 * Eligible: MSEs, Class-I Local Suppliers, DPIIT-recognized Startups
 * Max 15%, benefits cannot be combined
 */
export const DISCOUNT_PERCENT = 15;

export const DISCOUNT_ELIGIBLE_FEE_TYPES: PaymentType[] = [
  PaymentType.APPLICATION_FEE,
  PaymentType.EMPANELMENT_FEE,
  PaymentType.ANNUAL_RENEWAL,
];

export interface FeeCalculation {
  paymentType: PaymentType;
  baseAmount: number;
  quantity: number;             // e.g., number of APCD types for empanelment fee
  subtotal: number;             // baseAmount * quantity
  discountPercent: number;
  discountAmount: number;
  amountAfterDiscount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

/**
 * Calculate fee with discount and GST
 */
export function calculateFee(
  paymentType: PaymentType,
  quantity: number = 1,
  isDiscountEligible: boolean = false,
): FeeCalculation {
  const baseAmount = FEE_AMOUNTS[paymentType];
  const subtotal = baseAmount * quantity;

  const canDiscount = isDiscountEligible && DISCOUNT_ELIGIBLE_FEE_TYPES.includes(paymentType);
  const discountPercent = canDiscount ? DISCOUNT_PERCENT : 0;
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const amountAfterDiscount = subtotal - discountAmount;

  const gstAmount = Math.round((amountAfterDiscount * GST_RATE) / 100);
  const totalAmount = amountAfterDiscount + gstAmount;

  return {
    paymentType,
    baseAmount,
    quantity,
    subtotal,
    discountPercent,
    discountAmount,
    amountAfterDiscount,
    gstRate: GST_RATE,
    gstAmount,
    totalAmount,
  };
}

/**
 * Calculate total fees for a new application
 * Example from SOP: 5 products = 25,000 + (65,000 x 5) = 3,50,000 excl GST
 */
export function calculateApplicationTotalFees(
  apcdTypeCount: number,
  isDiscountEligible: boolean = false,
): { applicationFee: FeeCalculation; empanelmentFee: FeeCalculation; grandTotal: number } {
  const applicationFee = calculateFee(PaymentType.APPLICATION_FEE, 1, isDiscountEligible);
  const empanelmentFee = calculateFee(PaymentType.EMPANELMENT_FEE, apcdTypeCount, isDiscountEligible);

  return {
    applicationFee,
    empanelmentFee,
    grandTotal: applicationFee.totalAmount + empanelmentFee.totalAmount,
  };
}
