import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('OEM Profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemToken: string;
  let oemUserId: string;
  let secondOemToken: string;
  let secondOemUserId: string;

  const password = 'Str0ng@Pass!';

  const validProfile = {
    companyName: 'Profile Test Corp',
    firmType: 'PRIVATE_LIMITED',
    gstRegistrationNo: '07AAACP1234F1ZK',
    panNo: 'AAACP1234F',
    contactNo: '9876543210',
    fullAddress: '100 Industrial Estate, Sector 5',
    state: 'Delhi',
    country: 'India',
    pinCode: '110001',
    gpsLatitude: 28.6139,
    gpsLongitude: 77.209,
    isMSE: false,
    isStartup: false,
    isLocalSupplier: false,
  };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    await cleanDatabase(prisma);

    const passwordHash = await bcrypt.hash(password, 12);

    // Create first OEM user
    const oemUser = await prisma.user.create({
      data: {
        email: 'oem-profile@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Profile',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create second OEM user (for duplicate prevention tests)
    const secondOemUser = await prisma.user.create({
      data: {
        email: 'oem-profile-2@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Second',
        isActive: true,
        isVerified: true,
      },
    });
    secondOemUserId = secondOemUser.id;

    // Login both OEM users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-profile@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const secondOemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-profile-2@test.com', password });
    secondOemToken = secondOemLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Create Profile ──────────────────────────────────────────────────────────

  describe('POST /api/oem-profile', () => {
    afterEach(async () => {
      // Clean up profiles between tests in this block
      await prisma.oemProfile.deleteMany();
    });

    it('should create a new OEM profile for the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/oem-profile')
        .set('Authorization', `Bearer ${oemToken}`)
        .send(validProfile)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.userId).toBe(oemUserId);
      expect(res.body.companyName).toBe(validProfile.companyName);
      expect(res.body.firmType).toBe(validProfile.firmType);
      expect(res.body.gstRegistrationNo).toBe(validProfile.gstRegistrationNo);
      expect(res.body.panNo).toBe(validProfile.panNo);
      expect(res.body.contactNo).toBe(validProfile.contactNo);
      expect(res.body.state).toBe(validProfile.state);
      expect(res.body.pinCode).toBe(validProfile.pinCode);
      expect(res.body.isMSE).toBe(false);
      expect(res.body.isStartup).toBe(false);
      expect(res.body.isLocalSupplier).toBe(false);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/oem-profile')
        .set('Authorization', `Bearer ${oemToken}`)
        .send({ companyName: 'Incomplete Corp' })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/oem-profile')
        .send(validProfile)
        .expect(401);
    });

    it('should prevent duplicate profile creation for the same user', async () => {
      // First profile creation
      await request(app.getHttpServer())
        .post('/api/oem-profile')
        .set('Authorization', `Bearer ${oemToken}`)
        .send(validProfile)
        .expect(201);

      // Second profile creation for same user should fail
      const res = await request(app.getHttpServer())
        .post('/api/oem-profile')
        .set('Authorization', `Bearer ${oemToken}`)
        .send({
          ...validProfile,
          companyName: 'Another Corp',
          gstRegistrationNo: '07AAACP5678F1ZK',
          panNo: 'AAACP5678F',
        })
        .expect(409);

      expect(res.body.message).toMatch(/already exists|already has/i);
    });
  });

  // ─── Get Profile ──────────────────────────────────────────────────────────────

  describe('GET /api/oem-profile', () => {
    beforeAll(async () => {
      await prisma.oemProfile.deleteMany();

      // Create a profile for the first OEM user
      await prisma.oemProfile.create({
        data: {
          userId: oemUserId,
          ...validProfile,
        },
      });
    });

    it('should return the authenticated user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/oem-profile')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body.userId).toBe(oemUserId);
      expect(res.body.companyName).toBe(validProfile.companyName);
      expect(res.body.firmType).toBe(validProfile.firmType);
      expect(res.body.gstRegistrationNo).toBe(validProfile.gstRegistrationNo);
      expect(res.body.panNo).toBe(validProfile.panNo);
    });

    it('should return 404 when user has no profile', async () => {
      await request(app.getHttpServer())
        .get('/api/oem-profile')
        .set('Authorization', `Bearer ${secondOemToken}`)
        .expect(404);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/oem-profile')
        .expect(401);
    });
  });

  // ─── Update Profile ──────────────────────────────────────────────────────────

  describe('PUT /api/oem-profile', () => {
    beforeAll(async () => {
      await prisma.oemProfile.deleteMany();

      await prisma.oemProfile.create({
        data: {
          userId: oemUserId,
          ...validProfile,
        },
      });
    });

    it('should update the OEM profile fields', async () => {
      const updatePayload = {
        companyName: 'Updated Corp Pvt Ltd',
        contactNo: '9876543299',
        fullAddress: '200 Updated Industrial Area',
        isMSE: true,
      };

      const res = await request(app.getHttpServer())
        .put('/api/oem-profile')
        .set('Authorization', `Bearer ${oemToken}`)
        .send(updatePayload)
        .expect(200);

      expect(res.body.companyName).toBe('Updated Corp Pvt Ltd');
      expect(res.body.contactNo).toBe('9876543299');
      expect(res.body.fullAddress).toBe('200 Updated Industrial Area');
      expect(res.body.isMSE).toBe(true);
      // Unchanged fields should remain
      expect(res.body.firmType).toBe(validProfile.firmType);
      expect(res.body.panNo).toBe(validProfile.panNo);
    });

    it('should return 404 when user has no profile to update', async () => {
      await request(app.getHttpServer())
        .put('/api/oem-profile')
        .set('Authorization', `Bearer ${secondOemToken}`)
        .send({ companyName: 'No Profile Corp' })
        .expect(404);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .put('/api/oem-profile')
        .send({ companyName: 'Unauthenticated' })
        .expect(401);
    });
  });

  // ─── Get Profile by ID (Officer view) ─────────────────────────────────────────

  describe('GET /api/oem-profile/:id', () => {
    let profileId: string;

    beforeAll(async () => {
      const profile = await prisma.oemProfile.findFirst({
        where: { userId: oemUserId },
      });
      profileId = profile!.id;
    });

    it('should return profile by ID for the owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/oem-profile/${profileId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body.id).toBe(profileId);
      expect(res.body.userId).toBe(oemUserId);
    });

    it('should return 404 for a nonexistent profile ID', async () => {
      await request(app.getHttpServer())
        .get('/api/oem-profile/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(404);
    });
  });
});
