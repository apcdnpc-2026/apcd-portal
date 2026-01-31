import {
  FEE_AMOUNTS,
  GST_RATE,
  DISCOUNT_PERCENT,
  DISCOUNT_ELIGIBLE_FEE_TYPES,
  calculateFee,
  calculateApplicationTotalFees,
  FeeCalculation,
} from './fee-structure';
import { PaymentType } from '../types/payment.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Fee Structure Constants', () => {
  it('should have GST_RATE equal to 18', () => {
    expect(GST_RATE).toBe(18);
  });

  it('should have DISCOUNT_PERCENT equal to 15', () => {
    expect(DISCOUNT_PERCENT).toBe(15);
  });

  describe('FEE_AMOUNTS', () => {
    it('should have APPLICATION_FEE as 25000', () => {
      expect(FEE_AMOUNTS[PaymentType.APPLICATION_FEE]).toBe(25000);
    });

    it('should have EMPANELMENT_FEE as 65000 per APCD type', () => {
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

    it('should have an entry for every PaymentType', () => {
      for (const pt of Object.values(PaymentType)) {
        expect(FEE_AMOUNTS).toHaveProperty(pt);
        expect(typeof FEE_AMOUNTS[pt]).toBe('number');
      }
    });
  });

  describe('DISCOUNT_ELIGIBLE_FEE_TYPES', () => {
    it('should contain APPLICATION_FEE', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toContain(PaymentType.APPLICATION_FEE);
    });

    it('should contain EMPANELMENT_FEE', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toContain(PaymentType.EMPANELMENT_FEE);
    });

    it('should contain ANNUAL_RENEWAL', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toContain(PaymentType.ANNUAL_RENEWAL);
    });

    it('should NOT contain FIELD_VERIFICATION', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).not.toContain(PaymentType.FIELD_VERIFICATION);
    });

    it('should NOT contain EMISSION_TESTING', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).not.toContain(PaymentType.EMISSION_TESTING);
    });

    it('should NOT contain SURVEILLANCE_VISIT', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).not.toContain(PaymentType.SURVEILLANCE_VISIT);
    });

    it('should have exactly 3 eligible types', () => {
      expect(DISCOUNT_ELIGIBLE_FEE_TYPES).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateFee
// ---------------------------------------------------------------------------

describe('calculateFee', () => {
  // -- Return structure -----------------------------------------------------

  it('should return a complete FeeCalculation object', () => {
    const result = calculateFee(PaymentType.APPLICATION_FEE);
    expect(result).toHaveProperty('paymentType');
    expect(result).toHaveProperty('baseAmount');
    expect(result).toHaveProperty('quantity');
    expect(result).toHaveProperty('subtotal');
    expect(result).toHaveProperty('discountPercent');
    expect(result).toHaveProperty('discountAmount');
    expect(result).toHaveProperty('amountAfterDiscount');
    expect(result).toHaveProperty('gstRate');
    expect(result).toHaveProperty('gstAmount');
    expect(result).toHaveProperty('totalAmount');
  });

  it('should return the correct paymentType in result', () => {
    expect(calculateFee(PaymentType.FIELD_VERIFICATION).paymentType).toBe(PaymentType.FIELD_VERIFICATION);
  });

  it('should default quantity to 1 and discount to false', () => {
    const result = calculateFee(PaymentType.APPLICATION_FEE);
    expect(result.quantity).toBe(1);
    expect(result.discountPercent).toBe(0);
  });

  // -- APPLICATION_FEE without discount -------------------------------------

  describe('APPLICATION_FEE without discount', () => {
    let result: FeeCalculation;

    beforeAll(() => {
      result = calculateFee(PaymentType.APPLICATION_FEE);
    });

    it('baseAmount should be 25000', () => {
      expect(result.baseAmount).toBe(25000);
    });

    it('subtotal should be 25000 (25000 x 1)', () => {
      expect(result.subtotal).toBe(25000);
    });

    it('discountPercent should be 0', () => {
      expect(result.discountPercent).toBe(0);
    });

    it('discountAmount should be 0', () => {
      expect(result.discountAmount).toBe(0);
    });

    it('amountAfterDiscount should be 25000', () => {
      expect(result.amountAfterDiscount).toBe(25000);
    });

    it('gstRate should be 18', () => {
      expect(result.gstRate).toBe(18);
    });

    it('gstAmount should be 4500 (25000 * 18%)', () => {
      expect(result.gstAmount).toBe(4500);
    });

    it('totalAmount should be 29500 (25000 + 4500)', () => {
      expect(result.totalAmount).toBe(29500);
    });
  });

  // -- APPLICATION_FEE with discount (MSE / startup / local supplier) -------

  describe('APPLICATION_FEE with discount', () => {
    let result: FeeCalculation;

    beforeAll(() => {
      result = calculateFee(PaymentType.APPLICATION_FEE, 1, true);
    });

    it('discountPercent should be 15', () => {
      expect(result.discountPercent).toBe(15);
    });

    it('discountAmount should be 3750 (25000 * 15%)', () => {
      expect(result.discountAmount).toBe(3750);
    });

    it('amountAfterDiscount should be 21250 (25000 - 3750)', () => {
      expect(result.amountAfterDiscount).toBe(21250);
    });

    it('gstAmount should be 3825 (21250 * 18%)', () => {
      expect(result.gstAmount).toBe(3825);
    });

    it('totalAmount should be 25075 (21250 + 3825)', () => {
      expect(result.totalAmount).toBe(25075);
    });
  });

  // -- EMPANELMENT_FEE with quantity ----------------------------------------

  describe('EMPANELMENT_FEE for multiple APCD types', () => {
    it('should calculate for 1 APCD type without discount', () => {
      const result = calculateFee(PaymentType.EMPANELMENT_FEE, 1);
      expect(result.baseAmount).toBe(65000);
      expect(result.subtotal).toBe(65000);
      expect(result.gstAmount).toBe(11700);
      expect(result.totalAmount).toBe(76700);
    });

    it('should calculate for 3 APCD types without discount', () => {
      const result = calculateFee(PaymentType.EMPANELMENT_FEE, 3);
      expect(result.quantity).toBe(3);
      expect(result.subtotal).toBe(195000);
      expect(result.gstAmount).toBe(35100);
      expect(result.totalAmount).toBe(230100);
    });

    it('should calculate for 5 APCD types without discount', () => {
      const result = calculateFee(PaymentType.EMPANELMENT_FEE, 5);
      expect(result.subtotal).toBe(325000);
      expect(result.gstAmount).toBe(58500);
      expect(result.totalAmount).toBe(383500);
    });

    it('should calculate for 2 APCD types with discount', () => {
      const result = calculateFee(PaymentType.EMPANELMENT_FEE, 2, true);
      expect(result.subtotal).toBe(130000);
      expect(result.discountPercent).toBe(15);
      expect(result.discountAmount).toBe(19500);
      expect(result.amountAfterDiscount).toBe(110500);
      expect(result.gstAmount).toBe(19890);
      expect(result.totalAmount).toBe(130390);
    });

    it('should calculate for 10 APCD types with discount', () => {
      const result = calculateFee(PaymentType.EMPANELMENT_FEE, 10, true);
      expect(result.subtotal).toBe(650000);
      expect(result.discountAmount).toBe(97500);
      expect(result.amountAfterDiscount).toBe(552500);
      // GST: 552500 * 0.18 = 99450
      expect(result.gstAmount).toBe(99450);
      expect(result.totalAmount).toBe(651950);
    });
  });

  // -- Discount NOT applied to ineligible fee types -------------------------

  describe('discount NOT applied to ineligible fee types', () => {
    it('FIELD_VERIFICATION should have 0% discount even if eligible flag is true', () => {
      const result = calculateFee(PaymentType.FIELD_VERIFICATION, 1, true);
      expect(result.discountPercent).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.amountAfterDiscount).toBe(57000);
      expect(result.gstAmount).toBe(10260);
      expect(result.totalAmount).toBe(67260);
    });

    it('EMISSION_TESTING should have 0 total (base is 0)', () => {
      const result = calculateFee(PaymentType.EMISSION_TESTING, 1, true);
      expect(result.discountPercent).toBe(0);
      expect(result.baseAmount).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it('SURVEILLANCE_VISIT should have 0 total (base is 0)', () => {
      const result = calculateFee(PaymentType.SURVEILLANCE_VISIT, 1, true);
      expect(result.totalAmount).toBe(0);
    });
  });

  // -- ANNUAL_RENEWAL -------------------------------------------------------

  describe('ANNUAL_RENEWAL', () => {
    it('should calculate without discount', () => {
      const result = calculateFee(PaymentType.ANNUAL_RENEWAL);
      expect(result.baseAmount).toBe(35000);
      expect(result.gstAmount).toBe(6300);
      expect(result.totalAmount).toBe(41300);
    });

    it('should calculate with discount', () => {
      const result = calculateFee(PaymentType.ANNUAL_RENEWAL, 1, true);
      expect(result.discountPercent).toBe(15);
      expect(result.discountAmount).toBe(5250);
      expect(result.amountAfterDiscount).toBe(29750);
      expect(result.gstAmount).toBe(5355);
      expect(result.totalAmount).toBe(35105);
    });
  });

  // -- EMISSION_TESTING (0 base) -------------------------------------------

  describe('EMISSION_TESTING (zero-base fee)', () => {
    it('should return all zeros', () => {
      const result = calculateFee(PaymentType.EMISSION_TESTING);
      expect(result.baseAmount).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.amountAfterDiscount).toBe(0);
      expect(result.gstAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it('should return all zeros even with quantity > 1', () => {
      const result = calculateFee(PaymentType.EMISSION_TESTING, 5);
      expect(result.subtotal).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });

  // -- Math.round behavior --------------------------------------------------

  describe('rounding', () => {
    it('should round GST amount to nearest integer', () => {
      // ANNUAL_RENEWAL with discount: 29750 * 0.18 = 5355.0 (exact)
      const result = calculateFee(PaymentType.ANNUAL_RENEWAL, 1, true);
      expect(Number.isInteger(result.gstAmount)).toBe(true);
    });

    it('should round discount amount to nearest integer', () => {
      const result = calculateFee(PaymentType.APPLICATION_FEE, 1, true);
      expect(Number.isInteger(result.discountAmount)).toBe(true);
    });

    it('totalAmount should always be an integer', () => {
      // Test several combinations
      for (const pt of Object.values(PaymentType)) {
        for (const qty of [1, 2, 3]) {
          for (const disc of [true, false]) {
            const result = calculateFee(pt, qty, disc);
            expect(Number.isInteger(result.totalAmount)).toBe(true);
          }
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// calculateApplicationTotalFees
// ---------------------------------------------------------------------------

describe('calculateApplicationTotalFees', () => {
  // -- Structure ------------------------------------------------------------

  it('should return applicationFee, empanelmentFee, and grandTotal', () => {
    const result = calculateApplicationTotalFees(1);
    expect(result).toHaveProperty('applicationFee');
    expect(result).toHaveProperty('empanelmentFee');
    expect(result).toHaveProperty('grandTotal');
    expect(result.applicationFee.paymentType).toBe(PaymentType.APPLICATION_FEE);
    expect(result.empanelmentFee.paymentType).toBe(PaymentType.EMPANELMENT_FEE);
  });

  // -- 1 APCD type, no discount --------------------------------------------

  describe('1 APCD type, no discount', () => {
    let result: ReturnType<typeof calculateApplicationTotalFees>;

    beforeAll(() => {
      result = calculateApplicationTotalFees(1);
    });

    it('application fee total should be 29500', () => {
      // 25000 + 4500 GST
      expect(result.applicationFee.totalAmount).toBe(29500);
    });

    it('empanelment fee total should be 76700', () => {
      // 65000 + 11700 GST
      expect(result.empanelmentFee.totalAmount).toBe(76700);
    });

    it('grand total should be 106200', () => {
      expect(result.grandTotal).toBe(106200);
    });

    it('grandTotal should equal applicationFee.total + empanelmentFee.total', () => {
      expect(result.grandTotal).toBe(result.applicationFee.totalAmount + result.empanelmentFee.totalAmount);
    });
  });

  // -- 3 APCD types, no discount -------------------------------------------

  describe('3 APCD types, no discount', () => {
    let result: ReturnType<typeof calculateApplicationTotalFees>;

    beforeAll(() => {
      result = calculateApplicationTotalFees(3);
    });

    it('application fee total should be 29500 (always qty 1)', () => {
      expect(result.applicationFee.totalAmount).toBe(29500);
    });

    it('empanelment subtotal should be 195000 (65000 x 3)', () => {
      expect(result.empanelmentFee.subtotal).toBe(195000);
    });

    it('empanelment fee total should be 230100', () => {
      // 195000 + 35100 GST
      expect(result.empanelmentFee.totalAmount).toBe(230100);
    });

    it('grand total should be 259600', () => {
      expect(result.grandTotal).toBe(259600);
    });
  });

  // -- 5 APCD types, no discount (SOP example) -----------------------------

  describe('5 APCD types, no discount (SOP example)', () => {
    let result: ReturnType<typeof calculateApplicationTotalFees>;

    beforeAll(() => {
      result = calculateApplicationTotalFees(5);
    });

    it('application base amount should be 25000', () => {
      expect(result.applicationFee.baseAmount).toBe(25000);
    });

    it('empanelment subtotal should be 325000 (65000 x 5)', () => {
      expect(result.empanelmentFee.subtotal).toBe(325000);
    });

    it('combined subtotal (excl GST) should be 350000 as per SOP', () => {
      // SOP: 25,000 + (65,000 x 5) = 3,50,000
      expect(result.applicationFee.subtotal + result.empanelmentFee.subtotal).toBe(350000);
    });

    it('grand total should be 413000', () => {
      // App: 25000 + 4500 = 29500
      // Emp: 325000 + 58500 = 383500
      expect(result.grandTotal).toBe(413000);
    });
  });

  // -- 1 APCD type, with discount ------------------------------------------

  describe('1 APCD type, with discount', () => {
    let result: ReturnType<typeof calculateApplicationTotalFees>;

    beforeAll(() => {
      result = calculateApplicationTotalFees(1, true);
    });

    it('application fee discount should be 3750', () => {
      expect(result.applicationFee.discountAmount).toBe(3750);
    });

    it('application fee total should be 25075', () => {
      // 25000 - 3750 = 21250, GST 3825 => 25075
      expect(result.applicationFee.totalAmount).toBe(25075);
    });

    it('empanelment fee discount should be 9750', () => {
      // 65000 * 0.15 = 9750
      expect(result.empanelmentFee.discountAmount).toBe(9750);
    });

    it('empanelment fee total should be 65195', () => {
      // 65000 - 9750 = 55250, GST 9945 => 65195
      expect(result.empanelmentFee.totalAmount).toBe(65195);
    });

    it('grand total should be 90270', () => {
      expect(result.grandTotal).toBe(90270);
    });
  });

  // -- 3 APCD types, with discount -----------------------------------------

  describe('3 APCD types, with discount', () => {
    let result: ReturnType<typeof calculateApplicationTotalFees>;

    beforeAll(() => {
      result = calculateApplicationTotalFees(3, true);
    });

    it('application fee total should be 25075', () => {
      expect(result.applicationFee.totalAmount).toBe(25075);
    });

    it('empanelment subtotal should be 195000', () => {
      expect(result.empanelmentFee.subtotal).toBe(195000);
    });

    it('empanelment discount should be 29250', () => {
      // 195000 * 0.15 = 29250
      expect(result.empanelmentFee.discountAmount).toBe(29250);
    });

    it('empanelment fee total should be 195585', () => {
      // 195000 - 29250 = 165750, GST = 29835 => 195585
      expect(result.empanelmentFee.totalAmount).toBe(195585);
    });

    it('grand total should be 220660', () => {
      expect(result.grandTotal).toBe(220660);
    });
  });

  // -- 5 APCD types, with discount -----------------------------------------

  describe('5 APCD types, with discount', () => {
    let result: ReturnType<typeof calculateApplicationTotalFees>;

    beforeAll(() => {
      result = calculateApplicationTotalFees(5, true);
    });

    it('empanelment subtotal should be 325000', () => {
      expect(result.empanelmentFee.subtotal).toBe(325000);
    });

    it('empanelment discount should be 48750', () => {
      // 325000 * 0.15 = 48750
      expect(result.empanelmentFee.discountAmount).toBe(48750);
    });

    it('empanelment amountAfterDiscount should be 276250', () => {
      expect(result.empanelmentFee.amountAfterDiscount).toBe(276250);
    });

    it('empanelment GST should be 49725', () => {
      // 276250 * 0.18 = 49725
      expect(result.empanelmentFee.gstAmount).toBe(49725);
    });

    it('empanelment total should be 325975', () => {
      expect(result.empanelmentFee.totalAmount).toBe(325975);
    });

    it('grand total should be 351050', () => {
      // 25075 + 325975
      expect(result.grandTotal).toBe(351050);
    });
  });

  // -- Invariant: grandTotal = appFee.total + empFee.total ------------------

  describe('grandTotal invariant', () => {
    it.each([1, 2, 3, 5, 10])('grandTotal = app + emp for %d APCD types, no discount', (count) => {
      const result = calculateApplicationTotalFees(count);
      expect(result.grandTotal).toBe(result.applicationFee.totalAmount + result.empanelmentFee.totalAmount);
    });

    it.each([1, 2, 3, 5, 10])('grandTotal = app + emp for %d APCD types, with discount', (count) => {
      const result = calculateApplicationTotalFees(count, true);
      expect(result.grandTotal).toBe(result.applicationFee.totalAmount + result.empanelmentFee.totalAmount);
    });
  });

  // -- Discount savings check -----------------------------------------------

  describe('discount savings', () => {
    it('discounted total should always be less than non-discounted total for APPLICATION_FEE', () => {
      const noDiscount = calculateApplicationTotalFees(1, false);
      const withDiscount = calculateApplicationTotalFees(1, true);
      expect(withDiscount.grandTotal).toBeLessThan(noDiscount.grandTotal);
    });

    it('discount savings should be approximately 15% of pre-GST subtotal for 1 APCD type', () => {
      const noDiscount = calculateApplicationTotalFees(1, false);
      const withDiscount = calculateApplicationTotalFees(1, true);
      const savings = noDiscount.grandTotal - withDiscount.grandTotal;
      // Savings include the GST on the discount too, so it is 15% * 1.18 of subtotal
      // Subtotal = 25000 + 65000 = 90000
      // 15% of 90000 = 13500, plus 18% GST on 13500 = 2430 => ~15930
      expect(savings).toBeGreaterThan(0);
      // Approximate check: savings should be roughly 15% of (app subtotal + emp subtotal) * 1.18
      const expectedSavings = Math.round(90000 * 0.15 * 1.18);
      expect(Math.abs(savings - expectedSavings)).toBeLessThan(10); // rounding tolerance
    });
  });
});
