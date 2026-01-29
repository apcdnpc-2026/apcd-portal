import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemToken: string;
  let oemUserId: string;
  let officerToken: string;
  let officerUserId: string;
  let profileId: string;
  let applicationId: string;

  const password = 'Str0ng@Pass!';

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    await cleanDatabase(prisma);

    const passwordHash = await bcrypt.hash(password, 12);

    // Create OEM user
    const oemUser = await prisma.user.create({
      data: {
        email: 'oem-pay@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Payer',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Payment Test Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACG5678F1ZK',
        panNo: 'AAACG5678F',
        contactNo: '9876543211',
        fullAddress: '456 Payment Street, Block B',
        state: 'Delhi',
        country: 'India',
        pinCode: '110002',
        gpsLatitude: 28.6139,
        gpsLongitude: 77.209,
        isMSE: false,
        isStartup: false,
        isLocalSupplier: false,
      },
    });
    profileId = profile.id;

    // Create a SUBMITTED application with APCD selections
    const application = await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-6001',
        applicantId: oemUserId,
        oemProfileId: profileId,
        status: 'SUBMITTED',
        currentStep: 9,
        submittedAt: new Date(),
      },
    });
    applicationId = application.id;

    // Create an APCD type and selection so fee calculation includes at least one type
    const apcdType = await prisma.aPCDType.create({
      data: {
        category: 'ESP',
        subType: 'Dry ESP (Plate Type)',
        description: 'Electrostatic Precipitator - Dry plate type',
        isActive: true,
        sortOrder: 1,
      },
    });

    await prisma.applicationApcd.create({
      data: {
        applicationId,
        apcdTypeId: apcdType.id,
        isManufactured: true,
        seekingEmpanelment: true,
        installationCategory: 'BOILER_FURNACE_TFH',
      },
    });

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-pay@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Verifier',
        isActive: true,
        isVerified: true,
      },
    });
    officerUserId = officerUser.id;

    // Login both users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-pay@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-pay@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Calculate Fees ──────────────────────────────────────────────────────────

  describe('GET /api/payments/calculate/:applicationId', () => {
    it('should return correct fee breakdown with GST', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/payments/calculate/${applicationId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('applicationFee');
      expect(res.body).toHaveProperty('empanelmentFee');
      expect(res.body).toHaveProperty('grandTotal');
      expect(res.body).toHaveProperty('apcdCount');

      // Application fee: Rs 25,000 + 18% GST = Rs 29,500
      expect(res.body.applicationFee.baseAmount).toBe(25000);
      expect(res.body.applicationFee.gstRate).toBe(18);
      expect(res.body.applicationFee.gstAmount).toBe(4500);
      expect(res.body.applicationFee.total).toBe(29500);

      // Empanelment fee: Rs 65,000 * 1 APCD + 18% GST = Rs 76,700
      expect(res.body.empanelmentFee.baseAmount).toBe(65000);
      expect(res.body.empanelmentFee.gstAmount).toBe(11700);
      expect(res.body.empanelmentFee.total).toBe(76700);

      // Grand total
      expect(res.body.grandTotal).toBe(29500 + 76700);
      expect(res.body.apcdCount).toBe(1);

      // Non-MSE, non-startup, non-local: no discount
      expect(res.body.isDiscountEligible).toBe(false);
      expect(res.body.refundAmount).toBe(0);
    });
  });

  // ─── Record Manual Payment ───────────────────────────────────────────────────

  describe('POST /api/payments/manual', () => {
    let manualPaymentId: string;

    it('should create a VERIFICATION_PENDING payment with UTR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/payments/manual')
        .set('Authorization', `Bearer ${oemToken}`)
        .send({
          applicationId,
          paymentType: 'APPLICATION_FEE',
          baseAmount: 25000,
          utrNumber: 'UTR123456789012',
          neftDate: '2025-06-15',
          remitterBankName: 'State Bank of India',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('VERIFICATION_PENDING');
      expect(res.body.paymentMethod).toBe('NEFT');
      expect(res.body.utrNumber).toBe('UTR123456789012');
      expect(res.body.remitterBankName).toBe('State Bank of India');
      expect(Number(res.body.baseAmount)).toBe(25000);
      expect(Number(res.body.gstAmount)).toBe(4500);
      expect(Number(res.body.totalAmount)).toBe(29500);

      manualPaymentId = res.body.id;
    });

    // ─── Get Payments for Application ────────────────────────────────────────

    it('should list payments for the application', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/payments/application/${applicationId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const payment = res.body.find((p: any) => p.id === manualPaymentId);
      expect(payment).toBeDefined();
      expect(payment.status).toBe('VERIFICATION_PENDING');
    });

    // ─── Officer Verifies Manual Payment ─────────────────────────────────────

    it('officer should verify a manual payment (VERIFIED)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/payments/${manualPaymentId}/verify`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          isVerified: true,
          remarks: 'UTR confirmed with bank',
        })
        .expect(200);

      expect(res.body.status).toBe('VERIFIED');
      expect(res.body.verifiedById).toBe(officerUserId);
      expect(res.body.verificationNote).toBe('UTR confirmed with bank');
      expect(res.body.verifiedAt).toBeDefined();
    });

    // ─── Officer Rejects Manual Payment ──────────────────────────────────────

    it('officer should reject a manual payment (FAILED)', async () => {
      // Create another manual payment to reject
      const newPayment = await prisma.payment.create({
        data: {
          applicationId,
          paymentType: 'EMPANELMENT_FEE',
          paymentMethod: 'NEFT',
          status: 'VERIFICATION_PENDING',
          baseAmount: 65000,
          gstRate: 18,
          gstAmount: 11700,
          totalAmount: 76700,
          utrNumber: 'UTR999999999999',
          neftDate: new Date('2025-06-15'),
          remitterBankName: 'HDFC Bank',
          neftAmount: 76700,
        },
      });

      const res = await request(app.getHttpServer())
        .put(`/api/payments/${newPayment.id}/verify`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          isVerified: false,
          remarks: 'UTR number does not match bank records',
        })
        .expect(200);

      expect(res.body.status).toBe('FAILED');
      expect(res.body.verifiedById).toBe(officerUserId);
      expect(res.body.verificationNote).toBe('UTR number does not match bank records');
    });
  });

  // ─── Pending Verification ────────────────────────────────────────────────────

  describe('GET /api/payments/pending-verification', () => {
    it('officer should see payments pending verification', async () => {
      // Create a pending payment for this test
      await prisma.payment.create({
        data: {
          applicationId,
          paymentType: 'FIELD_VERIFICATION',
          paymentMethod: 'NEFT',
          status: 'VERIFICATION_PENDING',
          baseAmount: 57000,
          gstRate: 18,
          gstAmount: 10260,
          totalAmount: 67260,
          utrNumber: 'UTR555555555555',
          neftDate: new Date('2025-07-01'),
          remitterBankName: 'ICICI Bank',
          neftAmount: 67260,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/payments/pending-verification')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const pendingPayment = res.body.find((p: any) => p.utrNumber === 'UTR555555555555');
      expect(pendingPayment).toBeDefined();
      expect(pendingPayment.status).toBe('VERIFICATION_PENDING');
      expect(pendingPayment).toHaveProperty('application');
      expect(pendingPayment.application).toHaveProperty('applicant');
      expect(pendingPayment.application).toHaveProperty('oemProfile');
    });
  });

  // ─── Bank Details (Public) ───────────────────────────────────────────────────

  describe('GET /api/payments/bank-details', () => {
    it('should return NPC bank details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/payments/bank-details')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('bankName');
      expect(res.body).toHaveProperty('accountName');
      expect(res.body).toHaveProperty('accountNumber');
      expect(res.body).toHaveProperty('ifscCode');
      expect(res.body).toHaveProperty('branch');
      expect(res.body.bankName).toBe('State Bank of India');
      expect(res.body.accountName).toBe('National Productivity Council');
    });
  });

  // ─── Payment Stats ──────────────────────────────────────────────────────────

  describe('GET /api/payments/stats', () => {
    it('admin/officer should get payment statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/payments/stats')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalPayments');
      expect(res.body).toHaveProperty('totalAmount');
      expect(res.body).toHaveProperty('verifiedPayments');
      expect(res.body).toHaveProperty('verifiedAmount');
      expect(res.body).toHaveProperty('pendingVerification');
      expect(res.body).toHaveProperty('failedPayments');

      // We created multiple payments in earlier tests
      expect(res.body.totalPayments).toBeGreaterThanOrEqual(1);
      expect(res.body.verifiedPayments).toBeGreaterThanOrEqual(1);
      expect(res.body.pendingVerification).toBeGreaterThanOrEqual(1);
    });
  });
});
