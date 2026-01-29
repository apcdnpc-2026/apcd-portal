import { z } from 'zod';

/** Step 1: Applicant Details (Form fields 1-14) */
export const oemProfileSchema = z.object({
  companyName: z.string().min(2, 'Company name is required').max(255),
  fullAddress: z.string().min(5, 'Full address is required').max(500),
  state: z.string().min(2, 'State is required'),
  country: z.string().default('India'),
  pinCode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  contactNo: z.string().min(10, 'Contact number is required').max(15),
  gstRegistrationNo: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number'),
  panNo: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number'),
  firmType: z.enum(['PROPRIETARY', 'PRIVATE_LIMITED', 'LIMITED_COMPANY', 'PUBLIC_SECTOR', 'SOCIETY']),
  firmAreaSqm: z.number().positive().optional(),
  employeeCount: z.number().int().positive().optional(),
  gpsLatitude: z.number().min(-90).max(90).optional(),
  gpsLongitude: z.number().min(-180).max(180).optional(),
  firmSize: z.enum(['COTTAGE', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE']).optional(),
  udyamRegistrationNo: z.string().optional(),
  isMSE: z.boolean().default(false),
  isStartup: z.boolean().default(false),
  isLocalSupplier: z.boolean().default(false),
  localContentPercent: z.number().min(0).max(100).optional(),
  dpiitRecognitionNo: z.string().optional(),
});

/** Step 2: Contact Persons (Form fields 15-16) */
export const contactPersonSchema = z.object({
  type: z.enum(['COMMERCIAL', 'TECHNICAL']),
  name: z.string().min(2, 'Name is required'),
  designation: z.string().optional(),
  mobileNo: z.string().min(10, 'Mobile number is required').max(15),
  email: z.string().email('Invalid email address'),
});

/** Step 3: Financials (Form fields 17-19) */
export const financialsSchema = z.object({
  turnoverYear1: z.number().nonnegative('Turnover must be non-negative'),
  turnoverYear2: z.number().nonnegative('Turnover must be non-negative'),
  turnoverYear3: z.number().nonnegative('Turnover must be non-negative'),
  turnoverYear1Label: z.string().default('2022-23'),
  turnoverYear2Label: z.string().default('2023-24'),
  turnoverYear3Label: z.string().default('2024-25'),
  hasISO9001: z.boolean().default(false),
  hasISO14001: z.boolean().default(false),
  hasISO45001: z.boolean().default(false),
  otherStandards: z.string().optional(),
});

/** Step 4: Compliance (Form field 20) */
export const complianceSchema = z.object({
  isBlacklisted: z.boolean(),
  blacklistDetails: z.string().optional(),
});

/** Step 5: APCD Selection (Form fields 21-22) */
export const apcdSelectionSchema = z.object({
  apcdTypeId: z.string().uuid(),
  isManufactured: z.boolean().default(false),
  seekingEmpanelment: z.boolean().default(false),
  installationCategory: z
    .enum(['BOILER_FURNACE_TFH', 'NON_BOILER_NON_FURNACE', 'BOTH'])
    .optional(),
  designCapacityRange: z.string().optional(),
});

/** Step 6: Quality (Form fields 23-24) */
export const qualitySchema = z.object({
  hasGrievanceSystem: z.boolean(),
});

/** Step 8: Payment details (Form field 25) */
export const manualPaymentSchema = z.object({
  utrNumber: z.string().min(5, 'UTR/NEFT number is required'),
  remitterBankName: z.string().min(2, 'Bank name is required'),
  neftAmount: z.number().positive('Amount must be positive'),
  neftDate: z.string().min(1, 'Payment date is required'),
});

/** Step 9: Declaration */
export const declarationSchema = z.object({
  declarationAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the declaration' }),
  }),
  declarationSignatory: z.string().min(2, 'Signatory name is required'),
});

/** Installation Experience (Annexure 6a) */
export const installationExperienceSchema = z.object({
  industryName: z.string().min(2, 'Industry name is required'),
  location: z.string().min(5, 'Location is required'),
  installationDate: z.string().min(3, 'Installation date is required'),
  emissionSource: z.string().min(2, 'Emission source is required'),
  apcdType: z.string().min(2, 'APCD type is required'),
  apcdCapacity: z.string().optional(),
  performanceResult: z.string().optional(),
});

/** Field Verification Site (Annexure 6b) */
export const fieldVerificationSiteSchema = z.object({
  slNo: z.number().int().min(1).max(3),
  industryName: z.string().min(2),
  location: z.string().min(5),
  industryRepName: z.string().optional(),
  industryRepDesignation: z.string().optional(),
  industryRepMobile: z.string().optional(),
  installationDate: z.string().optional(),
  apcdType: z.string().min(2),
  technologyType: z.string().optional(),
  designCapacity: z.string().optional(),
  materialOfConstruction: z.string().optional(),
  warrantyPeriod: z.string().optional(),
  portholeInlet: z.boolean().optional(),
  portholeOutlet: z.boolean().optional(),
  emissionSource: z.string().optional(),
  performanceResult: z.string().optional(),
});

/** Staff Detail (Annexure 7) */
export const staffDetailSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  employeeId: z.string().optional(),
  designation: z.string().min(2, 'Designation is required'),
  qualification: z.string().min(2, 'Qualification is required'),
  experienceYears: z.number().nonnegative(),
  isFieldVisitCoordinator: z.boolean().default(false),
  mobileNo: z.string().optional(),
});

/** Query raised by officer/committee */
export const querySchema = z.object({
  subject: z.string().min(5, 'Subject is required').max(255),
  description: z.string().min(10, 'Description is required').max(2000),
  documentType: z.string().optional(),
  deadline: z.string().optional(),
});

/** Query response from OEM */
export const queryResponseSchema = z.object({
  message: z.string().min(5, 'Response is required').max(5000),
});

/** Committee evaluation score */
export const evaluationScoreSchema = z.object({
  criterion: z.enum([
    'EXPERIENCE_SCOPE',
    'TECHNICAL_SPECIFICATION',
    'TECHNICAL_TEAM',
    'FINANCIAL_STANDING',
    'LEGAL_QUALITY_COMPLIANCE',
    'COMPLAINT_HANDLING',
    'CLIENT_FEEDBACK',
    'GLOBAL_SUPPLY',
  ]),
  score: z.number().int().min(0).max(10),
  remarks: z.string().optional(),
});

export const evaluationSubmitSchema = z.object({
  scores: z.array(evaluationScoreSchema).min(7, 'All 7 mandatory criteria must be scored'),
  recommendation: z.enum(['APPROVE', 'REJECT', 'NEED_MORE_INFO', 'FIELD_VERIFICATION_REQUIRED']),
  overallRemarks: z.string().optional(),
});
