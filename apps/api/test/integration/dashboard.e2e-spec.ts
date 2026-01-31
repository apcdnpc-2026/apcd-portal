import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens indexed by role name
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  const password = 'Str0ng@Pass!';

  const roleUsers = [
    { role: 'OEM', email: 'oem-dash@test.com', firstName: 'OEM', lastName: 'Dashboard' },
    { role: 'OFFICER', email: 'officer-dash@test.com', firstName: 'Officer', lastName: 'Dashboard' },
    { role: 'ADMIN', email: 'admin-dash@test.com', firstName: 'Admin', lastName: 'Dashboard' },
    { role: 'COMMITTEE', email: 'committee-dash@test.com', firstName: 'Committee', lastName: 'Dashboard' },
    {
      role: 'FIELD_VERIFIER',
      email: 'verifier-dash@test.com',
      firstName: 'Field',
      lastName: 'Dashboard',
    },
    {
      role: 'DEALING_HAND',
      email: 'dealing-dash@test.com',
      firstName: 'Dealing',
      lastName: 'Dashboard',
    },
  ];

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    await cleanDatabase(prisma);

    const passwordHash = await bcrypt.hash(password, 12);

    // Create users for each role directly via Prisma
    for (const u of roleUsers) {
      const created = await prisma.user.create({
        data: {
          email: u.email,
          passwordHash,
          role: u.role as any,
          firstName: u.firstName,
          lastName: u.lastName,
          isActive: true,
          isVerified: true,
        },
      });
      userIds[u.role] = created.id;
    }

    // Create OEM profile and sample application data for dashboard stats
    const profile = await prisma.oemProfile.create({
      data: {
        userId: userIds.OEM,
        companyName: 'Dashboard Test Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACD1234F1ZK',
        panNo: 'AAACD1234F',
        contactNo: '9876543210',
        fullAddress: '400 Dashboard Road',
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

    // Create applications in various statuses for dashboard aggregation
    await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-3001',
        applicantId: userIds.OEM,
        oemProfileId: profile.id,
        status: 'DRAFT',
        currentStep: 2,
      },
    });

    await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-3002',
        applicantId: userIds.OEM,
        oemProfileId: profile.id,
        status: 'SUBMITTED',
        currentStep: 9,
        submittedAt: new Date(),
      },
    });

    await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-3003',
        applicantId: userIds.OEM,
        oemProfileId: profile.id,
        status: 'UNDER_REVIEW',
        currentStep: 9,
        submittedAt: new Date(),
        assignedOfficerId: userIds.OFFICER,
      },
    });

    // Login each user and store access tokens
    for (const u of roleUsers) {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: u.email, password });

      tokens[u.role] = loginRes.body.accessToken;
    }
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── OEM Dashboard ──────────────────────────────────────────────────────────

  describe('GET /api/dashboard/oem', () => {
    it('should return OEM dashboard with correct data shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/oem')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(200);

      expect(res.body).toHaveProperty('applications');
      expect(res.body).toHaveProperty('profile');
      expect(res.body).toHaveProperty('notifications');

      // Applications should include counts or list
      expect(res.body.applications).toBeDefined();
    });

    it('OEM cannot access officer dashboard (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/officer')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(403);
    });

    it('OEM cannot access admin dashboard (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(403);
    });
  });

  // ─── Officer Dashboard ──────────────────────────────────────────────────────

  describe('GET /api/dashboard/officer', () => {
    it('should return Officer dashboard with correct data shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/officer')
        .set('Authorization', `Bearer ${tokens.OFFICER}`)
        .expect(200);

      expect(res.body).toHaveProperty('pendingReview');
      expect(res.body).toHaveProperty('recentApplications');
      expect(res.body).toHaveProperty('stats');

      // Stats should include counts
      expect(res.body.stats).toBeDefined();
    });

    it('OFFICER cannot access OEM dashboard (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/oem')
        .set('Authorization', `Bearer ${tokens.OFFICER}`)
        .expect(403);
    });
  });

  // ─── Admin Dashboard ──────────────────────────────────────────────────────────

  describe('GET /api/dashboard/admin', () => {
    it('should return Admin dashboard with correct data shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .expect(200);

      expect(res.body).toHaveProperty('systemStats');
      expect(res.body).toHaveProperty('userStats');
      expect(res.body).toHaveProperty('applicationStats');
      expect(res.body).toHaveProperty('recentActivity');

      // System stats should include relevant counts
      expect(res.body.systemStats).toBeDefined();
      expect(res.body.userStats).toBeDefined();
    });

    it('ADMIN should see aggregated application counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .expect(200);

      expect(res.body.applicationStats).toHaveProperty('total');
      expect(res.body.applicationStats.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Field Verifier Dashboard ──────────────────────────────────────────────

  describe('GET /api/dashboard/field-verifier', () => {
    it('should return Field Verifier dashboard with correct data shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/field-verifier')
        .set('Authorization', `Bearer ${tokens.FIELD_VERIFIER}`)
        .expect(200);

      expect(res.body).toHaveProperty('assignedSites');
      expect(res.body).toHaveProperty('pendingReports');
      expect(res.body).toHaveProperty('completedReports');
    });

    it('FIELD_VERIFIER cannot access admin dashboard (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.FIELD_VERIFIER}`)
        .expect(403);
    });
  });

  // ─── Committee Dashboard ──────────────────────────────────────────────────────

  describe('GET /api/dashboard/committee', () => {
    it('should return Committee dashboard with correct data shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/committee')
        .set('Authorization', `Bearer ${tokens.COMMITTEE}`)
        .expect(200);

      expect(res.body).toHaveProperty('pendingEvaluations');
      expect(res.body).toHaveProperty('completedEvaluations');
      expect(res.body).toHaveProperty('stats');
    });

    it('COMMITTEE cannot access officer dashboard (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/officer')
        .set('Authorization', `Bearer ${tokens.COMMITTEE}`)
        .expect(403);
    });
  });

  // ─── Dealing Hand Dashboard ────────────────────────────────────────────────

  describe('GET /api/dashboard/dealing-hand', () => {
    it('should return Dealing Hand dashboard with correct data shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/dealing-hand')
        .set('Authorization', `Bearer ${tokens.DEALING_HAND}`)
        .expect(200);

      expect(res.body).toHaveProperty('assignedApplications');
      expect(res.body).toHaveProperty('pendingActions');
      expect(res.body).toHaveProperty('stats');
    });

    it('DEALING_HAND cannot access admin dashboard (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.DEALING_HAND}`)
        .expect(403);
    });
  });

  // ─── Unauthenticated Access ─────────────────────────────────────────────────

  describe('Unauthenticated dashboard access', () => {
    it('should return 401 for OEM dashboard without token', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/oem')
        .expect(401);
    });

    it('should return 401 for admin dashboard without token', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .expect(401);
    });
  });
});
