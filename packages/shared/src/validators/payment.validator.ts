import { z } from 'zod';

export const initiateRazorpayPaymentSchema = z.object({
  applicationId: z.string().uuid(),
  paymentType: z.enum([
    'APPLICATION_FEE',
    'EMPANELMENT_FEE',
    'FIELD_VERIFICATION',
    'EMISSION_TESTING',
    'ANNUAL_RENEWAL',
    'SURVEILLANCE_VISIT',
  ]),
  apcdTypeCount: z.number().int().min(1).default(1),
});

export const verifyRazorpayPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const submitManualPaymentSchema = z.object({
  applicationId: z.string().uuid(),
  paymentType: z.enum([
    'APPLICATION_FEE',
    'EMPANELMENT_FEE',
    'FIELD_VERIFICATION',
    'EMISSION_TESTING',
    'ANNUAL_RENEWAL',
    'SURVEILLANCE_VISIT',
  ]),
  utrNumber: z.string().min(5, 'UTR/NEFT number is required'),
  remitterBankName: z.string().min(2, 'Remitter bank name is required'),
  neftAmount: z.number().positive('Amount must be positive'),
  neftDate: z.string().min(1, 'Payment date is required'),
  apcdTypeCount: z.number().int().min(1).default(1),
});

export const verifyManualPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  isVerified: z.boolean(),
  verificationNote: z.string().optional(),
});

export type InitiateRazorpayInput = z.infer<typeof initiateRazorpayPaymentSchema>;
export type VerifyRazorpayInput = z.infer<typeof verifyRazorpayPaymentSchema>;
export type SubmitManualPaymentInput = z.infer<typeof submitManualPaymentSchema>;
export type VerifyManualPaymentInput = z.infer<typeof verifyManualPaymentSchema>;
