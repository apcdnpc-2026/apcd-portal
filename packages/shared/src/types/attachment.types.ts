export enum DocumentType {
  COMPANY_REGISTRATION = 'COMPANY_REGISTRATION',
  GST_CERTIFICATE = 'GST_CERTIFICATE',
  PAN_CARD = 'PAN_CARD',
  PAYMENT_PROOF = 'PAYMENT_PROOF',
  SERVICE_SUPPORT_UNDERTAKING = 'SERVICE_SUPPORT_UNDERTAKING',
  NON_BLACKLISTING_DECLARATION = 'NON_BLACKLISTING_DECLARATION',
  TURNOVER_CERTIFICATE = 'TURNOVER_CERTIFICATE',
  ISO_CERTIFICATION = 'ISO_CERTIFICATION',
  PRODUCT_DATASHEET = 'PRODUCT_DATASHEET',
  CLIENT_PERFORMANCE_CERT = 'CLIENT_PERFORMANCE_CERT',
  TEST_CERTIFICATE = 'TEST_CERTIFICATE',
  DESIGN_CALCULATIONS = 'DESIGN_CALCULATIONS',
  MATERIAL_CONSTRUCTION_CERT = 'MATERIAL_CONSTRUCTION_CERT',
  WARRANTY_DOCUMENT = 'WARRANTY_DOCUMENT',
  BANK_SOLVENCY_CERT = 'BANK_SOLVENCY_CERT',
  INSTALLATION_EXPERIENCE = 'INSTALLATION_EXPERIENCE',
  GA_DRAWING = 'GA_DRAWING',
  PROCESS_FLOW_DIAGRAM = 'PROCESS_FLOW_DIAGRAM',
  CONSENT_TO_OPERATE = 'CONSENT_TO_OPERATE',
  GEO_TAGGED_PHOTOS = 'GEO_TAGGED_PHOTOS',
  TECHNICAL_CATALOGUE = 'TECHNICAL_CATALOGUE',
  ORG_CHART = 'ORG_CHART',
  STAFF_QUALIFICATION_PROOF = 'STAFF_QUALIFICATION_PROOF',
  GST_FILING_PROOF = 'GST_FILING_PROOF',
  NO_LEGAL_DISPUTES_AFFIDAVIT = 'NO_LEGAL_DISPUTES_AFFIDAVIT',
  COMPLAINT_HANDLING_POLICY = 'COMPLAINT_HANDLING_POLICY',
  ESCALATION_MECHANISM = 'ESCALATION_MECHANISM',
  MAKE_IN_INDIA_CERT = 'MAKE_IN_INDIA_CERT',
  STARTUP_RECOGNITION = 'STARTUP_RECOGNITION',
  UDYAM_CERTIFICATE = 'UDYAM_CERTIFICATE',
  BANK_ACCOUNT_DETAILS = 'BANK_ACCOUNT_DETAILS',
  FIELD_VERIFICATION_FORMAT = 'FIELD_VERIFICATION_FORMAT',
  GLOBAL_SUPPLY_DOCS = 'GLOBAL_SUPPLY_DOCS',
  FIELD_REPORT = 'FIELD_REPORT',
  FIELD_PHOTOS = 'FIELD_PHOTOS',
  LAB_TEST_REPORT = 'LAB_TEST_REPORT',
  OTHER = 'OTHER',
}

export interface DocumentRequirement {
  type: DocumentType;
  label: string;
  description: string;
  mandatory: boolean;
  maxFiles: number;
  acceptedTypes: string[];        // MIME types
  requiresGeoTag?: boolean;       // For factory photos
  annexureRef?: string;           // e.g., "Annexure 4"
}

