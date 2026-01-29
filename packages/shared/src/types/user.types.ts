export enum Role {
  OEM = 'OEM',
  OFFICER = 'OFFICER',
  COMMITTEE = 'COMMITTEE',
  FIELD_VERIFIER = 'FIELD_VERIFIER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  isVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role.OEM; // Only OEMs can self-register
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.OEM]: 'OEM Applicant',
  [Role.OFFICER]: 'NPC Officer',
  [Role.COMMITTEE]: 'Committee Member',
  [Role.FIELD_VERIFIER]: 'Field Verifier',
  [Role.ADMIN]: 'Administrator',
  [Role.SUPER_ADMIN]: 'Super Administrator',
};
