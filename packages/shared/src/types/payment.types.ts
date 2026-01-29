export enum PaymentType {
  APPLICATION_FEE = 'APPLICATION_FEE',
  EMPANELMENT_FEE = 'EMPANELMENT_FEE',
  FIELD_VERIFICATION = 'FIELD_VERIFICATION',
  EMISSION_TESTING = 'EMISSION_TESTING',
  ANNUAL_RENEWAL = 'ANNUAL_RENEWAL',
  SURVEILLANCE_VISIT = 'SURVEILLANCE_VISIT',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  VERIFICATION_PENDING = 'VERIFICATION_PENDING',
  VERIFIED = 'VERIFIED',
}

export enum PaymentMethod {
  RAZORPAY = 'RAZORPAY',
  NEFT = 'NEFT',
  RTGS = 'RTGS',
}

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  [PaymentType.APPLICATION_FEE]: 'Application Processing Fee',
  [PaymentType.EMPANELMENT_FEE]: 'Empanelment Fee (per APCD type)',
  [PaymentType.FIELD_VERIFICATION]: 'Field Verification Fee',
  [PaymentType.EMISSION_TESTING]: 'Emission Testing Fee (actuals)',
  [PaymentType.ANNUAL_RENEWAL]: 'Annual Renewal Fee',
  [PaymentType.SURVEILLANCE_VISIT]: 'Surveillance Visit Fee (actuals)',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pending',
  [PaymentStatus.INITIATED]: 'Payment Initiated',
  [PaymentStatus.COMPLETED]: 'Completed',
  [PaymentStatus.FAILED]: 'Failed',
  [PaymentStatus.REFUNDED]: 'Refunded',
  [PaymentStatus.VERIFICATION_PENDING]: 'Awaiting Verification',
  [PaymentStatus.VERIFIED]: 'Verified',
};

/** NPC designated bank account for NEFT/RTGS */
export const NPC_BANK_DETAILS = {
  accountHolder: 'NATIONAL PRODUCTIVITY COUNCIL',
  accountNumber: '026501000009207',
  bankName: 'Indian Overseas Bank',
  branch: 'Golf Link Branch, 70 Golf Link, New Delhi - 110003',
  ifscCode: 'IOBA0000265',
  gstin: '07AAATN0402F1Z8',
  pan: 'AAATN0402F',
} as const;