export const DOCUMENT_REQUIREMENTS: DocumentRequirement[] = [
  {
    type: DocumentType.COMPANY_REGISTRATION,
    label: 'Company Registration Certificate',
    description: 'Certificate of Incorporation / Udyam (if MSME) / DPIIT Startup Recognition',
    mandatory: true,
    maxFiles: 3,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.GST_CERTIFICATE,
    label: 'GST Registration Certificate',
    description: 'Valid GSTIN Certificate',
    mandatory: true,
    maxFiles: 1,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.PAN_CARD,
    label: 'PAN Card',
    description: 'PAN Card copy',
    mandatory: true,
    maxFiles: 1,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.PAYMENT_PROOF,
    label: 'Proof of Online Payment',
    description: 'Application fee transaction details / bank receipt',
    mandatory: true,
    maxFiles: 2,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.SERVICE_SUPPORT_UNDERTAKING,
    label: 'Undertaking for Service Support',
    description: 'Notarized undertaking for 3-year service support after installation',
    mandatory: true,
    maxFiles: 1,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 4',
  },
  {
    type: DocumentType.NON_BLACKLISTING_DECLARATION,
    label: 'Non-Blacklisting Declaration',
    description: 'Self-declaration on company letterhead',
    mandatory: true,
    maxFiles: 1,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 5',
  },
  {
    type: DocumentType.TURNOVER_CERTIFICATE,
    label: 'Year-wise Turnover Certificate',
    description: 'Last 3 years financial statements (CA-certified with UDIN)',
    mandatory: true,
    maxFiles: 5,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.ISO_CERTIFICATION,
    label: 'Manufacturing Plant Certifications',
    description: 'ISO 9001, ISO 14001, OHSAS/ISO 45001 or equivalent (at least one)',
    mandatory: true,
    maxFiles: 5,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.PRODUCT_DATASHEET,
    label: 'Product Datasheets',
    description: 'Detailed specs for each APCD model',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.CLIENT_PERFORMANCE_CERT,
    label: 'Client Performance Certificates',
    description: 'Minimum 3 per APCD, preferably 1 from NCR, issued within last 5 years',
    mandatory: true,
    maxFiles: 20,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 12',
  },
  {
    type: DocumentType.TEST_CERTIFICATE,
    label: 'Test Certificates of APCDs',
    description: 'NABL or EPA-accredited lab reports (not older than 5 years)',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.DESIGN_CALCULATIONS,
    label: 'Design Calculations',
    description: 'For installed APCDs with corresponding test certificates',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.MATERIAL_CONSTRUCTION_CERT,
    label: 'Material of Construction Certificates',
    description: 'Material certificates for installed APCDs',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 11',
  },
  {
    type: DocumentType.WARRANTY_DOCUMENT,
    label: 'Warranty Documents',
    description: 'Official warranty policy with coverage period and components',
    mandatory: true,
    maxFiles: 5,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.BANK_SOLVENCY_CERT,
    label: 'Bank Solvency Certificate',
    description: 'Issued within last 12 months',
    mandatory: true,
    maxFiles: 1,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.INSTALLATION_EXPERIENCE,
    label: 'Experience in Installation of APCDs',
    description: 'Minimum 3 installations in last 5 years per APCD',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 6a',
  },
  {
    type: DocumentType.GA_DRAWING,
    label: 'General Arrangement (GA) Drawing',
    description: 'Attach if available',
    mandatory: false,
    maxFiles: 10,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.PROCESS_FLOW_DIAGRAM,
    label: 'Process Flow Diagram',
    description: 'Separate diagram for each APCD model',
    mandatory: false,
    maxFiles: 10,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.CONSENT_TO_OPERATE,
    label: 'Consent to Operate Certificate',
    description: 'CTO or non-applicability undertaking (Annexure 9)',
    mandatory: true,
    maxFiles: 2,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 9',
  },
  {
    type: DocumentType.GEO_TAGGED_PHOTOS,
    label: 'Geo-tagged Photographs',
    description: '2-3 color photos of plant, machinery, storage, manpower with GPS EXIF data',
    mandatory: true,
    maxFiles: 6,
    acceptedTypes: ['image/jpeg', 'image/png'],
    requiresGeoTag: true,
  },
  {
    type: DocumentType.TECHNICAL_CATALOGUE,
    label: 'Technical Catalogues / Brochures',
    description: 'Detailed specs and features of APCDs proposed for empanelment',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.ORG_CHART,
    label: 'Organizational Chart & Staffing Details',
    description: 'Attach the diagram',
    mandatory: true,
    maxFiles: 2,
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  {
    type: DocumentType.STAFF_QUALIFICATION_PROOF,
    label: 'Names, Qualifications, Roles & Experience Proof',
    description: 'Format as per Annexure 7',
    mandatory: true,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 7',
  },
  {
    type: DocumentType.GST_FILING_PROOF,
    label: 'GST Filing Proofs',
    description: 'GST returns of past 1 year',
    mandatory: true,
    maxFiles: 15,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.NO_LEGAL_DISPUTES_AFFIDAVIT,
    label: 'No Ongoing Legal Disputes',
    description: 'Self-declaration affidavit (notarized)',
    mandatory: true,
    maxFiles: 1,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 8',
  },
  {
    type: DocumentType.COMPLAINT_HANDLING_POLICY,
    label: 'Documented Complaint-Handling Policy',
    description: 'Written SOP for customer complaints - receive, log, investigate, resolve',
    mandatory: true,
    maxFiles: 2,
    acceptedTypes: ['application/pdf'],
  },
  {
    type: DocumentType.ESCALATION_MECHANISM,
    label: 'Escalation Mechanism & Corrective Actions',
    description: 'Documented escalation process with records of past corrective actions',
    mandatory: true,
    maxFiles: 5,
    acceptedTypes: ['application/pdf'],
  },
  // Optional documents
  {
    type: DocumentType.MAKE_IN_INDIA_CERT,
    label: 'Make in India Certificate (MII)',
    description: 'Class-I Local Supplier declaration with >=50% local content',
    mandatory: false,
    maxFiles: 1,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 3',
  },
  {
    type: DocumentType.BANK_ACCOUNT_DETAILS,
    label: 'Bank Account Details',
    description: 'OEM bank account details for billing',
    mandatory: false,
    maxFiles: 1,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 10',
  },
  {
    type: DocumentType.FIELD_VERIFICATION_FORMAT,
    label: 'Field Verification Format',
    description: '3 best locations for field verification',
    mandatory: false,
    maxFiles: 3,
    acceptedTypes: ['application/pdf'],
    annexureRef: 'Annexure 6b',
  },
  {
    type: DocumentType.GLOBAL_SUPPLY_DOCS,
    label: 'Global Supply Documents (Optional)',
    description: 'Export performance documents, international compliance certificates',
    mandatory: false,
    maxFiles: 10,
    acceptedTypes: ['application/pdf'],
  },
];

export const MANDATORY_DOCUMENTS = DOCUMENT_REQUIREMENTS.filter((d) => d.mandatory);
export const OPTIONAL_DOCUMENTS = DOCUMENT_REQUIREMENTS.filter((d) => !d.mandatory);

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;       // 10 MB per file
export const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024;   // 100 MB total per application

// ============================================================================
// Factory Photo Slots (6 mandatory geo-tagged photos)
// ============================================================================

export const FACTORY_PHOTO_SLOTS = [
  { slot: 'FRONT_VIEW', label: 'Front View of Factory', order: 1 },
  { slot: 'MANUFACTURING_AREA', label: 'Manufacturing Area', order: 2 },
  { slot: 'TESTING_LAB', label: 'Testing Laboratory', order: 3 },
  { slot: 'QC_AREA', label: 'Quality Control Area', order: 4 },
  { slot: 'RAW_MATERIAL_STORAGE', label: 'Raw Material Storage', order: 5 },
  { slot: 'FINISHED_GOODS', label: 'Finished Goods Area', order: 6 },
] as const;

export type FactoryPhotoSlot = typeof FACTORY_PHOTO_SLOTS[number]['slot'];

export interface GeoValidationResult {
  hasGps: boolean;
  hasTimestamp: boolean;
  hasValidGeoTag: boolean;
  latitude?: number;
  longitude?: number;
  timestamp?: Date;
  isWithinIndia?: boolean;
  error?: string;
}
