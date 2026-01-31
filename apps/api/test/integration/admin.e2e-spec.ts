import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let adminUserId: string;
  let oemToken: string;
  let oemUserId: string;
  let officerToken: string;
  let officerUserId: string;

  const password = 'Str0ng@Pass!';

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    await cleanDatabase(prisma);

    const passwordHash = await bcrypt.hash(password, 12);

    // Create Admin user
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin-e2e@test.com',
        passwordHash,
        role: 'ADMIN',
        firstName: 'Admin',
        lastName: 'Tester',
        isActive: true,
        isVerified: true,
      },
    });
    adminUserId = adminUser.id;

    // Create OEM user (for authorization tests)
    const oemUser = await prisma.user.create({
      data: {
        email: 'oem-admin@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Restricted',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-admin@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Limited',
        isActive: true,
        isVerified: true,
      },
    });
    officerUserId = officerUser.id;

    // Create OEM profile and applications for stats
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Admin Test Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACX1234F1ZK',
        panNo: 'AAACX1234F',
        contactNo: '9876543210',
        fullAddress: '800 Admin Avenue',
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

    // Create sample applications in various statuses
    await prisma.application.createMany({
      data: [
        {
          applicationNumber: 'APCD-2025-1001',
          applicantId: oemUserId,
          oemProfileId: profile.id,
          status: 'DRAFT',
          currentStep: 1,
        },
        {
          applicationNumber: 'APCD-2025-1002',
          applicantId: oemUserId,
          oemProfileId: profile.id,
          status: 'SUBMITTED',
          currentStep: 9,
          submittedAt: new Date(),
        },
        {
          applicationNumber: 'APCD-2025-1003',
          applicantId: oemUserId,
          oemProfileId: profile.id,
          status: 'APPROVED',
          currentStep: 9,
          submittedAt: new Date(),
          approvedAt: new Date(),
        },
      ],
    });

    // Login all users
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin-e2e@test.com', password });
    adminToken = adminLogin.body.accessToken;

    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-admin@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-admin@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Get Users ────────────────────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('ADMIN should get a list of all users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Response may be paginated or a flat array
      const users = res.body.data || res.body;
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThanOrEqual(3);

      // Each user should have expected properties
      for (const user of users) {
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('role');
        expect(user).toHaveProperty('firstName');
        expect(user).toHaveProperty('lastName');
        expect(user).toHaveProperty('isActive');
        // Password hash must never be exposed
        expect(user).not.toHaveProperty('passwordHash');
      }

      // Verify all three roles are represented
      const roles = users.map((u: any) => u.role);
      expect(roles).toContain('ADMIN');
      expect(roles).toContain('OEM');
      expect(roles).toContain('OFFICER');
    });

    it('OEM cannot access GET /api/admin/users (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });

    it('OFFICER cannot access GET /api/admin/users (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users')
        .expect(401);
    });
  });

  // ─── Fee Configuration ────────────────────────────────────────────────────────

  describe('GET /api/admin/fees', () => {
    it('ADMIN should get fee configuration', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/fees')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body).toHaveProperty('applicationFee');
      expect(res.body).toHaveProperty('empanelmentFee');
      expect(res.body).toHaveProperty('gstRate');

      // Verify known fee values
      expect(res.body.applicationFee).toBe(25000);
      expect(res.body.gstRate).toBe(18);
    });

    it('OEM cannot access GET /api/admin/fees (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/fees')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });
  });

  describe('PUT /api/admin/fees', () => {
    it('ADMIN should update fee configuration', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/admin/fees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          applicationFee: 30000,
          empanelmentFee: 70000,
          gstRate: 18,
        })
        .expect(200);

      expect(res.body.applicationFee).toBe(30000);
      expect(res.body.empanelmentFee).toBe(70000);
      expect(res.body.gstRate).toBe(18);
    });

    it('OEM cannot update fee configuration (403)', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/fees')
        .set('Authorization', `Bearer ${oemToken}`)
        .send({ applicationFee: 10000 })
        .expect(403);
    });

    // Restore original fees
    afterAll(async () => {
      await request(app.getHttpServer())
        .put('/api/admin/fees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          applicationFee: 25000,
          empanelmentFee: 65000,
          gstRate: 18,
        });
    });
  });

  // ─── System Stats ──────────────────────────────────────────────────────────────

  describe('GET /api/admin/stats', () => {
    it('ADMIN should get system statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('totalApplications');
      expect(res.body).toHaveProperty('applicationsByStatus');
      expect(res.body).toHaveProperty('totalPayments');
      expect(res.body).toHaveProperty('totalCertificates');

      // Verify counts match seeded data
      expect(res.body.totalUsers).toBeGreaterThanOrEqual(3);
      expect(res.body.totalApplications).toBeGreaterThanOrEqual(3);

      // applicationsByStatus should be an object with status keys
      expect(res.body.applicationsByStatus).toBeDefined();
      expect(res.body.applicationsByStatus).toHaveProperty('DRAFT');
      expect(res.body.applicationsByStatus).toHaveProperty('SUBMITTED');
      expect(res.body.applicationsByStatus).toHaveProperty('APPROVED');
    });

    it('OEM cannot access system stats (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });

    it('OFFICER cannot access system stats (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });
  });

  // ─── MIS Report ────────────────────────────────────────────────────────────────

  describe('GET /api/admin/reports/mis', () => {
    it('ADMIN should get MIS report data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/reports/mis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body).toHaveProperty('reportDate');
      expect(res.body).toHaveProperty('applicationSummary');
      expect(res.body).toHaveProperty('paymentSummary');
      expect(res.body).toHaveProperty('userSummary');

      // Application summary should have breakdowns
      expect(res.body.applicationSummary).toHaveProperty('total');
      expect(res.body.applicationSummary).toHaveProperty('byStatus');
      expect(res.body.applicationSummary.total).toBeGreaterThanOrEqual(3);

      // User summary
      expect(res.body.userSummary).toHaveProperty('totalUsers');
      expect(res.body.userSummary).toHaveProperty('byRole');
    });

    it('ADMIN should get MIS report with date filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/reports/mis')
        .query({ startDate: '2025-01-01', endDate: '2025-12-31' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('reportDate');
      expect(res.body).toHaveProperty('applicationSummary');
    });

    it('OEM cannot access MIS report (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reports/mis')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });

    it('OFFICER cannot access MIS report (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reports/mis')
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/reports/mis')
        .expect(401);
    });
  });

  // ─── Audit Log ─────────────────────────────────────────────────────────────────

  describe('GET /api/admin/audit-logs', () => {
    it('ADMIN should access audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const logs = res.body.data || res.body;
      expect(Array.isArray(logs)).toBe(true);

      // If there are audit logs, verify shape
      if (logs.length > 0) {
        const log = logs[0];
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('userId');
        expect(log).toHaveProperty('createdAt');
      }
    });

    it('OEM cannot access audit logs (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(403);
    });
  });
});
