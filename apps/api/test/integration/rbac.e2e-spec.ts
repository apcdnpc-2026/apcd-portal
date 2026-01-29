import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens indexed by role name
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  const password = 'Str0ng@Pass!';

  const roleUsers = [
    { role: 'OEM', email: 'oem-rbac@test.com', firstName: 'OEM', lastName: 'User' },
    { role: 'OFFICER', email: 'officer-rbac@test.com', firstName: 'Officer', lastName: 'User' },
    { role: 'ADMIN', email: 'admin-rbac@test.com', firstName: 'Admin', lastName: 'User' },
    {
      role: 'COMMITTEE',
      email: 'committee-rbac@test.com',
      firstName: 'Committee',
      lastName: 'User',
    },
    {
      role: 'FIELD_VERIFIER',
      email: 'verifier-rbac@test.com',
      firstName: 'Field',
      lastName: 'Verifier',
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

  // ─── Admin Endpoints ──────────────────────────────────────────────────────

  describe('Admin endpoints', () => {
    it('OEM cannot access GET /api/admin/users (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(403);
    });

    it('OFFICER cannot access POST /api/admin/users (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${tokens.OFFICER}`)
        .send({
          email: 'newuser@test.com',
          password: 'Str0ng@Pass!',
          firstName: 'New',
          lastName: 'User',
          role: 'OEM',
        })
        .expect(403);
    });

    it('FIELD_VERIFIER cannot access GET /api/admin/users (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${tokens.FIELD_VERIFIER}`)
        .expect(403);
    });

    it('ADMIN can access GET /api/admin/users (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .expect(200);

      // Should return an array or paginated response with user data
      expect(res.body).toBeDefined();
    });

    it('ADMIN can access GET /api/admin/fees (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/fees')
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  // ─── Verification Endpoints ────────────────────────────────────────────────

  describe('Verification endpoints', () => {
    it('OEM cannot access GET /api/verification/pending (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/verification/pending')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(403);
    });

    it('OFFICER can access GET /api/verification/pending (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/verification/pending')
        .set('Authorization', `Bearer ${tokens.OFFICER}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Committee Endpoints ───────────────────────────────────────────────────

  describe('Committee endpoints', () => {
    it('COMMITTEE can access GET /api/committee/pending (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/committee/pending')
        .set('Authorization', `Bearer ${tokens.COMMITTEE}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('COMMITTEE cannot access POST /api/payments/razorpay/create-order (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/payments/razorpay/create-order')
        .set('Authorization', `Bearer ${tokens.COMMITTEE}`)
        .send({
          applicationId: '00000000-0000-0000-0000-000000000000',
          paymentType: 'APPLICATION_FEE',
          amount: 25000,
        })
        .expect(403);
    });
  });

  // ─── Public Endpoints ──────────────────────────────────────────────────────

  describe('Public endpoints', () => {
    it('POST /api/auth/login is accessible without auth', async () => {
      // Even though credentials are wrong, we should get 401 (not 403)
      // confirming the endpoint itself is public
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'Str0ng@Pass!' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid/i);
    });

    it('POST /api/auth/register is accessible without auth', async () => {
      // Using a duplicate email to get a 409, proving the endpoint is reachable
      const res = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'oem-rbac@test.com',
        password: 'Str0ng@Pass!',
        firstName: 'Dup',
        lastName: 'Test',
      });

      // Should get 409 (conflict), not 401/403
      expect(res.status).toBe(409);
    });

    it('GET /api/auth/me returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });
  });

  // ─── Dashboard Endpoints (role-specific) ───────────────────────────────────

  describe('Dashboard endpoints per role', () => {
    it('OEM can access GET /api/dashboard/oem', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/oem')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(200);
    });

    it('OFFICER can access GET /api/dashboard/officer', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/officer')
        .set('Authorization', `Bearer ${tokens.OFFICER}`)
        .expect(200);
    });

    it('ADMIN can access GET /api/dashboard/admin', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .expect(200);
    });

    it('COMMITTEE can access GET /api/dashboard/committee', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/committee')
        .set('Authorization', `Bearer ${tokens.COMMITTEE}`)
        .expect(200);
    });

    it('FIELD_VERIFIER can access GET /api/dashboard/field-verifier', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/field-verifier')
        .set('Authorization', `Bearer ${tokens.FIELD_VERIFIER}`)
        .expect(200);
    });

    it('OEM cannot access GET /api/dashboard/admin (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${tokens.OEM}`)
        .expect(403);
    });
  });
});
