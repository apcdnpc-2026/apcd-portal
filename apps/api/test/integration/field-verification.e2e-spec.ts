import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Field Verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemToken: string;
  let oemUserId: string;
  let officerToken: string;
  let officerUserId: string;
  let verifierToken: string;
  let verifierUserId: string;
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
        email: 'oem-field@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'FieldTest',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Field Verification Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACF1234F1ZK',
        panNo: 'AAACF1234F',
        contactNo: '9876543210',
        fullAddress: '600 Field Verification Lane',
        state: 'Delhi',
        country: 'India',
        pinCode: '110001',
        gpsLatitude: 28.6139,
        gpsLongitude: 77.209,
        isMSE: false,
        isStartup: false,
        isLocalSupplier: false,
      },
    });
    profileId = profile.id;

    // Create an application in FIELD_VERIFICATION status
    const application = await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-2001',
        applicantId: oemUserId,
        oemProfileId: profileId,
        status: 'FIELD_VERIFICATION',
        currentStep: 9,
        submittedAt: new Date(),
      },
    });
    applicationId = application.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-field@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'FieldAssign',
        isActive: true,
        isVerified: true,
      },
    });
    officerUserId = officerUser.id;

    // Create Field Verifier user
    const verifierUser = await prisma.user.create({
      data: {
        email: 'verifier-field@test.com',
        passwordHash,
        role: 'FIELD_VERIFIER',
        firstName: 'Field',
        lastName: 'Inspector',
        isActive: true,
        isVerified: true,
      },
    });
    verifierUserId = verifierUser.id;

    // Login all users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-field@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-field@test.com', password });
    officerToken = officerLogin.body.accessToken;

    const verifierLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'verifier-field@test.com', password });
    verifierToken = verifierLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Get Field Verification Sites ─────────────────────────────────────────────

  describe('GET /api/field-verification/sites', () => {
    it('field verifier should see their assigned sites', async () => {
      // Create a site assignment for the verifier
      await prisma.fieldVerificationSite.create({
        data: {
          applicationId,
          assignedVerifierId: verifierUserId,
          siteName: 'Main Manufacturing Unit',
          siteAddress: '600 Field Verification Lane, Delhi',
          scheduledDate: new Date('2025-07-15'),
          status: 'SCHEDULED',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/field-verification/sites')
        .set('Authorization', `Bearer ${verifierToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const site = res.body.find((s: any) => s.siteName === 'Main Manufacturing Unit');
      expect(site).toBeDefined();
      expect(site.applicationId).toBe(applicationId);
      expect(site.assignedVerifierId).toBe(verifierUserId);
      expect(site.status).toBe('SCHEDULED');
      expect(site).toHaveProperty('scheduledDate');
      expect(site).toHaveProperty('application');
      expect(site.application).toHaveProperty('oemProfile');
    });

    it('OEM cannot access field verification sites (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/field-verification/sites')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/field-verification/sites')
        .expect(401);
    });
  });

  // ─── Add Field Verification Site ──────────────────────────────────────────────

  describe('POST /api/field-verification/sites', () => {
    it('officer should add a new field verification site', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/field-verification/sites')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          applicationId,
          assignedVerifierId: verifierUserId,
          siteName: 'Secondary Warehouse',
          siteAddress: '700 Warehouse District, Delhi',
          scheduledDate: '2025-08-01',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.applicationId).toBe(applicationId);
      expect(res.body.assignedVerifierId).toBe(verifierUserId);
      expect(res.body.siteName).toBe('Secondary Warehouse');
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('field verifier cannot add sites (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/field-verification/sites')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          applicationId,
          assignedVerifierId: verifierUserId,
          siteName: 'Unauthorized Site',
          siteAddress: 'Test Address',
          scheduledDate: '2025-08-15',
        })
        .expect(403);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/field-verification/sites')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ applicationId })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ─── Submit Field Report ──────────────────────────────────────────────────────

  describe('POST /api/field-verification/sites/:siteId/report', () => {
    let siteId: string;

    beforeAll(async () => {
      const site = await prisma.fieldVerificationSite.findFirst({
        where: {
          applicationId,
          assignedVerifierId: verifierUserId,
          siteName: 'Main Manufacturing Unit',
        },
      });
      siteId = site!.id;
    });

    it('field verifier should submit a verification report', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/field-verification/sites/${siteId}/report`)
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          observations: 'Factory is well-maintained with proper equipment. APCD units are installed and operational.',
          infrastructureScore: 8,
          equipmentScore: 9,
          safetyScore: 7,
          complianceScore: 8,
          overallScore: 80,
          recommendation: 'SATISFACTORY',
          remarks: 'All equipment functioning as per specifications. Minor safety improvements recommended.',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('siteId', siteId);
      expect(res.body.recommendation).toBe('SATISFACTORY');
      expect(res.body.overallScore).toBe(80);
      expect(res.body).toHaveProperty('submittedAt');

      // Verify site status was updated
      const updatedSite = await prisma.fieldVerificationSite.findUnique({
        where: { id: siteId },
      });
      expect(updatedSite!.status).toBe('COMPLETED');
    });

    it('should return 400 for duplicate report on the same site', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/field-verification/sites/${siteId}/report`)
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          observations: 'Duplicate report attempt',
          overallScore: 75,
          recommendation: 'SATISFACTORY',
        })
        .expect(400);

      expect(res.body.message).toMatch(/already submitted|already exists/i);
    });

    it('officer cannot submit a field report (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/field-verification/sites/${siteId}/report`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          observations: 'Officer trying to submit report',
          overallScore: 70,
          recommendation: 'SATISFACTORY',
        })
        .expect(403);
    });

    it('should return 404 for nonexistent site ID', async () => {
      await request(app.getHttpServer())
        .post('/api/field-verification/sites/00000000-0000-0000-0000-000000000000/report')
        .set('Authorization', `Bearer ${verifierToken}`)
        .send({
          observations: 'Nonexistent site',
          overallScore: 70,
          recommendation: 'SATISFACTORY',
        })
        .expect(404);
    });
  });

  // ─── Get Field Reports for Application ─────────────────────────────────────────

  describe('GET /api/field-verification/application/:applicationId/reports', () => {
    it('officer should see all field reports for an application', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/field-verification/application/${applicationId}/reports`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const report = res.body[0];
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('siteId');
      expect(report).toHaveProperty('overallScore');
      expect(report).toHaveProperty('recommendation');
      expect(report).toHaveProperty('observations');
      expect(report).toHaveProperty('submittedAt');
      expect(report).toHaveProperty('site');
      expect(report.site).toHaveProperty('siteName');
    });

    it('OEM cannot access field reports (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/field-verification/application/${applicationId}/reports`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });
  });
});
