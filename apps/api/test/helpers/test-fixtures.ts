/**
 * Test data factories for consistent, reusable mock data across unit and integration tests.
 */

export function createMockUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-uuid-1',
    email: 'oem@test.com',
    passwordHash: '$2b$12$LJ3m4ys1Gs/AwJwBird33eFMvNgi1bRNqR3xCpOGBLv1cDpiNrIbW', // "Test@1234"
    role: 'OEM' as const,
    isActive: true,
    isVerified: false,
    firstName: 'Test',
    lastName: 'User',
    phone: '9876543210',
    lastLoginAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

export function createMockOfficer(overrides: Record<string, any> = {}) {
  return createMockUser({
    id: 'officer-uuid-1',
    email: 'officer@test.com',
    role: 'OFFICER' as const,
    firstName: 'Officer',
    lastName: 'One',
    ...overrides,
  });
}

export function createMockCommitteeMember(overrides: Record<string, any> = {}) {
  return createMockUser({
    id: 'committee-uuid-1',
    email: 'committee@test.com',
    role: 'COMMITTEE' as const,
    firstName: 'Committee',
    lastName: 'Member',
    ...overrides,
  });
}

export function createMockOemProfile(overrides: Record<string, any> = {}) {
  return {
    id: 'profile-uuid-1',
    userId: 'user-uuid-1',
    companyName: 'Test APCD Corp',
    firmType: 'PRIVATE_LIMITED',
    gstNumber: '07AAACG1234F1ZK',
    panNumber: 'AAACG1234F',
    contactEmail: 'oem@test.com',
    contactPhone: '9876543210',
    firmSize: 'LARGE',
    totalArea: '5000 sqft',
    totalEmployees: 50,
    fullAddress: '123 Industrial Area',
    state: 'Delhi',
    country: 'India',
    pinCode: '110001',
    gpsLat: 28.6139,
    gpsLng: 77.209,
    isMSE: false,
    isStartup: false,
    isLocalSupplier: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

export function createMockApplication(overrides: Record<string, any> = {}) {
  return {
    id: 'app-uuid-1',
    applicationNumber: 'APCD-2025-0001',
    oemProfileId: 'profile-uuid-1',
    applicantId: 'user-uuid-1',
    assignedOfficerId: null,
    status: 'DRAFT' as const,
    currentStep: 1,
    turnoverYear1: null,
    turnoverYear2: null,
    turnoverYear3: null,
    hasISO9001: false,
    hasISO14001: false,
    hasISO45001: false,
    declarationAccepted: false,
    isBlacklisted: false,
    hasGrievanceSystem: false,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    lastQueriedAt: null,
    rejectionReason: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

export function createMockQuery(overrides: Record<string, any> = {}) {
  return {
    id: 'query-uuid-1',
    applicationId: 'app-uuid-1',
    raisedById: 'officer-uuid-1',
    subject: 'Missing GST Document',
    description: 'Please upload your GST certificate',
    documentType: 'GST_CERTIFICATE',
    deadline: new Date('2025-03-01'),
    status: 'OPEN' as const,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    ...overrides,
  };
}

export function createMockPayment(overrides: Record<string, any> = {}) {
  return {
    id: 'payment-uuid-1',
    applicationId: 'app-uuid-1',
    userId: 'user-uuid-1',
    paymentType: 'APPLICATION_FEE' as const,
    paymentMethod: 'RAZORPAY' as const,
    baseAmount: 25000,
    gstAmount: 4500,
    totalAmount: 29500,
    status: 'INITIATED' as const,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    utrNumber: null,
    neftDate: null,
    remitterBankName: null,
    verifiedById: null,
    verificationRemarks: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

export function createMockEvaluation(overrides: Record<string, any> = {}) {
  return {
    id: 'eval-uuid-1',
    applicationId: 'app-uuid-1',
    evaluatorId: 'committee-uuid-1',
    totalScore: 65,
    recommendation: 'APPROVE' as const,
    overallRemarks: 'Good application',
    createdAt: new Date('2025-01-20'),
    updatedAt: new Date('2025-01-20'),
    ...overrides,
  };
}

export function createMockCertificate(overrides: Record<string, any> = {}) {
  return {
    id: 'cert-uuid-1',
    applicationId: 'app-uuid-1',
    certificateNumber: 'NPC/APCD/2025/00001',
    certificateType: 'EMPANELMENT' as const,
    status: 'ACTIVE' as const,
    issuedAt: new Date('2025-02-01'),
    validFrom: new Date('2025-02-01'),
    validUntil: new Date('2027-02-01'),
    filePath: '/certificates/cert-uuid-1.pdf',
    qrCodeData: 'https://apcd.npc.gov.in/verify/NPC-APCD-2025-00001',
    revokedAt: null,
    revocationReason: null,
    createdAt: new Date('2025-02-01'),
    updatedAt: new Date('2025-02-01'),
    ...overrides,
  };
}
