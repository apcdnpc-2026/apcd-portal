import {
  initiateRazorpayPaymentSchema,
  verifyRazorpayPaymentSchema,
  submitManualPaymentSchema,
  verifyManualPaymentSchema,
} from './payment.validator';

describe('initiateRazorpayPaymentSchema', () => {
  const validPayload = {
    applicationId: '550e8400-e29b-41d4-a716-446655440000',
    paymentType: 'APPLICATION_FEE' as const,
  };

  it('should accept a valid initiation request', () => {
    const result = initiateRazorpayPaymentSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should default apcdTypeCount to 1', () => {
    const result = initiateRazorpayPaymentSchema.safeParse(validPayload);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(1);
    }
  });

  it('should accept all valid paymentType values', () => {
    const types = [
      'APPLICATION_FEE', 'EMPANELMENT_FEE', 'FIELD_VERIFICATION',
      'EMISSION_TESTING', 'ANNUAL_RENEWAL', 'SURVEILLANCE_VISIT',
    ];
    for (const paymentType of types) {
      const result = initiateRazorpayPaymentSchema.safeParse({ ...validPayload, paymentType });
      expect(result.success).toBe(true);
    }
  });

  it('should reject non-UUID applicationId', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({
      ...validPayload,
      applicationId: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid paymentType', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({
      ...validPayload,
      paymentType: 'INVALID_TYPE',
    });
    expect(result.success).toBe(false);
  });

  it('should reject apcdTypeCount less than 1', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({
      ...validPayload,
      apcdTypeCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should accept apcdTypeCount greater than 1', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({
      ...validPayload,
      apcdTypeCount: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(5);
    }
  });

  it('should reject missing applicationId', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({ paymentType: 'APPLICATION_FEE' });
    expect(result.success).toBe(false);
  });

  it('should reject missing paymentType', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({
      applicationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });
});

describe('verifyRazorpayPaymentSchema', () => {
  const validVerification = {
    razorpayOrderId: 'order_abc123',
    razorpayPaymentId: 'pay_xyz789',
    razorpaySignature: 'sig_hash_value',
  };

  it('should accept a valid verification payload', () => {
    const result = verifyRazorpayPaymentSchema.safeParse(validVerification);
    expect(result.success).toBe(true);
  });

  it('should reject missing razorpayOrderId', () => {
    const { razorpayOrderId, ...rest } = validVerification;
    const result = verifyRazorpayPaymentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing razorpayPaymentId', () => {
    const { razorpayPaymentId, ...rest } = validVerification;
    const result = verifyRazorpayPaymentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing razorpaySignature', () => {
    const { razorpaySignature, ...rest } = validVerification;
    const result = verifyRazorpayPaymentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject empty string for razorpayOrderId', () => {
    const result = verifyRazorpayPaymentSchema.safeParse({
      ...validVerification,
      razorpayOrderId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('submitManualPaymentSchema', () => {
  const validManual = {
    applicationId: '550e8400-e29b-41d4-a716-446655440000',
    paymentType: 'APPLICATION_FEE' as const,
    utrNumber: 'UTR123456789',
    remitterBankName: 'State Bank of India',
    neftAmount: 29500,
    neftDate: '2025-01-15',
  };

  it('should accept a valid manual payment submission', () => {
    const result = submitManualPaymentSchema.safeParse(validManual);
    expect(result.success).toBe(true);
  });

  it('should default apcdTypeCount to 1', () => {
    const result = submitManualPaymentSchema.safeParse(validManual);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(1);
    }
  });

  it('should reject non-UUID applicationId', () => {
    const result = submitManualPaymentSchema.safeParse({
      ...validManual,
      applicationId: 'bad-id',
    });
    expect(result.success).toBe(false);
  });

  it('should reject UTR shorter than 5 characters', () => {
    const result = submitManualPaymentSchema.safeParse({
      ...validManual,
      utrNumber: 'UT',
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative neftAmount', () => {
    const result = submitManualPaymentSchema.safeParse({
      ...validManual,
      neftAmount: -100,
    });
    expect(result.success).toBe(false);
  });

  it('should reject zero neftAmount', () => {
    const result = submitManualPaymentSchema.safeParse({
      ...validManual,
      neftAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty neftDate', () => {
    const result = submitManualPaymentSchema.safeParse({
      ...validManual,
      neftDate: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short bank name', () => {
    const result = submitManualPaymentSchema.safeParse({
      ...validManual,
      remitterBankName: 'A',
    });
    expect(result.success).toBe(false);
  });
});

describe('verifyManualPaymentSchema', () => {
  const validVerification = {
    paymentId: '550e8400-e29b-41d4-a716-446655440000',
    isVerified: true,
  };

  it('should accept a valid verification (approved)', () => {
    const result = verifyManualPaymentSchema.safeParse(validVerification);
    expect(result.success).toBe(true);
  });

  it('should accept verification rejection', () => {
    const result = verifyManualPaymentSchema.safeParse({
      ...validVerification,
      isVerified: false,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional verificationNote', () => {
    const result = verifyManualPaymentSchema.safeParse({
      ...validVerification,
      verificationNote: 'UTR confirmed with bank',
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-UUID paymentId', () => {
    const result = verifyManualPaymentSchema.safeParse({
      ...validVerification,
      paymentId: 'bad',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing isVerified', () => {
    const result = verifyManualPaymentSchema.safeParse({
      paymentId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing paymentId', () => {
    const result = verifyManualPaymentSchema.safeParse({ isVerified: true });
    expect(result.success).toBe(false);
  });
});
