import {
  oemProfileSchema,
  contactPersonSchema,
  financialsSchema,
  apcdSelectionSchema,
  declarationSchema,
  installationExperienceSchema,
  staffDetailSchema,
  querySchema,
  evaluationScoreSchema,
  complianceSchema,
  qualitySchema,
  manualPaymentSchema,
  queryResponseSchema,
  evaluationSubmitSchema,
} from './application.validator';

describe('oemProfileSchema', () => {
  const validProfile = {
    companyName: 'ACME Filters Pvt Ltd',
    fullAddress: '123 Industrial Area, Sector 5',
    state: 'Rajasthan',
    pinCode: '302017',
    contactNo: '9876543210',
    gstRegistrationNo: '08AABCU9603R1ZM',
    panNo: 'AABCU9603R',
    firmType: 'PRIVATE_LIMITED' as const,
  };

  it('should accept a valid profile with required fields', () => {
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

  it('should default boolean fields to false', () => {
    const result = oemProfileSchema.safeParse(validProfile);
    if (result.success) {
      expect(result.data.isMSE).toBe(false);
      expect(result.data.isStartup).toBe(false);
      expect(result.data.isLocalSupplier).toBe(false);
    }
  });

  it('should reject missing companyName', () => {
    const { companyName, ...rest } = validProfile;
    const result = oemProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing fullAddress', () => {
    const { fullAddress, ...rest } = validProfile;
    const result = oemProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid GST format', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, gstRegistrationNo: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid PAN format', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, panNo: '12345' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid PIN code (not 6 digits)', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, pinCode: '1234' });
    expect(result.success).toBe(false);
  });

  it('should accept valid optional fields', () => {
    const result = oemProfileSchema.safeParse({
      ...validProfile,
      firmAreaSqm: 500,
      employeeCount: 100,
      gpsLatitude: 26.9,
      gpsLongitude: 75.7,
      firmSize: 'MEDIUM',
    });
    expect(result.success).toBe(true);
  });

  it('should reject latitude out of range', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, gpsLatitude: 100 });
    expect(result.success).toBe(false);
  });

  it('should reject longitude out of range', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, gpsLongitude: -200 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid firmType enum value', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, firmType: 'INVALID_TYPE' });
    expect(result.success).toBe(false);
  });

  it('should reject localContentPercent > 100', () => {
    const result = oemProfileSchema.safeParse({ ...validProfile, localContentPercent: 150 });
    expect(result.success).toBe(false);
  });
});

