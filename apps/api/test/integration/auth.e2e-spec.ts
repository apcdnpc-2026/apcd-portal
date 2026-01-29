import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const validUser = {
    email: 'oem-auth-test@example.com',
    password: 'Str0ng@Pass!',
    firstName: 'Auth',
    lastName: 'Tester',
    phone: '9876543210',
  };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  // ─── Registration ──────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('should register a new OEM user and return tokens + user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(res.body.user).toMatchObject({
        email: validUser.email.toLowerCase(),
        role: 'OEM',
        firstName: validUser.firstName,
        lastName: validUser.lastName,
      });
      expect(res.body.user).toHaveProperty('id');
      // password hash must never be exposed
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('should return 409 for duplicate email', async () => {
      // First registration
      await request(app.getHttpServer()).post('/api/auth/register').send(validUser).expect(201);

      // Duplicate registration
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser)
        .expect(409);

      expect(res.body.message).toMatch(/already registered/i);
    });

    it('should return 400 for invalid data (missing required fields)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'incomplete@test.com' })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should return 400 for weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          ...validUser,
          email: 'weakpass@test.com',
          password: 'short',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Seed a user for login tests
      await request(app.getHttpServer()).post('/api/auth/register').send(validUser);
    });

    it('should return 200 with tokens for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toMatchObject({
        email: validUser.email.toLowerCase(),
        role: 'OEM',
      });
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: validUser.email, password: 'Wr0ng@Pass!' })
        .expect(401);

      expect(res.body.message).toMatch(/invalid/i);
    });

    it('should return 401 for nonexistent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'Str0ng@Pass!' })
        .expect(401);

      expect(res.body.message).toMatch(/invalid/i);
    });
  });

  // ─── Me ────────────────────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('should return 200 with user data when authenticated', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser);

      const { accessToken } = registerRes.body;

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        email: validUser.email.toLowerCase(),
        role: 'OEM',
        firstName: validUser.firstName,
        lastName: validUser.lastName,
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('isVerified');
      expect(res.body).toHaveProperty('isActive');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });
  });

  // ─── Refresh ───────────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('should return 200 with new tokens for a valid refresh token', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser);

      const { refreshToken, user } = registerRes.body;

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken, userId: user.id })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      // New refresh token should differ from the old one (rotation)
      expect(res.body.refreshToken).not.toEqual(refreshToken);
    });
  });

  // ─── Logout ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('should return 200 and invalidate refresh tokens', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(validUser);

      const { accessToken, refreshToken, user } = registerRes.body;

      // Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(logoutRes.body.message).toMatch(/logged out/i);

      // Attempting to refresh with the revoked token should fail
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken, userId: user.id })
        .expect(401);
    });
  });
});
