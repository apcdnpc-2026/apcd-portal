import {
  initiateRazorpayPaymentSchema,
  verifyRazorpayPaymentSchema,
  submitManualPaymentSchema,
  verifyManualPaymentSchema,
} from './payment.validator';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const ALL_PAYMENT_TYPES = [
  'APPLICATION_FEE',
  'EMPANELMENT_FEE',
  'FIELD_VERIFICATION',
  'EMISSION_TESTING',
  'ANNUAL_RENEWAL',
  'SURVEILLANCE_VISIT',
] as const;

// ---------------------------------------------------------------------------
// initiateRazorpayPaymentSchema
// ---------------------------------------------------------------------------

describe('initiateRazorpayPaymentSchema', () => {
  const validPayload = {
    applicationId: UUID,
    paymentType: 'APPLICATION_FEE' as const,
  };

  // -- happy path -----------------------------------------------------------

  it('should accept a valid initiation request', () => {
    expect(initiateRazorpayPaymentSchema.safeParse(validPayload).success).toBe(true);
  });

  it('should default apcdTypeCount to 1', () => {
    const result = initiateRazorpayPaymentSchema.safeParse(validPayload);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(1);
    }
  });

  it('should accept explicit apcdTypeCount', () => {
    const result = initiateRazorpayPaymentSchema.safeParse({ ...validPayload, apcdTypeCount: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(5);
    }
  });

  // -- applicationId (UUID) -------------------------------------------------

  describe('applicationId', () => {
    it('should reject non-UUID string', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, applicationId: 'not-uuid' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, applicationId: '' }).success).toBe(false);
    });

    it('should reject missing applicationId', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ paymentType: 'APPLICATION_FEE' }).success).toBe(false);
    });

    it('should accept another valid UUID', () => {
      expect(
        initiateRazorpayPaymentSchema.safeParse({
          ...validPayload,
          applicationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        }).success,
      ).toBe(true);
    });
  });

  // -- paymentType (enum) ---------------------------------------------------

  describe('paymentType', () => {
    it.each(ALL_PAYMENT_TYPES)('should accept valid type: %s', (type) => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, paymentType: type }).success).toBe(true);
    });

    it('should reject empty string (enum bug test)', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, paymentType: '' }).success).toBe(false);
    });

    it('should reject invalid type "INVALID_TYPE"', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, paymentType: 'INVALID_TYPE' }).success).toBe(false);
    });

    it('should reject missing paymentType', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ applicationId: UUID }).success).toBe(false);
    });
  });

  // -- apcdTypeCount (int, min 1) -------------------------------------------

  describe('apcdTypeCount', () => {
    it('should accept 1 (min)', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, apcdTypeCount: 1 }).success).toBe(true);
    });

    it('should accept large count', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, apcdTypeCount: 100 }).success).toBe(true);
    });

    it('should reject 0', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, apcdTypeCount: 0 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, apcdTypeCount: -1 }).success).toBe(false);
    });

    it('should reject float (must be int)', () => {
      expect(initiateRazorpayPaymentSchema.safeParse({ ...validPayload, apcdTypeCount: 1.5 }).success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// verifyRazorpayPaymentSchema
// ---------------------------------------------------------------------------

describe('verifyRazorpayPaymentSchema', () => {
  const validVerification = {
    razorpayOrderId: 'order_abc123',
    razorpayPaymentId: 'pay_xyz789',
    razorpaySignature: 'sig_hash_value',
  };

  it('should accept a valid verification payload', () => {
    expect(verifyRazorpayPaymentSchema.safeParse(validVerification).success).toBe(true);
  });

  // -- razorpayOrderId (min 1) ----------------------------------------------

  describe('razorpayOrderId', () => {
    it('should reject empty string', () => {
      expect(verifyRazorpayPaymentSchema.safeParse({ ...validVerification, razorpayOrderId: '' }).success).toBe(false);
    });

    it('should accept single character', () => {
      expect(verifyRazorpayPaymentSchema.safeParse({ ...validVerification, razorpayOrderId: 'o' }).success).toBe(true);
    });

    it('should reject missing field', () => {
      const { razorpayOrderId, ...rest } = validVerification;
      expect(verifyRazorpayPaymentSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- razorpayPaymentId (min 1) --------------------------------------------

  describe('razorpayPaymentId', () => {
    it('should reject empty string', () => {
      expect(verifyRazorpayPaymentSchema.safeParse({ ...validVerification, razorpayPaymentId: '' }).success).toBe(false);
    });

    it('should accept single character', () => {
      expect(verifyRazorpayPaymentSchema.safeParse({ ...validVerification, razorpayPaymentId: 'p' }).success).toBe(true);
    });

    it('should reject missing field', () => {
      const { razorpayPaymentId, ...rest } = validVerification;
      expect(verifyRazorpayPaymentSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- razorpaySignature (min 1) --------------------------------------------

  describe('razorpaySignature', () => {
    it('should reject empty string', () => {
      expect(verifyRazorpayPaymentSchema.safeParse({ ...validVerification, razorpaySignature: '' }).success).toBe(false);
    });

    it('should accept single character', () => {
      expect(verifyRazorpayPaymentSchema.safeParse({ ...validVerification, razorpaySignature: 's' }).success).toBe(true);
    });

    it('should reject missing field', () => {
      const { razorpaySignature, ...rest } = validVerification;
      expect(verifyRazorpayPaymentSchema.safeParse(rest).success).toBe(false);
    });
  });

  it('should reject empty object', () => {
    expect(verifyRazorpayPaymentSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// submitManualPaymentSchema
// ---------------------------------------------------------------------------

describe('submitManualPaymentSchema', () => {
  const validManual = {
    applicationId: UUID,
    paymentType: 'APPLICATION_FEE' as const,
    utrNumber: 'UTR123456789',
    remitterBankName: 'State Bank of India',
    neftAmount: 29500,
    neftDate: '2025-01-15',
  };

  it('should accept a valid manual payment submission', () => {
    expect(submitManualPaymentSchema.safeParse(validManual).success).toBe(true);
  });

  it('should default apcdTypeCount to 1', () => {
    const result = submitManualPaymentSchema.safeParse(validManual);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(1);
    }
  });

  it('should accept explicit apcdTypeCount', () => {
    const result = submitManualPaymentSchema.safeParse({ ...validManual, apcdTypeCount: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apcdTypeCount).toBe(3);
    }
  });

  // -- applicationId (UUID) -------------------------------------------------

  describe('applicationId', () => {
    it('should reject non-UUID', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, applicationId: 'bad-id' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, applicationId: '' }).success).toBe(false);
    });

    it('should reject missing applicationId', () => {
      const { applicationId, ...rest } = validManual;
      expect(submitManualPaymentSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- paymentType (enum) ---------------------------------------------------

  describe('paymentType', () => {
    it.each(ALL_PAYMENT_TYPES)('should accept valid type: %s', (type) => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, paymentType: type }).success).toBe(true);
    });

    it('should reject empty string (enum bug test)', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, paymentType: '' }).success).toBe(false);
    });

    it('should reject invalid type', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, paymentType: 'BRIBE' }).success).toBe(false);
    });
  });

  // -- utrNumber (min 5) ---------------------------------------------------

  describe('utrNumber', () => {
    it('should accept exactly 5 chars (min)', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, utrNumber: '12345' }).success).toBe(true);
    });

    it('should reject 4 chars', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, utrNumber: '1234' }).success).toBe(false);
    });

    it('should reject 2 chars "UT"', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, utrNumber: 'UT' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, utrNumber: '' }).success).toBe(false);
    });

    it('should accept long UTR number', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, utrNumber: 'UTIB0000123456789012' }).success).toBe(true);
    });
  });

  // -- remitterBankName (min 2) ---------------------------------------------

  describe('remitterBankName', () => {
    it('should accept exactly 2 chars (min)', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, remitterBankName: 'SB' }).success).toBe(true);
    });

    it('should reject 1 char', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, remitterBankName: 'A' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, remitterBankName: '' }).success).toBe(false);
    });
  });

  // -- neftAmount (positive) ------------------------------------------------

  describe('neftAmount', () => {
    it('should accept positive amount', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftAmount: 50000 }).success).toBe(true);
    });

    it('should accept small positive amount', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftAmount: 0.01 }).success).toBe(true);
    });

    it('should reject zero', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftAmount: 0 }).success).toBe(false);
    });

    it('should reject negative amount', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftAmount: -100 }).success).toBe(false);
    });
  });

  // -- neftDate (min 1) ----------------------------------------------------

  describe('neftDate', () => {
    it('should accept YYYY-MM-DD format', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftDate: '2025-01-15' }).success).toBe(true);
    });

    it('should accept DD-MM-YYYY format (no format validation)', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftDate: '15-01-2025' }).success).toBe(true);
    });

    it('should accept any non-empty string', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftDate: 'today' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, neftDate: '' }).success).toBe(false);
    });
  });

  // -- apcdTypeCount (int, min 1) -------------------------------------------

  describe('apcdTypeCount', () => {
    it('should accept 1', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, apcdTypeCount: 1 }).success).toBe(true);
    });

    it('should reject 0', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, apcdTypeCount: 0 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, apcdTypeCount: -1 }).success).toBe(false);
    });

    it('should reject float', () => {
      expect(submitManualPaymentSchema.safeParse({ ...validManual, apcdTypeCount: 2.5 }).success).toBe(false);
    });
  });

  // -- missing required fields ----------------------------------------------

  describe('missing required fields', () => {
    it('should reject missing utrNumber', () => {
      const { utrNumber, ...rest } = validManual;
      expect(submitManualPaymentSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing remitterBankName', () => {
      const { remitterBankName, ...rest } = validManual;
      expect(submitManualPaymentSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing neftAmount', () => {
      const { neftAmount, ...rest } = validManual;
      expect(submitManualPaymentSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing neftDate', () => {
      const { neftDate, ...rest } = validManual;
      expect(submitManualPaymentSchema.safeParse(rest).success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// verifyManualPaymentSchema
// ---------------------------------------------------------------------------

describe('verifyManualPaymentSchema', () => {
  const validVerification = {
    paymentId: UUID,
    isVerified: true,
  };

  it('should accept valid verification (approved)', () => {
    expect(verifyManualPaymentSchema.safeParse(validVerification).success).toBe(true);
  });

  it('should accept verification rejection', () => {
    expect(verifyManualPaymentSchema.safeParse({ ...validVerification, isVerified: false }).success).toBe(true);
  });

  it('should accept optional verificationNote', () => {
    expect(
      verifyManualPaymentSchema.safeParse({
        ...validVerification,
        verificationNote: 'UTR confirmed with bank',
      }).success,
    ).toBe(true);
  });

  it('should accept empty string verificationNote (optional, no min)', () => {
    expect(
      verifyManualPaymentSchema.safeParse({
        ...validVerification,
        verificationNote: '',
      }).success,
    ).toBe(true);
  });

  // -- paymentId (UUID) ----------------------------------------------------

  describe('paymentId', () => {
    it('should reject non-UUID', () => {
      expect(verifyManualPaymentSchema.safeParse({ ...validVerification, paymentId: 'bad' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(verifyManualPaymentSchema.safeParse({ ...validVerification, paymentId: '' }).success).toBe(false);
    });

    it('should reject missing paymentId', () => {
      expect(verifyManualPaymentSchema.safeParse({ isVerified: true }).success).toBe(false);
    });
  });

  // -- isVerified (boolean) ------------------------------------------------

  describe('isVerified', () => {
    it('should reject missing isVerified', () => {
      expect(verifyManualPaymentSchema.safeParse({ paymentId: UUID }).success).toBe(false);
    });

    it('should reject string "true" for isVerified', () => {
      expect(verifyManualPaymentSchema.safeParse({ ...validVerification, isVerified: 'true' }).success).toBe(false);
    });

    it('should reject number 1 for isVerified', () => {
      expect(verifyManualPaymentSchema.safeParse({ ...validVerification, isVerified: 1 }).success).toBe(false);
    });
  });

  it('should reject empty object', () => {
    expect(verifyManualPaymentSchema.safeParse({}).success).toBe(false);
  });
});
