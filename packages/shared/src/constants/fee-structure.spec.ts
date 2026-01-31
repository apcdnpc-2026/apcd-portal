import {
  FEE_AMOUNTS,
  GST_RATE,
  DISCOUNT_PERCENT,
  DISCOUNT_ELIGIBLE_FEE_TYPES,
  calculateFee,
  calculateApplicationTotalFees,
} from './fee-structure';
import { PaymentType } from '../types/payment.types';

describe('Fee Structure Constants', () => {
  it('should have GST_RATE equal to 18', () => {
    expect(GST_RATE).toBe(18);
  });

  it('should have DISCOUNT_PERCENT equal to 15', () => {
    expect(DISCOUNT_PERCENT).toBe(15);
  });

  it('should have APPLICATION_FEE as 25000', () => {
    expect(FEE_AMOUNTS[PaymentType.APPLICATION_FEE]).toBe(25000);
  });

  it('should have EMPANELMENT_FEE as 65000', () => {
    expect(FEE_AMOUNTS[PaymentType.EMPANELMENT_FEE]).toBe(65000);
  });

  it('should have FIELD_VERIFICATION as 57000', () => {
    expect(FEE_AMOUNTS[PaymentType.FIELD_VERIFICATION]).toBe(57000);
  });

  it('should have EMISSION_TESTING as 0 (charged on actuals)', () => {
    expect(FEE_AMOUNTS[PaymentType.EMISSION_TESTING]).toBe(0);
  });

  it('should have ANNUAL_RENEWAL as 35000', () => {
    expect(FEE_AMOUNTS[PaymentType.ANNUAL_RENEWAL]).toBe(35000);
  });

  it('should have SURVEILLANCE_VISIT as 0 (charged on actuals)', () => {
    expect(FEE_AMOUNTS[PaymentType.SURVEILLANCE_VISIT]).toBe(0);
  });

  it('should list APPLICATION_FEE, EMPANELMENT_FEE, ANNUAL_RENEWAL as discount eligible', () => {
    expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toContain(PaymentType.APPLICATION_FEE);
    expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toContain(PaymentType.EMPANELMENT_FEE);
    expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toContain(PaymentType.ANNUAL_RENEWAL);
    expect(DISCOUNT_ELIGIBLE_FEE_TYPES).not.toContain(PaymentType.FIELD_VERIFICATION);
    expect(DISCOUNT_ELIGIBLE_FEE_TYPES).not.toContain(PaymentType.EMISSION_TESTING);
  });
});

describe('calculateFee', () => {
  it('should calculate APPLICATION_FEE without discount', () => {
    const result = calculateFee(PaymentType.APPLICATION_FEE);
    expect(result.baseAmount).toBe(25000);
    expect(result.subtotal).toBe(25000);
    expect(result.discountPercent).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.amountAfterDiscount).toBe(25000);
    expect(result.gstRate).toBe(18);
    expect(result.gstAmount).toBe(4500); // 25000 * 0.18
    expect(result.totalAmount).toBe(29500); // 25000 + 4500
  });

  it('should calculate APPLICATION_FEE with discount for eligible OEM', () => {
    const result = calculateFee(PaymentType.APPLICATION_FEE, 1, true);
    expect(result.discountPercent).toBe(15);
    expect(result.discountAmount).toBe(3750); // 25000 * 0.15
    expect(result.amountAfterDiscount).toBe(21250); // 25000 - 3750
    expect(result.gstAmount).toBe(3825); // 21250 * 0.18
    expect(result.totalAmount).toBe(25075); // 21250 + 3825
  });

  it('should calculate EMPANELMENT_FEE for multiple APCD types', () => {
    const result = calculateFee(PaymentType.EMPANELMENT_FEE, 3);
    expect(result.baseAmount).toBe(65000);
    expect(result.quantity).toBe(3);
    expect(result.subtotal).toBe(195000); // 65000 * 3
    expect(result.gstAmount).toBe(35100); // 195000 * 0.18
    expect(result.totalAmount).toBe(230100); // 195000 + 35100
  });

  it('should calculate EMPANELMENT_FEE with discount for multiple types', () => {
    const result = calculateFee(PaymentType.EMPANELMENT_FEE, 2, true);
    expect(result.subtotal).toBe(130000); // 65000 * 2
    expect(result.discountAmount).toBe(19500); // 130000 * 0.15
    expect(result.amountAfterDiscount).toBe(110500);
    expect(result.gstAmount).toBe(19890); // 110500 * 0.18
    expect(result.totalAmount).toBe(130390);
  });

  it('should NOT apply discount to FIELD_VERIFICATION even if eligible flag is true', () => {
    const result = calculateFee(PaymentType.FIELD_VERIFICATION, 1, true);
    expect(result.discountPercent).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.amountAfterDiscount).toBe(57000);
    expect(result.gstAmount).toBe(10260); // 57000 * 0.18
    expect(result.totalAmount).toBe(67260);
  });

  it('should handle EMISSION_TESTING (0 base amount)', () => {
    const result = calculateFee(PaymentType.EMISSION_TESTING);
    expect(result.baseAmount).toBe(0);
    expect(result.subtotal).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it('should calculate ANNUAL_RENEWAL without discount', () => {
    const result = calculateFee(PaymentType.ANNUAL_RENEWAL);
    expect(result.baseAmount).toBe(35000);
    expect(result.gstAmount).toBe(6300); // 35000 * 0.18
    expect(result.totalAmount).toBe(41300);
  });

  it('should calculate ANNUAL_RENEWAL with discount', () => {
    const result = calculateFee(PaymentType.ANNUAL_RENEWAL, 1, true);
    expect(result.discountPercent).toBe(15);
    expect(result.discountAmount).toBe(5250); // 35000 * 0.15
    expect(result.amountAfterDiscount).toBe(29750);
    expect(result.gstAmount).toBe(5355); // 29750 * 0.18
    expect(result.totalAmount).toBe(35105);
  });

  it('should default quantity to 1 and discount to false', () => {
    const result = calculateFee(PaymentType.APPLICATION_FEE);
    expect(result.quantity).toBe(1);
    expect(result.discountPercent).toBe(0);
  });

  it('should return the correct paymentType in the result', () => {
    const result = calculateFee(PaymentType.FIELD_VERIFICATION);
    expect(result.paymentType).toBe(PaymentType.FIELD_VERIFICATION);
  });
});

