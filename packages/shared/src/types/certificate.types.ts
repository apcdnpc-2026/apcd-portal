export enum CertificateType {
  PROVISIONAL = 'PROVISIONAL',
  FINAL = 'FINAL',
}

export enum CertificateStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

export const CERTIFICATE_VALIDITY_YEARS = 2;
export const RENEWAL_REMINDER_DAYS = 60; // Remind 60 days before expiry

export interface CertificateVerification {
  certificateNumber: string;
  companyName: string;
  apcdTypes: string[];
  status: CertificateStatus;
  issuedDate: string;
  validUntil: string;
  isValid: boolean;
}
