import {
  oemProfileSchema,
  contactPersonSchema,
  financialsSchema,
  apcdSelectionSchema,
  declarationSchema,
  installationExperienceSchema,
  fieldVerificationSiteSchema,
  staffDetailSchema,
  querySchema,
  evaluationScoreSchema,
  complianceSchema,
  qualitySchema,
  manualPaymentSchema,
  queryResponseSchema,
  evaluationSubmitSchema,
} from './application.validator';

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_GST = '08AABCU9603R1ZM';
const VALID_PAN = 'AABCU9603R';

// ---------------------------------------------------------------------------
// oemProfileSchema
// ---------------------------------------------------------------------------

describe('oemProfileSchema', () => {
  const validProfile = {
    companyName: 'ACME Filters Pvt Ltd',
    fullAddress: '123 Industrial Area, Sector 5',
    state: 'Rajasthan',
    pinCode: '302017',
    contactNo: '9876543210',
    gstRegistrationNo: VALID_GST,
    panNo: VALID_PAN,
    firmType: 'PRIVATE_LIMITED' as const,
  };

  // -- happy path -----------------------------------------------------------

  it('should accept a valid profile with required fields only', () => {
    const result = oemProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('should default country to India', () => {
    const result = oemProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('India');
    }
  });

  it('should default boolean fields (isMSE, isStartup, isLocalSupplier) to false', () => {
    const result = oemProfileSchema.safeParse(validProfile);
    if (result.success) {
      expect(result.data.isMSE).toBe(false);
      expect(result.data.isStartup).toBe(false);
      expect(result.data.isLocalSupplier).toBe(false);
    }
  });

  it('should accept full valid data with all optional fields populated', () => {
    const result = oemProfileSchema.safeParse({
      ...validProfile,
      country: 'India',
      firmAreaSqm: 500,
      employeeCount: 100,
      gpsLatitude: 26.9,
      gpsLongitude: 75.7,
      firmSize: 'MEDIUM',
      udyamRegistrationNo: 'UDYAM-RJ-01-0012345',
      isMSE: true,
      isStartup: true,
      isLocalSupplier: true,
      localContentPercent: 60,
      dpiitRecognitionNo: 'DIPP12345',
    });
    expect(result.success).toBe(true);
  });

  // -- companyName ----------------------------------------------------------

  describe('companyName', () => {
    it('should reject missing companyName', () => {
      const { companyName, ...rest } = validProfile;
      expect(oemProfileSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, companyName: '' }).success).toBe(false);
    });

    it('should reject single character (min 2)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, companyName: 'A' }).success).toBe(false);
    });

    it('should accept exactly 2 characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, companyName: 'AB' }).success).toBe(true);
    });

    it('should accept exactly 255 characters (max)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, companyName: 'A'.repeat(255) }).success).toBe(true);
    });

    it('should reject 256 characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, companyName: 'A'.repeat(256) }).success).toBe(false);
    });

    it('should accept whitespace-only string if length >= 2 (Zod does not trim)', () => {
      // Zod string().min(2) counts whitespace chars; this tests that the schema does NOT trim
      expect(oemProfileSchema.safeParse({ ...validProfile, companyName: '   ' }).success).toBe(true);
    });
  });

  // -- fullAddress ----------------------------------------------------------

  describe('fullAddress', () => {
    it('should reject missing fullAddress', () => {
      const { fullAddress, ...rest } = validProfile;
      expect(oemProfileSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, fullAddress: '' }).success).toBe(false);
    });

    it('should reject 4 chars (min 5)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, fullAddress: '1234' }).success).toBe(false);
    });

    it('should accept exactly 5 characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, fullAddress: '12345' }).success).toBe(true);
    });

    it('should accept exactly 500 characters (max)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, fullAddress: 'A'.repeat(500) }).success).toBe(true);
    });

    it('should reject 501 characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, fullAddress: 'A'.repeat(501) }).success).toBe(false);
    });
  });

  // -- state ----------------------------------------------------------------

  describe('state', () => {
    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, state: '' }).success).toBe(false);
    });

    it('should reject 1 character (min 2)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, state: 'A' }).success).toBe(false);
    });

    it('should accept 2 characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, state: 'RJ' }).success).toBe(true);
    });
  });

  // -- pinCode (regex: exactly 6 digits) ------------------------------------

  describe('pinCode', () => {
    it('should accept valid 6-digit pin', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '110001' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '' }).success).toBe(false);
    });

    it('should reject 5 digits', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '11000' }).success).toBe(false);
    });

    it('should reject 7 digits', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '1100011' }).success).toBe(false);
    });

    it('should reject alphabetic characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: 'ABCDEF' }).success).toBe(false);
    });

    it('should reject alphanumeric mix', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '1100AB' }).success).toBe(false);
    });

    it('should reject pin with leading zero followed by 5 digits (still valid 6 digits)', () => {
      // "012345" is 6 digits => should pass
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '012345' }).success).toBe(true);
    });

    it('should reject pin with spaces', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, pinCode: '302 017' }).success).toBe(false);
    });
  });

  // -- contactNo (min 10, max 15) -------------------------------------------

  describe('contactNo', () => {
    it('should accept 10-digit number', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, contactNo: '9876543210' }).success).toBe(true);
    });

    it('should accept number with country code (13 chars)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, contactNo: '+919876543210' }).success).toBe(true);
    });

    it('should accept exactly 15 chars (max)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, contactNo: '123456789012345' }).success).toBe(true);
    });

    it('should reject 9 chars (below min 10)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, contactNo: '987654321' }).success).toBe(false);
    });

    it('should reject 16 chars (above max 15)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, contactNo: '1234567890123456' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, contactNo: '' }).success).toBe(false);
    });
  });

  // -- GST Registration Number -----------------------------------------------

  describe('gstRegistrationNo', () => {
    // GST format: 2-digit state code (00-37) + PAN (5 alpha + 4 digit + 1 alpha) + 1 alphanumeric + Z + 1 alphanumeric
    // Regex: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

    it('should accept valid GST 08AABCU9603R1ZM', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '08AABCU9603R1ZM' }).success).toBe(true);
    });

    it('should accept valid GST 27AAPFU0939F1ZV', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '27AAPFU0939F1ZV' }).success).toBe(true);
    });

    it('should accept valid GST 06BZAHM6385P6Z2', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '06BZAHM6385P6Z2' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '' }).success).toBe(false);
    });

    it('should reject lowercase letters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '08aabcu9603r1zm' }).success).toBe(false);
    });

    it('should reject too short (7 chars)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '08AABCU' }).success).toBe(false);
    });

    it('should reject without Z in 13th position', () => {
      // Replace Z with X: '08AABCU9603R1XM'
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '08AABCU9603R1XM' }).success).toBe(false);
    });

    it('should reject state code starting with letters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: 'AAABCU9603R1ZM' }).success).toBe(false);
    });

    it('should reject 0 in position 12 (must be 1-9 or A-Z)', () => {
      // Position 12 (0-indexed 11): [1-9A-Z] -- "0" is not allowed
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '08AABCU9603R0ZM' }).success).toBe(false);
    });

    it('should reject arbitrary string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: 'INVALID_GST_NUM' }).success).toBe(false);
    });

    it('should reject 16-char string (too long by 1)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: '08AABCU9603R1ZMA' }).success).toBe(false);
    });
  });

  // -- PAN Number (regex: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/) --------------------

  describe('panNo', () => {
    it('should accept valid PAN AABCU9603R', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'AABCU9603R' }).success).toBe(true);
    });

    it('should accept valid PAN AAAAA0000A', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'AAAAA0000A' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: '' }).success).toBe(false);
    });

    it('should reject lowercase', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'aabcu9603r' }).success).toBe(false);
    });

    it('should reject too short (8 chars)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'AABCU960' }).success).toBe(false);
    });

    it('should reject too long (11 chars)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'AABCU9603RA' }).success).toBe(false);
    });

    it('should reject wrong pattern -- digits first', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: '12345ABCDE' }).success).toBe(false);
    });

    it('should reject mixed case', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'AaBcU9603R' }).success).toBe(false);
    });

    it('should reject special characters', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, panNo: 'AABCU960@R' }).success).toBe(false);
    });
  });

  // -- firmType (enum) ------------------------------------------------------

  describe('firmType', () => {
    const validFirmTypes = ['PROPRIETARY', 'PRIVATE_LIMITED', 'LIMITED_COMPANY', 'PUBLIC_SECTOR', 'SOCIETY'];

    it.each(validFirmTypes)('should accept valid enum value: %s', (val) => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmType: val }).success).toBe(true);
    });

    it('should reject empty string (enum bug test)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmType: '' }).success).toBe(false);
    });

    it('should reject invalid enum value "PARTNERSHIP"', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmType: 'PARTNERSHIP' }).success).toBe(false);
    });

    it('should reject null', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmType: null }).success).toBe(false);
    });

    it('should reject number', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmType: 1 }).success).toBe(false);
    });
  });

  // -- firmSize (optional enum) ---------------------------------------------

  describe('firmSize', () => {
    const validSizes = ['COTTAGE', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE'];

    it.each(validSizes)('should accept: %s', (val) => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmSize: val }).success).toBe(true);
    });

    it('should accept undefined (optional)', () => {
      const data = { ...validProfile };
      delete (data as Record<string, unknown>)['firmSize'];
      expect(oemProfileSchema.safeParse(data).success).toBe(true);
    });

    it('should reject empty string (enum bug test)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmSize: '' }).success).toBe(false);
    });

    it('should reject invalid value "GIGANTIC"', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmSize: 'GIGANTIC' }).success).toBe(false);
    });
  });

  // -- firmAreaSqm (optional, positive number) ------------------------------

  describe('firmAreaSqm', () => {
    it('should accept positive number', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmAreaSqm: 100 }).success).toBe(true);
    });

    it('should accept large positive', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmAreaSqm: 999999 }).success).toBe(true);
    });

    it('should accept positive float', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmAreaSqm: 100.5 }).success).toBe(true);
    });

    it('should reject zero (must be positive, not nonnegative)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmAreaSqm: 0 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, firmAreaSqm: -10 }).success).toBe(false);
    });
  });

  // -- employeeCount (optional, int, positive) ------------------------------

  describe('employeeCount', () => {
    it('should accept positive integer', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, employeeCount: 50 }).success).toBe(true);
    });

    it('should reject float', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, employeeCount: 50.5 }).success).toBe(false);
    });

    it('should reject zero (must be positive)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, employeeCount: 0 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, employeeCount: -5 }).success).toBe(false);
    });
  });

  // -- gpsLatitude (optional, -90 to 90) ------------------------------------

  describe('gpsLatitude', () => {
    it('should accept valid Indian latitude', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: 19.076 }).success).toBe(true);
    });

    it('should accept boundary -90', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: -90 }).success).toBe(true);
    });

    it('should accept boundary 90', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: 90 }).success).toBe(true);
    });

    it('should accept 0', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: 0 }).success).toBe(true);
    });

    it('should reject 90.1', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: 90.1 }).success).toBe(false);
    });

    it('should reject -90.1', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: -90.1 }).success).toBe(false);
    });

    it('should reject 100', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: 100 }).success).toBe(false);
    });
  });

  // -- gpsLongitude (optional, -180 to 180) ---------------------------------

  describe('gpsLongitude', () => {
    it('should accept valid Indian longitude', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLongitude: 72.8777 }).success).toBe(true);
    });

    it('should accept boundary -180', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLongitude: -180 }).success).toBe(true);
    });

    it('should accept boundary 180', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLongitude: 180 }).success).toBe(true);
    });

    it('should reject 180.1', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLongitude: 180.1 }).success).toBe(false);
    });

    it('should reject -200', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, gpsLongitude: -200 }).success).toBe(false);
    });
  });

  // -- localContentPercent (optional, 0-100) --------------------------------

  describe('localContentPercent', () => {
    it('should accept 0 (boundary)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, localContentPercent: 0 }).success).toBe(true);
    });

    it('should accept 100 (boundary)', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, localContentPercent: 100 }).success).toBe(true);
    });

    it('should accept 50', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, localContentPercent: 50 }).success).toBe(true);
    });

    it('should reject 101', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, localContentPercent: 101 }).success).toBe(false);
    });

    it('should reject 150', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, localContentPercent: 150 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(oemProfileSchema.safeParse({ ...validProfile, localContentPercent: -1 }).success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// contactPersonSchema
// ---------------------------------------------------------------------------

describe('contactPersonSchema', () => {
  const validContact = {
    type: 'COMMERCIAL' as const,
    name: 'John Doe',
    mobileNo: '9876543210',
    email: 'john@example.com',
  };

  it('should accept a valid COMMERCIAL contact', () => {
    expect(contactPersonSchema.safeParse(validContact).success).toBe(true);
  });

  it('should accept a valid TECHNICAL contact', () => {
    expect(contactPersonSchema.safeParse({ ...validContact, type: 'TECHNICAL' }).success).toBe(true);
  });

  it('should accept optional designation', () => {
    expect(contactPersonSchema.safeParse({ ...validContact, designation: 'Manager' }).success).toBe(true);
  });

  // -- type enum ------------------------------------------------------------

  describe('type', () => {
    it('should reject empty string (enum bug test)', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, type: '' }).success).toBe(false);
    });

    it('should reject invalid type "ADMIN"', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, type: 'ADMIN' }).success).toBe(false);
    });

    it('should reject missing type', () => {
      const { type, ...rest } = validContact;
      expect(contactPersonSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- name -----------------------------------------------------------------

  describe('name', () => {
    it('should reject empty string', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, name: '' }).success).toBe(false);
    });

    it('should reject single character (min 2)', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, name: 'A' }).success).toBe(false);
    });

    it('should accept exactly 2 characters', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, name: 'AB' }).success).toBe(true);
    });

    it('should reject missing name', () => {
      const { name, ...rest } = validContact;
      expect(contactPersonSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- email ----------------------------------------------------------------

  describe('email', () => {
    it('should accept valid email', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, email: 'test@example.com' }).success).toBe(true);
    });

    it('should accept email with subdomain', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, email: 'test@sub.example.com' }).success).toBe(true);
    });

    it('should reject string without @', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, email: 'invalidemail' }).success).toBe(false);
    });

    it('should reject string with @ but no domain', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, email: 'test@' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, email: '' }).success).toBe(false);
    });

    it('should reject whitespace only', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, email: '   ' }).success).toBe(false);
    });

    it('should reject missing email', () => {
      const { email, ...rest } = validContact;
      expect(contactPersonSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- mobileNo (min 10, max 15) -------------------------------------------

  describe('mobileNo', () => {
    it('should accept 10-digit number', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, mobileNo: '9876543210' }).success).toBe(true);
    });

    it('should accept 15 characters (max)', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, mobileNo: '123456789012345' }).success).toBe(true);
    });

    it('should reject 9 chars (below min)', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, mobileNo: '123456789' }).success).toBe(false);
    });

    it('should reject 16 chars (above max)', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, mobileNo: '1234567890123456' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(contactPersonSchema.safeParse({ ...validContact, mobileNo: '' }).success).toBe(false);
    });

    it('should reject missing mobileNo', () => {
      const { mobileNo, ...rest } = validContact;
      expect(contactPersonSchema.safeParse(rest).success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// financialsSchema
// ---------------------------------------------------------------------------

describe('financialsSchema', () => {
  const validFinancials = {
    turnoverYear1: 5000000,
    turnoverYear2: 6000000,
    turnoverYear3: 7000000,
  };

  it('should accept valid financials with required fields only', () => {
    const result = financialsSchema.safeParse(validFinancials);
    expect(result.success).toBe(true);
  });

  it('should set default year labels', () => {
    const result = financialsSchema.safeParse(validFinancials);
    if (result.success) {
      expect(result.data.turnoverYear1Label).toBe('2022-23');
      expect(result.data.turnoverYear2Label).toBe('2023-24');
      expect(result.data.turnoverYear3Label).toBe('2024-25');
    }
  });

  it('should set default ISO booleans to false', () => {
    const result = financialsSchema.safeParse(validFinancials);
    if (result.success) {
      expect(result.data.hasISO9001).toBe(false);
      expect(result.data.hasISO14001).toBe(false);
      expect(result.data.hasISO45001).toBe(false);
    }
  });

  // -- turnover fields (nonnegative) ----------------------------------------

  describe('turnover fields', () => {
    it('should accept zero turnover (nonnegative allows 0)', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, turnoverYear1: 0 }).success).toBe(true);
    });

    it('should reject negative turnoverYear1', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, turnoverYear1: -1 }).success).toBe(false);
    });

    it('should reject negative turnoverYear2', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, turnoverYear2: -1000 }).success).toBe(false);
    });

    it('should reject negative turnoverYear3', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, turnoverYear3: -0.01 }).success).toBe(false);
    });

    it('should reject missing turnoverYear1', () => {
      const { turnoverYear1, ...rest } = validFinancials;
      expect(financialsSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing turnoverYear2', () => {
      const { turnoverYear2, ...rest } = validFinancials;
      expect(financialsSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing turnoverYear3', () => {
      const { turnoverYear3, ...rest } = validFinancials;
      expect(financialsSchema.safeParse(rest).success).toBe(false);
    });

    it('should accept very large turnover', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, turnoverYear1: 999999999999 }).success).toBe(true);
    });

    it('should accept decimal turnover', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, turnoverYear1: 1234567.89 }).success).toBe(true);
    });
  });

  // -- ISO certifications ---------------------------------------------------

  describe('ISO certifications', () => {
    it('should accept all ISO certs set to true', () => {
      const result = financialsSchema.safeParse({
        ...validFinancials,
        hasISO9001: true,
        hasISO14001: true,
        hasISO45001: true,
      });
      expect(result.success).toBe(true);
    });
  });

  // -- otherStandards (optional string) -------------------------------------

  describe('otherStandards', () => {
    it('should accept optional otherStandards', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, otherStandards: 'ISO 27001, CE Mark' }).success).toBe(true);
    });

    it('should accept empty string for optional otherStandards', () => {
      expect(financialsSchema.safeParse({ ...validFinancials, otherStandards: '' }).success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// complianceSchema
// ---------------------------------------------------------------------------

describe('complianceSchema', () => {
  it('should accept isBlacklisted: false', () => {
    expect(complianceSchema.safeParse({ isBlacklisted: false }).success).toBe(true);
  });

  it('should accept isBlacklisted: true with details', () => {
    expect(complianceSchema.safeParse({ isBlacklisted: true, blacklistDetails: 'Details here' }).success).toBe(true);
  });

  it('should accept isBlacklisted: true without details (details is optional)', () => {
    expect(complianceSchema.safeParse({ isBlacklisted: true }).success).toBe(true);
  });

  it('should reject missing isBlacklisted', () => {
    expect(complianceSchema.safeParse({}).success).toBe(false);
  });

  it('should reject string "false" for isBlacklisted', () => {
    expect(complianceSchema.safeParse({ isBlacklisted: 'false' }).success).toBe(false);
  });

  it('should reject string "no" for isBlacklisted', () => {
    expect(complianceSchema.safeParse({ isBlacklisted: 'no' }).success).toBe(false);
  });

  it('should reject number 0 for isBlacklisted', () => {
    expect(complianceSchema.safeParse({ isBlacklisted: 0 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// apcdSelectionSchema
// ---------------------------------------------------------------------------

describe('apcdSelectionSchema', () => {
  const validSelection = { apcdTypeId: UUID };

  it('should accept valid UUID', () => {
    expect(apcdSelectionSchema.safeParse(validSelection).success).toBe(true);
  });

  it('should set default booleans to false', () => {
    const result = apcdSelectionSchema.safeParse(validSelection);
    if (result.success) {
      expect(result.data.isManufactured).toBe(false);
      expect(result.data.seekingEmpanelment).toBe(false);
    }
  });

  it('should reject non-UUID string', () => {
    expect(apcdSelectionSchema.safeParse({ apcdTypeId: 'not-a-uuid' }).success).toBe(false);
  });

  it('should reject empty string for UUID', () => {
    expect(apcdSelectionSchema.safeParse({ apcdTypeId: '' }).success).toBe(false);
  });

  it('should reject missing apcdTypeId', () => {
    expect(apcdSelectionSchema.safeParse({}).success).toBe(false);
  });

  // -- installationCategory (optional enum) ---------------------------------

  describe('installationCategory', () => {
    it.each(['BOILER_FURNACE_TFH', 'NON_BOILER_NON_FURNACE', 'BOTH'])(
      'should accept valid category: %s',
      (val) => {
        expect(apcdSelectionSchema.safeParse({ ...validSelection, installationCategory: val }).success).toBe(true);
      },
    );

    it('should reject empty string (enum bug test)', () => {
      expect(apcdSelectionSchema.safeParse({ ...validSelection, installationCategory: '' }).success).toBe(false);
    });

    it('should reject invalid category "INVALID"', () => {
      expect(apcdSelectionSchema.safeParse({ ...validSelection, installationCategory: 'INVALID' }).success).toBe(false);
    });

    it('should accept undefined (optional)', () => {
      expect(apcdSelectionSchema.safeParse(validSelection).success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// qualitySchema
// ---------------------------------------------------------------------------

describe('qualitySchema', () => {
  it('should accept hasGrievanceSystem: true', () => {
    expect(qualitySchema.safeParse({ hasGrievanceSystem: true }).success).toBe(true);
  });

  it('should accept hasGrievanceSystem: false', () => {
    expect(qualitySchema.safeParse({ hasGrievanceSystem: false }).success).toBe(true);
  });

  it('should reject missing hasGrievanceSystem', () => {
    expect(qualitySchema.safeParse({}).success).toBe(false);
  });

  it('should reject string "yes"', () => {
    expect(qualitySchema.safeParse({ hasGrievanceSystem: 'yes' }).success).toBe(false);
  });

  it('should reject number 1', () => {
    expect(qualitySchema.safeParse({ hasGrievanceSystem: 1 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// manualPaymentSchema
// ---------------------------------------------------------------------------

describe('manualPaymentSchema', () => {
  const validPayment = {
    utrNumber: 'UTR12345678',
    remitterBankName: 'State Bank of India',
    neftAmount: 25000,
    neftDate: '2025-01-15',
  };

  it('should accept valid payment', () => {
    expect(manualPaymentSchema.safeParse(validPayment).success).toBe(true);
  });

  // -- utrNumber (min 5) ---------------------------------------------------

  describe('utrNumber', () => {
    it('should accept exactly 5 chars (min)', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, utrNumber: 'UTR12' }).success).toBe(true);
    });

    it('should reject 4 chars', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, utrNumber: 'UTR1' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, utrNumber: '' }).success).toBe(false);
    });
  });

  // -- remitterBankName (min 2) ---------------------------------------------

  describe('remitterBankName', () => {
    it('should accept exactly 2 chars (min)', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, remitterBankName: 'SB' }).success).toBe(true);
    });

    it('should reject 1 char', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, remitterBankName: 'A' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, remitterBankName: '' }).success).toBe(false);
    });
  });

  // -- neftAmount (positive) ------------------------------------------------

  describe('neftAmount', () => {
    it('should accept positive integer', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftAmount: 29500 }).success).toBe(true);
    });

    it('should accept positive decimal', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftAmount: 25000.50 }).success).toBe(true);
    });

    it('should accept very small positive', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftAmount: 0.01 }).success).toBe(true);
    });

    it('should reject zero (must be positive)', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftAmount: 0 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftAmount: -100 }).success).toBe(false);
    });
  });

  // -- neftDate (min 1) -----------------------------------------------------

  describe('neftDate', () => {
    it('should accept ISO date string', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftDate: '2025-01-15' }).success).toBe(true);
    });

    it('should accept DD-MM-YYYY format (no format validation, just min 1)', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftDate: '15-01-2025' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(manualPaymentSchema.safeParse({ ...validPayment, neftDate: '' }).success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// declarationSchema
// ---------------------------------------------------------------------------

describe('declarationSchema', () => {
  it('should accept accepted declaration with valid signatory', () => {
    const result = declarationSchema.safeParse({
      declarationAccepted: true,
      declarationSignatory: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('should reject false declaration', () => {
    const result = declarationSchema.safeParse({
      declarationAccepted: false,
      declarationSignatory: 'John Doe',
    });
    expect(result.success).toBe(false);
  });

  it('should provide custom error message for false declaration', () => {
    const result = declarationSchema.safeParse({
      declarationAccepted: false,
      declarationSignatory: 'John Doe',
    });
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('declarationAccepted'));
      expect(issue?.message).toBe('You must accept the declaration');
    }
  });

  it('should reject missing declarationAccepted', () => {
    expect(declarationSchema.safeParse({ declarationSignatory: 'John Doe' }).success).toBe(false);
  });

  it('should reject missing signatory', () => {
    expect(declarationSchema.safeParse({ declarationAccepted: true }).success).toBe(false);
  });

  it('should reject signatory with 1 char (min 2)', () => {
    expect(declarationSchema.safeParse({ declarationAccepted: true, declarationSignatory: 'A' }).success).toBe(false);
  });

  it('should reject empty signatory', () => {
    expect(declarationSchema.safeParse({ declarationAccepted: true, declarationSignatory: '' }).success).toBe(false);
  });

  it('should accept signatory with exactly 2 chars', () => {
    expect(declarationSchema.safeParse({ declarationAccepted: true, declarationSignatory: 'AB' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// installationExperienceSchema
// ---------------------------------------------------------------------------

describe('installationExperienceSchema', () => {
  const validExp = {
    industryName: 'Reliance Industries',
    location: 'Mumbai, Maharashtra',
    installationDate: '2023-06-15',
    emissionSource: 'Boiler flue gas',
    apcdType: 'Electrostatic Precipitator',
  };

  it('should accept valid installation experience', () => {
    expect(installationExperienceSchema.safeParse(validExp).success).toBe(true);
  });

  it('should accept optional apcdCapacity and performanceResult', () => {
    expect(
      installationExperienceSchema.safeParse({
        ...validExp,
        apcdCapacity: '50 TPH',
        performanceResult: '99.5% efficiency',
      }).success,
    ).toBe(true);
  });

  describe('required field minimums', () => {
    it('should reject industryName < 2 chars', () => {
      expect(installationExperienceSchema.safeParse({ ...validExp, industryName: 'A' }).success).toBe(false);
    });

    it('should reject empty industryName', () => {
      expect(installationExperienceSchema.safeParse({ ...validExp, industryName: '' }).success).toBe(false);
    });

    it('should reject location < 5 chars', () => {
      expect(installationExperienceSchema.safeParse({ ...validExp, location: 'ABC' }).success).toBe(false);
    });

    it('should reject installationDate < 3 chars', () => {
      expect(installationExperienceSchema.safeParse({ ...validExp, installationDate: 'AB' }).success).toBe(false);
    });

    it('should reject emissionSource < 2 chars', () => {
      expect(installationExperienceSchema.safeParse({ ...validExp, emissionSource: 'B' }).success).toBe(false);
    });

    it('should reject apcdType < 2 chars', () => {
      expect(installationExperienceSchema.safeParse({ ...validExp, apcdType: 'E' }).success).toBe(false);
    });

    it('should reject missing industryName', () => {
      const { industryName, ...rest } = validExp;
      expect(installationExperienceSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing location', () => {
      const { location, ...rest } = validExp;
      expect(installationExperienceSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing installationDate', () => {
      const { installationDate, ...rest } = validExp;
      expect(installationExperienceSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing emissionSource', () => {
      const { emissionSource, ...rest } = validExp;
      expect(installationExperienceSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject missing apcdType', () => {
      const { apcdType, ...rest } = validExp;
      expect(installationExperienceSchema.safeParse(rest).success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// fieldVerificationSiteSchema
// ---------------------------------------------------------------------------

describe('fieldVerificationSiteSchema', () => {
  const validSite = {
    slNo: 1,
    industryName: 'Test Factory',
    location: 'Delhi NCR Region',
    apcdType: 'Bag Filter',
  };

  it('should accept valid data', () => {
    expect(fieldVerificationSiteSchema.safeParse(validSite).success).toBe(true);
  });

  // -- slNo (int, 1-3) -----------------------------------------------------

  describe('slNo', () => {
    it('should accept 1 (boundary)', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: 1 }).success).toBe(true);
    });

    it('should accept 2', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: 2 }).success).toBe(true);
    });

    it('should accept 3 (boundary)', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: 3 }).success).toBe(true);
    });

    it('should reject 0', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: 0 }).success).toBe(false);
    });

    it('should reject 4', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: 4 }).success).toBe(false);
    });

    it('should reject negative', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: -1 }).success).toBe(false);
    });

    it('should reject float 1.5', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, slNo: 1.5 }).success).toBe(false);
    });
  });

  // -- required string fields -----------------------------------------------

  describe('required fields', () => {
    it('should reject industryName < 2 chars', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, industryName: 'A' }).success).toBe(false);
    });

    it('should reject location < 5 chars', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, location: 'AB' }).success).toBe(false);
    });

    it('should reject apcdType < 2 chars', () => {
      expect(fieldVerificationSiteSchema.safeParse({ ...validSite, apcdType: 'B' }).success).toBe(false);
    });
  });

  // -- optional fields ------------------------------------------------------

  it('should accept all optional fields populated', () => {
    expect(
      fieldVerificationSiteSchema.safeParse({
        ...validSite,
        industryRepName: 'Mr. Test',
        industryRepDesignation: 'Plant Manager',
        industryRepMobile: '9876543210',
        installationDate: '2023-01-15',
        technologyType: 'Pulse Jet',
        designCapacity: '50000 m3/hr',
        materialOfConstruction: 'MS with epoxy coating',
        warrantyPeriod: '2 years',
        portholeInlet: true,
        portholeOutlet: false,
        emissionSource: 'Kiln exhaust',
        performanceResult: 'PM < 30 mg/Nm3',
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// staffDetailSchema
// ---------------------------------------------------------------------------

describe('staffDetailSchema', () => {
  const validStaff = {
    name: 'Jane Smith',
    designation: 'Site Engineer',
    qualification: 'B.Tech Mechanical',
    experienceYears: 5,
  };

  it('should accept valid staff detail', () => {
    expect(staffDetailSchema.safeParse(validStaff).success).toBe(true);
  });

  it('should default isFieldVisitCoordinator to false', () => {
    const result = staffDetailSchema.safeParse(validStaff);
    if (result.success) {
      expect(result.data.isFieldVisitCoordinator).toBe(false);
    }
  });

  it('should accept 0 experience years (nonnegative)', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, experienceYears: 0 }).success).toBe(true);
  });

  it('should reject negative experience years', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, experienceYears: -2 }).success).toBe(false);
  });

  it('should accept float experience years (nonnegative, no int constraint)', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, experienceYears: 2.5 }).success).toBe(true);
  });

  it('should reject empty name', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, name: '' }).success).toBe(false);
  });

  it('should reject name with 1 char (min 2)', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, name: 'J' }).success).toBe(false);
  });

  it('should reject empty designation', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, designation: '' }).success).toBe(false);
  });

  it('should reject designation with 1 char (min 2)', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, designation: 'S' }).success).toBe(false);
  });

  it('should reject empty qualification', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, qualification: '' }).success).toBe(false);
  });

  it('should reject qualification with 1 char (min 2)', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, qualification: 'B' }).success).toBe(false);
  });

  it('should reject missing name', () => {
    const { name, ...rest } = validStaff;
    expect(staffDetailSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject missing designation', () => {
    const { designation, ...rest } = validStaff;
    expect(staffDetailSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject missing qualification', () => {
    const { qualification, ...rest } = validStaff;
    expect(staffDetailSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject missing experienceYears', () => {
    const { experienceYears, ...rest } = validStaff;
    expect(staffDetailSchema.safeParse(rest).success).toBe(false);
  });

  it('should accept optional employeeId', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, employeeId: 'EMP-001' }).success).toBe(true);
  });

  it('should accept optional mobileNo', () => {
    expect(staffDetailSchema.safeParse({ ...validStaff, mobileNo: '9876543210' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// querySchema
// ---------------------------------------------------------------------------

describe('querySchema', () => {
  const validQuery = {
    subject: 'Missing ISO certificate',
    description: 'Please upload the ISO 9001 certificate as per requirement',
  };

  it('should accept a valid query', () => {
    expect(querySchema.safeParse(validQuery).success).toBe(true);
  });

  // -- subject (min 5, max 255) ---------------------------------------------

  describe('subject', () => {
    it('should accept exactly 5 chars (min)', () => {
      expect(querySchema.safeParse({ ...validQuery, subject: '12345' }).success).toBe(true);
    });

    it('should reject 4 chars', () => {
      expect(querySchema.safeParse({ ...validQuery, subject: '1234' }).success).toBe(false);
    });

    it('should reject 2 chars', () => {
      expect(querySchema.safeParse({ ...validQuery, subject: 'Hi' }).success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(querySchema.safeParse({ ...validQuery, subject: '' }).success).toBe(false);
    });

    it('should accept exactly 255 chars (max)', () => {
      expect(querySchema.safeParse({ ...validQuery, subject: 'A'.repeat(255) }).success).toBe(true);
    });

    it('should reject 256 chars', () => {
      expect(querySchema.safeParse({ ...validQuery, subject: 'A'.repeat(256) }).success).toBe(false);
    });

    it('should reject missing subject', () => {
      const { subject, ...rest } = validQuery;
      expect(querySchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- description (min 10, max 2000) ---------------------------------------

  describe('description', () => {
    it('should accept exactly 10 chars (min)', () => {
      expect(querySchema.safeParse({ ...validQuery, description: '1234567890' }).success).toBe(true);
    });

    it('should reject 9 chars', () => {
      expect(querySchema.safeParse({ ...validQuery, description: '123456789' }).success).toBe(false);
    });

    it('should reject "Short"', () => {
      expect(querySchema.safeParse({ ...validQuery, description: 'Short' }).success).toBe(false);
    });

    it('should accept exactly 2000 chars (max)', () => {
      expect(querySchema.safeParse({ ...validQuery, description: 'A'.repeat(2000) }).success).toBe(true);
    });

    it('should reject 2001 chars', () => {
      expect(querySchema.safeParse({ ...validQuery, description: 'A'.repeat(2001) }).success).toBe(false);
    });
  });

  // -- optional fields ------------------------------------------------------

  it('should accept optional documentType', () => {
    expect(querySchema.safeParse({ ...validQuery, documentType: 'ISO_CERTIFICATE' }).success).toBe(true);
  });

  it('should accept optional deadline', () => {
    expect(querySchema.safeParse({ ...validQuery, deadline: '2025-02-01' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// queryResponseSchema
// ---------------------------------------------------------------------------

describe('queryResponseSchema', () => {
  it('should accept valid response (>= 5 chars)', () => {
    expect(queryResponseSchema.safeParse({ message: 'Here is the document.' }).success).toBe(true);
  });

  it('should accept exactly 5 chars (min)', () => {
    expect(queryResponseSchema.safeParse({ message: '12345' }).success).toBe(true);
  });

  it('should reject 4 chars', () => {
    expect(queryResponseSchema.safeParse({ message: '1234' }).success).toBe(false);
  });

  it('should reject "OK" (too short)', () => {
    expect(queryResponseSchema.safeParse({ message: 'OK' }).success).toBe(false);
  });

  it('should reject empty string', () => {
    expect(queryResponseSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('should accept exactly 5000 chars (max)', () => {
    expect(queryResponseSchema.safeParse({ message: 'A'.repeat(5000) }).success).toBe(true);
  });

  it('should reject 5001 chars', () => {
    expect(queryResponseSchema.safeParse({ message: 'A'.repeat(5001) }).success).toBe(false);
  });

  it('should reject missing message', () => {
    expect(queryResponseSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluationScoreSchema
// ---------------------------------------------------------------------------

describe('evaluationScoreSchema', () => {
  const validScore = { criterion: 'EXPERIENCE_SCOPE' as const, score: 8 };

  it('should accept a valid score', () => {
    expect(evaluationScoreSchema.safeParse(validScore).success).toBe(true);
  });

  // -- score (int, 0-10) ---------------------------------------------------

  describe('score boundaries', () => {
    it('should accept 0 (min)', () => {
      expect(evaluationScoreSchema.safeParse({ ...validScore, score: 0 }).success).toBe(true);
    });

    it('should accept 10 (max)', () => {
      expect(evaluationScoreSchema.safeParse({ ...validScore, score: 10 }).success).toBe(true);
    });

    it('should accept 5 (mid)', () => {
      expect(evaluationScoreSchema.safeParse({ ...validScore, score: 5 }).success).toBe(true);
    });

    it('should reject 11 (above max)', () => {
      expect(evaluationScoreSchema.safeParse({ ...validScore, score: 11 }).success).toBe(false);
    });

    it('should reject -1 (below min)', () => {
      expect(evaluationScoreSchema.safeParse({ ...validScore, score: -1 }).success).toBe(false);
    });

    it('should reject float 7.5 (must be int)', () => {
      expect(evaluationScoreSchema.safeParse({ ...validScore, score: 7.5 }).success).toBe(false);
    });
  });

  // -- criterion (enum) ----------------------------------------------------

  describe('criterion enum', () => {
    const allCriteria = [
      'EXPERIENCE_SCOPE',
      'TECHNICAL_SPECIFICATION',
      'TECHNICAL_TEAM',
      'FINANCIAL_STANDING',
      'LEGAL_QUALITY_COMPLIANCE',
      'COMPLAINT_HANDLING',
      'CLIENT_FEEDBACK',
      'GLOBAL_SUPPLY',
    ];

    it.each(allCriteria)('should accept valid criterion: %s', (criterion) => {
      expect(evaluationScoreSchema.safeParse({ criterion, score: 5 }).success).toBe(true);
    });

    it('should have exactly 8 valid criteria', () => {
      // Verify by trying all, count successes
      let successCount = 0;
      for (const c of allCriteria) {
        if (evaluationScoreSchema.safeParse({ criterion: c, score: 5 }).success) successCount++;
      }
      expect(successCount).toBe(8);
    });

    it('should reject empty string (enum bug test)', () => {
      expect(evaluationScoreSchema.safeParse({ criterion: '', score: 5 }).success).toBe(false);
    });

    it('should reject "INVALID_CRITERION"', () => {
      expect(evaluationScoreSchema.safeParse({ criterion: 'INVALID_CRITERION', score: 5 }).success).toBe(false);
    });
  });

  it('should accept optional remarks', () => {
    expect(evaluationScoreSchema.safeParse({ ...validScore, remarks: 'Good performance' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluationSubmitSchema
// ---------------------------------------------------------------------------

describe('evaluationSubmitSchema', () => {
  const allCriteria = [
    'EXPERIENCE_SCOPE',
    'TECHNICAL_SPECIFICATION',
    'TECHNICAL_TEAM',
    'FINANCIAL_STANDING',
    'LEGAL_QUALITY_COMPLIANCE',
    'COMPLAINT_HANDLING',
    'CLIENT_FEEDBACK',
    'GLOBAL_SUPPLY',
  ] as const;

  const allScores = allCriteria.map((c) => ({ criterion: c, score: 7 }));

  const validSubmission = {
    scores: allScores,
    recommendation: 'APPROVE' as const,
  };

  it('should accept valid submission with all 8 criteria', () => {
    expect(evaluationSubmitSchema.safeParse(validSubmission).success).toBe(true);
  });

  it('should accept exactly 7 scores (minimum required)', () => {
    expect(evaluationSubmitSchema.safeParse({ ...validSubmission, scores: allScores.slice(0, 7) }).success).toBe(true);
  });

  it('should reject 6 scores (below minimum 7)', () => {
    expect(evaluationSubmitSchema.safeParse({ ...validSubmission, scores: allScores.slice(0, 6) }).success).toBe(false);
  });

  it('should reject empty scores array', () => {
    expect(evaluationSubmitSchema.safeParse({ ...validSubmission, scores: [] }).success).toBe(false);
  });

  // -- recommendation (enum) ------------------------------------------------

  describe('recommendation', () => {
    it.each(['APPROVE', 'REJECT', 'NEED_MORE_INFO', 'FIELD_VERIFICATION_REQUIRED'])(
      'should accept: %s',
      (rec) => {
        expect(evaluationSubmitSchema.safeParse({ ...validSubmission, recommendation: rec }).success).toBe(true);
      },
    );

    it('should reject empty string (enum bug test)', () => {
      expect(evaluationSubmitSchema.safeParse({ ...validSubmission, recommendation: '' }).success).toBe(false);
    });

    it('should reject "PENDING"', () => {
      expect(evaluationSubmitSchema.safeParse({ ...validSubmission, recommendation: 'PENDING' }).success).toBe(false);
    });

    it('should reject missing recommendation', () => {
      const { recommendation, ...rest } = validSubmission;
      expect(evaluationSubmitSchema.safeParse(rest).success).toBe(false);
    });
  });

  it('should accept optional overallRemarks', () => {
    expect(
      evaluationSubmitSchema.safeParse({
        ...validSubmission,
        overallRemarks: 'Overall satisfactory performance',
      }).success,
    ).toBe(true);
  });

  it('should reject if individual score is invalid (score > 10)', () => {
    const badScores = [...allScores];
    badScores[0] = { criterion: 'EXPERIENCE_SCOPE', score: 15 };
    expect(evaluationSubmitSchema.safeParse({ ...validSubmission, scores: badScores }).success).toBe(false);
  });
});
