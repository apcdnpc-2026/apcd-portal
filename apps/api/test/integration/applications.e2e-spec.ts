import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Applications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemToken: string;
  let oemUserId: string;
  let officerToken: string;
  // officerUserId kept for potential future use
  let profileId: string;

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
        email: 'oem-apps@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Applicant',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile directly via Prisma
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Test APCD Corp',
        firmType: 'PRIVATE_LIMITED',
        gstNumber: '07AAACG1234F1ZK',
        panNumber: 'AAACG1234F',
        contactEmail: 'oem-apps@test.com',
        contactPhone: '9876543210',
        firmSize: 'LARGE',
        totalArea: '5000 sqft',
        totalEmployees: 50,
        fullAddress: '123 Industrial Area, Phase II',
        state: 'Delhi',
        country: 'India',
        pinCode: '110001',
        gpsLat: 28.6139,
        gpsLng: 77.209,
        isMSE: false,
        isStartup: false,
        isLocalSupplier: false,
      },
    });
    profileId = profile.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-apps@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Reviewer',
        isActive: true,
        isVerified: true,
      },
    });
    void officerUser.id;

    // Login both users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-apps@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-apps@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Create Application ────────────────────────────────────────────────────

  describe('POST /api/applications', () => {
    afterEach(async () => {
      // Clean up applications between tests in this block
      await prisma.applicationStatusHistory.deleteMany();
      await prisma.applicationApcd.deleteMany();
      await prisma.contactPerson.deleteMany();
      await prisma.application.deleteMany();
    });

    it('should create a new draft application', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('applicationNumber');
      expect(res.body.applicationNumber).toMatch(/^APCD-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.applicantId).toBe(oemUserId);
      expect(res.body.oemProfileId).toBe(profileId);
      expect(res.body.currentStep).toBe(1);

      expect(res.body.id).toBeDefined();
    });

    it('should return existing draft instead of creating a duplicate', async () => {
      // First call creates the draft
      const first = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(201);

      // Second call returns the same draft
      const second = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.applicationNumber).toBe(first.body.applicationNumber);
    });
  });

  // ─── Get Application ──────────────────────────────────────────────────────

  describe('GET /api/applications/:id', () => {
    let appId: string;

    beforeAll(async () => {
      await prisma.applicationStatusHistory.deleteMany();
      await prisma.applicationApcd.deleteMany();
      await prisma.contactPerson.deleteMany();
      await prisma.application.deleteMany();

      const createRes = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`);
      appId = createRes.body.id;
    });

    it('should return full application details for the owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body.id).toBe(appId);
      expect(res.body).toHaveProperty('oemProfile');
      expect(res.body).toHaveProperty('contactPersons');
      expect(res.body).toHaveProperty('applicationApcds');
      expect(res.body).toHaveProperty('attachments');
      expect(res.body).toHaveProperty('statusHistory');
    });

    it('should return 404 for a nonexistent application', async () => {
      await request(app.getHttpServer())
        .get('/api/applications/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(404);
    });
  });

  // ─── Update Application ────────────────────────────────────────────────────

  describe('PUT /api/applications/:id', () => {
    let appId: string;

    beforeAll(async () => {
      await prisma.applicationStatusHistory.deleteMany();
      await prisma.applicationApcd.deleteMany();
      await prisma.contactPerson.deleteMany();
      await prisma.application.deleteMany();

      const createRes = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`);
      appId = createRes.body.id;
    });

    it('should update draft application fields', async () => {
      const updatePayload = {
        currentStep: 3,
        turnoverYear1: 5000000,
        turnoverYear2: 6000000,
        turnoverYear3: 7500000,
        hasISO9001: true,
        hasISO14001: false,
        hasISO45001: false,
      };

      const res = await request(app.getHttpServer())
        .put(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .send(updatePayload)
        .expect(200);

      expect(res.body.turnoverYear1).toBe(5000000);
      expect(res.body.turnoverYear2).toBe(6000000);
      expect(res.body.turnoverYear3).toBe(7500000);
      expect(res.body.hasISO9001).toBe(true);
      expect(res.body.currentStep).toBe(3);
    });

    it('should update contact persons', async () => {
      const updatePayload = {
        contactPersons: [
          {
            type: 'COMMERCIAL',
            name: 'Rajesh Kumar',
            designation: 'Sales Head',
            mobileNo: '9876543210',
            email: 'rajesh@testcorp.com',
          },
          {
            type: 'TECHNICAL',
            name: 'Suresh Patel',
            designation: 'CTO',
            mobileNo: '9876543211',
            email: 'suresh@testcorp.com',
          },
        ],
      };

      await request(app.getHttpServer())
        .put(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .send(updatePayload)
        .expect(200);

      // Verify contact persons were created
      const contacts = await prisma.contactPerson.findMany({
        where: { applicationId: appId },
      });
      expect(contacts).toHaveLength(2);
      expect(contacts.map((c) => c.type)).toEqual(
        expect.arrayContaining(['COMMERCIAL', 'TECHNICAL']),
      );
    });
  });

  // ─── Submit Application ────────────────────────────────────────────────────

  describe('POST /api/applications/:id/submit', () => {
    let appId: string;

    beforeAll(async () => {
      await prisma.applicationStatusHistory.deleteMany();
      await prisma.applicationApcd.deleteMany();
      await prisma.contactPerson.deleteMany();
      await prisma.application.deleteMany();

      const createRes = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`);
      appId = createRes.body.id;
    });

    it('should return 400 when application is incomplete', async () => {
      // Application has no documents, no APCD selections, incomplete fields
      const res = await request(app.getHttpServer())
        .post(`/api/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(400);

      expect(res.body.message).toMatch(/incomplete/i);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  // ─── Withdraw Application ─────────────────────────────────────────────────

  describe('POST /api/applications/:id/withdraw', () => {
    let appId: string;

    beforeAll(async () => {
      await prisma.applicationStatusHistory.deleteMany();
      await prisma.applicationApcd.deleteMany();
      await prisma.contactPerson.deleteMany();
      await prisma.application.deleteMany();

      const createRes = await request(app.getHttpServer())
        .post('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`);
      appId = createRes.body.id;
    });

    it('should transition a draft application to WITHDRAWN', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/applications/${appId}/withdraw`)
        .set('Authorization', `Bearer ${oemToken}`)
        .send({ reason: 'Changed plans' })
        .expect(200);

      expect(res.body.status).toBe('WITHDRAWN');
    });

    it('should record the status transition in history', async () => {
      const history = await prisma.applicationStatusHistory.findMany({
        where: { applicationId: appId },
        orderBy: { createdAt: 'desc' },
      });

      expect(history.length).toBeGreaterThanOrEqual(1);

      const latestEntry = history[0];
      expect(latestEntry.fromStatus).toBe('DRAFT');
      expect(latestEntry.toStatus).toBe('WITHDRAWN');
      expect(latestEntry.changedBy).toBe(oemUserId);
    });

    it('should not allow withdrawing an already withdrawn application', async () => {
      await request(app.getHttpServer())
        .post(`/api/applications/${appId}/withdraw`)
        .set('Authorization', `Bearer ${oemToken}`)
        .send({ reason: 'Trying again' })
        .expect(400);
    });
  });

  // ─── List Applications ────────────────────────────────────────────────────

  describe('GET /api/applications', () => {
    beforeAll(async () => {
      await prisma.applicationStatusHistory.deleteMany();
      await prisma.applicationApcd.deleteMany();
      await prisma.contactPerson.deleteMany();
      await prisma.application.deleteMany();

      // Create two applications: one DRAFT, one SUBMITTED
      await prisma.application.create({
        data: {
          applicationNumber: 'APCD-2025-9001',
          applicantId: oemUserId,
          oemProfileId: profileId,
          status: 'DRAFT',
          currentStep: 1,
        },
      });

      await prisma.application.create({
        data: {
          applicationNumber: 'APCD-2025-9002',
          applicantId: oemUserId,
          oemProfileId: profileId,
          status: 'SUBMITTED',
          currentStep: 9,
          submittedAt: new Date(),
        },
      });
    });

    it('OEM sees all their own applications (including drafts)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/applications')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.data.length).toBe(2);

      // Both should belong to the OEM
      for (const app of res.body.data) {
        expect(app.applicantId).toBe(oemUserId);
      }
    });

    it('Officer sees only non-draft applications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/applications')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      // Officer should not see DRAFT applications
      for (const application of res.body.data) {
        expect(application.status).not.toBe('DRAFT');
      }
    });
  });
});
