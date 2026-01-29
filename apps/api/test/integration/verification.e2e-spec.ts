import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Verification (e2e)', () => {
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
        email: 'oem-verify@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Applicant',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Verify Test Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACV1234F1ZK',
        panNo: 'AAACV1234F',
        contactNo: '9876543210',
        fullAddress: '123 Industrial Area, Phase II',
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

    // Create a SUBMITTED application
    const application = await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-5001',
        applicantId: oemUserId,
        oemProfileId: profileId,
        status: 'SUBMITTED',
        currentStep: 9,
        submittedAt: new Date(),
      },
    });
    applicationId = application.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-verify@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Reviewer',
        isActive: true,
        isVerified: true,
      },
    });
    officerUserId = officerUser.id;

    // Login both users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-verify@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-verify@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Raise Query ─────────────────────────────────────────────────────────────

  describe('POST /api/verification/application/:id/query', () => {
    let queryId: string;

    it('should raise a query and transition application to QUERIED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/verification/application/${applicationId}/query`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          subject: 'Missing GST Document',
          description: 'Please upload your GST certificate',
          documentType: 'GST_CERTIFICATE',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.subject).toBe('Missing GST Document');
      expect(res.body.status).toBe('OPEN');
      expect(res.body.applicationId).toBe(applicationId);
      queryId = res.body.id;

      // Verify application status transitioned to QUERIED
      const updatedApp = await prisma.application.findUnique({
        where: { id: applicationId },
      });
      expect(updatedApp!.status).toBe('QUERIED');
    });

    it('OEM should respond to the query and query status becomes RESPONDED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/verification/query/${queryId}/respond`)
        .set('Authorization', `Bearer ${oemToken}`)
        .send({
          message: 'Here is the updated GST certificate',
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);

      // Verify query status is RESPONDED
      const updatedQuery = await prisma.query.findUnique({
        where: { id: queryId },
      });
      expect(updatedQuery!.status).toBe('RESPONDED');
    });

    it('when all queries are responded, application auto-transitions to RESUBMITTED', async () => {
      // The single query was just responded to above, so no OPEN queries remain
      const updatedApp = await prisma.application.findUnique({
        where: { id: applicationId },
      });
      expect(updatedApp!.status).toBe('RESUBMITTED');
    });

    it('officer should resolve the query and status becomes RESOLVED', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/verification/query/${queryId}/resolve`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ remarks: 'GST document verified' })
        .expect(200);

      expect(res.body.status).toBe('RESOLVED');
    });
  });

  // ─── Forward to Committee ────────────────────────────────────────────────────

  describe('POST /api/verification/application/:id/forward-to-committee', () => {
    it('should forward application to committee review', async () => {
      // Set application to UNDER_REVIEW (a valid status for forwarding)
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: 'UNDER_REVIEW' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/verification/application/${applicationId}/forward-to-committee`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ remarks: 'Documents verified, forwarding to committee' })
        .expect(201);

      expect(res.body.status).toBe('COMMITTEE_REVIEW');
    });
  });

  // ─── Forward to Field Verification ───────────────────────────────────────────

  describe('POST /api/verification/application/:id/forward-to-field-verification', () => {
    it('should forward application to field verification', async () => {
      // Set application back to UNDER_REVIEW for this test
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: 'UNDER_REVIEW' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/verification/application/${applicationId}/forward-to-field-verification`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ remarks: 'Needs field verification' })
        .expect(201);

      expect(res.body.status).toBe('FIELD_VERIFICATION');
    });
  });

  // ─── Get Queries ─────────────────────────────────────────────────────────────

  describe('GET /api/verification/application/:id/queries', () => {
    it('should return all queries for the application', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/verification/application/${applicationId}/queries`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const query = res.body[0];
      expect(query).toHaveProperty('id');
      expect(query).toHaveProperty('subject');
      expect(query).toHaveProperty('status');
      expect(query).toHaveProperty('raisedBy');
      expect(query).toHaveProperty('responses');
    });
  });

  // ─── OEM Pending Queries ─────────────────────────────────────────────────────

  describe('GET /api/verification/my-pending-queries', () => {
    it('OEM should get pending (OPEN) queries', async () => {
      // Create a new OPEN query so this test has something to find
      await prisma.query.create({
        data: {
          applicationId,
          raisedById: officerUserId,
          subject: 'Second Query',
          description: 'Need additional documents',
          status: 'OPEN',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/verification/my-pending-queries')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const pendingQuery = res.body.find((q: any) => q.subject === 'Second Query');
      expect(pendingQuery).toBeDefined();
      expect(pendingQuery.status).toBe('OPEN');
      expect(pendingQuery).toHaveProperty('application');
      expect(pendingQuery.application.applicationNumber).toBe('APCD-2025-5001');
    });
  });
});