describe('contactPersonSchema', () => {
  const validContact = {
    type: 'COMMERCIAL' as const,
    name: 'John Doe',
    mobileNo: '9876543210',
    email: 'john@example.com',
  };

  it('should accept a valid contact person', () => {
    const result = contactPersonSchema.safeParse(validContact);
    expect(result.success).toBe(true);
  });

  it('should accept TECHNICAL type', () => {
    const result = contactPersonSchema.safeParse({ ...validContact, type: 'TECHNICAL' });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const { name, ...rest } = validContact;
    const result = contactPersonSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = contactPersonSchema.safeParse({ ...validContact, email: 'not-email' });
    expect(result.success).toBe(false);
  });

  it('should reject missing mobileNo', () => {
    const { mobileNo, ...rest } = validContact;
    const result = contactPersonSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('financialsSchema', () => {
  const validFinancials = {
    turnoverYear1: 5000000,
    turnoverYear2: 6000000,
    turnoverYear3: 7000000,
  };

  it('should accept valid financials', () => {
    const result = financialsSchema.safeParse(validFinancials);
    expect(result.success).toBe(true);
  });

  it('should default year labels', () => {
    const result = financialsSchema.safeParse(validFinancials);
    if (result.success) {
      expect(result.data.turnoverYear1Label).toBe('2022-23');
      expect(result.data.turnoverYear2Label).toBe('2023-24');
      expect(result.data.turnoverYear3Label).toBe('2024-25');
    }
  });

  it('should reject negative turnover', () => {
    const result = financialsSchema.safeParse({ ...validFinancials, turnoverYear1: -1000 });
    expect(result.success).toBe(false);
  });

  it('should accept zero turnover', () => {
    const result = financialsSchema.safeParse({ ...validFinancials, turnoverYear1: 0 });
    expect(result.success).toBe(true);
  });

  it('should default ISO booleans to false', () => {
    const result = financialsSchema.safeParse(validFinancials);
    if (result.success) {
      expect(result.data.hasISO9001).toBe(false);
      expect(result.data.hasISO14001).toBe(false);
      expect(result.data.hasISO45001).toBe(false);
    }
  });
});

describe('apcdSelectionSchema', () => {
  const validSelection = {
    apcdTypeId: '550e8400-e29b-41d4-a716-446655440000',
  };

  it('should accept a valid APCD selection', () => {
    const result = apcdSelectionSchema.safeParse(validSelection);
    expect(result.success).toBe(true);
  });

  it('should reject non-UUID apcdTypeId', () => {
    const result = apcdSelectionSchema.safeParse({ apcdTypeId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject missing apcdTypeId', () => {
    const result = apcdSelectionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept valid installationCategory', () => {
    const result = apcdSelectionSchema.safeParse({
      ...validSelection,
      installationCategory: 'BOTH',
    });
    expect(result.success).toBe(true);
  });

  it('should default booleans to false', () => {
    const result = apcdSelectionSchema.safeParse(validSelection);
    if (result.success) {
      expect(result.data.isManufactured).toBe(false);
      expect(result.data.seekingEmpanelment).toBe(false);
    }
  });
});

describe('declarationSchema', () => {
  it('should accept when declaration is accepted with signatory', () => {
    const result = declarationSchema.safeParse({
      declarationAccepted: true,
      declarationSignatory: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('should reject when declarationAccepted is false', () => {
    const result = declarationSchema.safeParse({
      declarationAccepted: false,
      declarationSignatory: 'John Doe',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing signatory', () => {
    const result = declarationSchema.safeParse({ declarationAccepted: true });
    expect(result.success).toBe(false);
  });

  it('should reject short signatory name', () => {
    const result = declarationSchema.safeParse({
      declarationAccepted: true,
      declarationSignatory: 'A',
    });
    expect(result.success).toBe(false);
  });
});

describe('installationExperienceSchema', () => {
  const validExperience = {
    industryName: 'Reliance Industries',
    location: 'Mumbai, Maharashtra',
    installationDate: '2023-06-15',
    emissionSource: 'Boiler flue gas',
    apcdType: 'Electrostatic Precipitator',
  };

  it('should accept valid installation experience', () => {
    const result = installationExperienceSchema.safeParse(validExperience);
    expect(result.success).toBe(true);
  });

  it('should reject missing industryName', () => {
    const { industryName, ...rest } = validExperience;
    const result = installationExperienceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing location', () => {
    const { location, ...rest } = validExperience;
    const result = installationExperienceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should accept optional fields', () => {
    const result = installationExperienceSchema.safeParse({
      ...validExperience,
      apcdCapacity: '50 TPH',
      performanceResult: '99.5% efficiency',
    });
    expect(result.success).toBe(true);
  });
});

describe('staffDetailSchema', () => {
  const validStaff = {
    name: 'Jane Smith',
    designation: 'Site Engineer',
    qualification: 'B.Tech Mechanical',
    experienceYears: 5,
  };

  it('should accept valid staff detail', () => {
    const result = staffDetailSchema.safeParse(validStaff);
    expect(result.success).toBe(true);
  });

  it('should reject negative experience years', () => {
    const result = staffDetailSchema.safeParse({ ...validStaff, experienceYears: -2 });
    expect(result.success).toBe(false);
  });

  it('should accept zero experience years', () => {
    const result = staffDetailSchema.safeParse({ ...validStaff, experienceYears: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const { name, ...rest } = validStaff;
    const result = staffDetailSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should default isFieldVisitCoordinator to false', () => {
    const result = staffDetailSchema.safeParse(validStaff);
    if (result.success) {
      expect(result.data.isFieldVisitCoordinator).toBe(false);
    }
  });
});

describe('querySchema', () => {
  it('should accept a valid query', () => {
    const result = querySchema.safeParse({
      subject: 'Missing ISO certificate',
      description: 'Please upload the ISO 9001 certificate as per requirement',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing subject', () => {
    const result = querySchema.safeParse({
      description: 'Please upload the ISO 9001 certificate as per requirement',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short subject (< 5 chars)', () => {
    const result = querySchema.safeParse({
      subject: 'Hi',
      description: 'Some longer description here',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short description (< 10 chars)', () => {
    const result = querySchema.safeParse({
      subject: 'Valid subject here',
      description: 'Short',
    });
    expect(result.success).toBe(false);
  });
});

describe('evaluationScoreSchema', () => {
  it('should accept a valid evaluation score', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'EXPERIENCE_SCOPE',
      score: 8,
    });
    expect(result.success).toBe(true);
  });

  it('should reject score greater than 10', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'EXPERIENCE_SCOPE',
      score: 11,
    });
    expect(result.success).toBe(false);
  });

  it('should reject score less than 0', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'TECHNICAL_SPECIFICATION',
      score: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should accept score of 0', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'FINANCIAL_STANDING',
      score: 0,
    });
    expect(result.success).toBe(true);
  });

  it('should accept score of 10', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'LEGAL_QUALITY_COMPLIANCE',
      score: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-integer score', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'COMPLAINT_HANDLING',
      score: 7.5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid criterion', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'INVALID_CRITERION',
      score: 5,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional remarks', () => {
    const result = evaluationScoreSchema.safeParse({
      criterion: 'CLIENT_FEEDBACK',
      score: 9,
      remarks: 'Excellent client references',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid criterion values', () => {
    const criteria = [
      'EXPERIENCE_SCOPE', 'TECHNICAL_SPECIFICATION', 'TECHNICAL_TEAM',
      'FINANCIAL_STANDING', 'LEGAL_QUALITY_COMPLIANCE', 'COMPLAINT_HANDLING',
      'CLIENT_FEEDBACK', 'GLOBAL_SUPPLY',
    ];
    for (const criterion of criteria) {
      const result = evaluationScoreSchema.safeParse({ criterion, score: 5 });
      expect(result.success).toBe(true);
    }
  });
});