describe('calculateApplicationTotalFees', () => {
  it('should calculate total for 1 APCD type without discount', () => {
    const result = calculateApplicationTotalFees(1);
    // Application: 25000 + 4500 GST = 29500
    // Empanelment: 65000 + 11700 GST = 76700
    expect(result.applicationFee.totalAmount).toBe(29500);
    expect(result.empanelmentFee.totalAmount).toBe(76700);
    expect(result.grandTotal).toBe(106200);
  });

  it('should calculate total for 3 APCD types without discount', () => {
    const result = calculateApplicationTotalFees(3);
    // Application: 25000 + 4500 = 29500
    // Empanelment: 65000*3=195000 + 35100 = 230100
    expect(result.applicationFee.totalAmount).toBe(29500);
    expect(result.empanelmentFee.totalAmount).toBe(230100);
    expect(result.grandTotal).toBe(259600);
  });

  it('should calculate total for 5 APCD types (SOP example)', () => {
    const result = calculateApplicationTotalFees(5);
    // Application: 25000 + 4500 = 29500
    // Empanelment: 65000*5=325000 + 58500 = 383500
    expect(result.applicationFee.baseAmount).toBe(25000);
    expect(result.empanelmentFee.subtotal).toBe(325000);
    expect(result.grandTotal).toBe(413000);
  });

  it('should calculate total for 1 APCD type with discount', () => {
    const result = calculateApplicationTotalFees(1, true);
    // Application: 25000 - 3750 = 21250, GST 3825, total 25075
    // Empanelment: 65000 - 9750 = 55250, GST 9945, total 65195
    expect(result.applicationFee.discountAmount).toBe(3750);
    expect(result.applicationFee.totalAmount).toBe(25075);
    expect(result.empanelmentFee.discountAmount).toBe(9750);
    expect(result.empanelmentFee.totalAmount).toBe(65195);
    expect(result.grandTotal).toBe(90270);
  });

  it('should calculate total for 3 APCD types with discount', () => {
    const result = calculateApplicationTotalFees(3, true);
    // Application: 25000 - 3750 = 21250, GST 3825, total 25075
    // Empanelment: 195000 - 29250 = 165750, GST 29835, total 195585
    expect(result.applicationFee.totalAmount).toBe(25075);
    expect(result.empanelmentFee.subtotal).toBe(195000);
    expect(result.empanelmentFee.discountAmount).toBe(29250);
    expect(result.empanelmentFee.totalAmount).toBe(195585);
    expect(result.grandTotal).toBe(220660);
  });

  it('should return correct structure with applicationFee, empanelmentFee, grandTotal', () => {
    const result = calculateApplicationTotalFees(1);
    expect(result).toHaveProperty('applicationFee');
    expect(result).toHaveProperty('empanelmentFee');
    expect(result).toHaveProperty('grandTotal');
    expect(result.applicationFee.paymentType).toBe(PaymentType.APPLICATION_FEE);
    expect(result.empanelmentFee.paymentType).toBe(PaymentType.EMPANELMENT_FEE);
  });
});
