import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Certificates (e2e)', () => {
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
        email: 'oem-cert@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Certified',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Certificate Test Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACC1234F1ZK',
        panNo: 'AAACC1234F',
        contactNo: '9876543210',
        fullAddress: '300 Certificate Avenue',
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

    // Create an APPROVED application
    const application = await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-4001',
        applicantId: oemUserId,
        oemProfileId: profileId,
        status: 'APPROVED',
        currentStep: 9,
        submittedAt: new Date(),
        approvedAt: new Date(),
      },
    });
    applicationId = application.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-cert@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Issuer',
        isActive: true,
        isVerified: true,
      },
    });
    officerUserId = officerUser.id;

    // Login both users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-cert@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-cert@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Generate Certificate ─────────────────────────────────────────────────────

  describe('POST /api/certificates/generate', () => {
    let certificateId: string;
    let certificateNumber: string;

    it('should generate a certificate for an approved application', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/generate')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          applicationId,
          certificateType: 'EMPANELMENT',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('certificateNumber');
      expect(res.body.certificateNumber).toMatch(/^NPC\/APCD\/\d{4}\/\d{5}$/);
      expect(res.body.applicationId).toBe(applicationId);
      expect(res.body.certificateType).toBe('EMPANELMENT');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body).toHaveProperty('issuedAt');
      expect(res.body).toHaveProperty('validFrom');
      expect(res.body).toHaveProperty('validUntil');
      expect(res.body).toHaveProperty('filePath');
      expect(res.body).toHaveProperty('qrCodeData');

      certificateId = res.body.id;
      certificateNumber = res.body.certificateNumber;
    });

    it('should return 400 for duplicate certificate generation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/generate')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          applicationId,
          certificateType: 'EMPANELMENT',
        })
        .expect(400);

      expect(res.body.message).toMatch(/already|exists/i);
    });

    it('OEM cannot generate certificates (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/certificates/generate')
        .set('Authorization', `Bearer ${oemToken}`)
        .send({
          applicationId,
          certificateType: 'EMPANELMENT',
        })
        .expect(403);
    });

    // ─── Get Certificate ──────────────────────────────────────────────────────

    describe('GET /api/certificates/:id', () => {
      it('should return certificate details for the OEM owner', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/certificates/${certificateId}`)
          .set('Authorization', `Bearer ${oemToken}`)
          .expect(200);

        expect(res.body.id).toBe(certificateId);
        expect(res.body.certificateNumber).toBe(certificateNumber);
        expect(res.body.status).toBe('ACTIVE');
        expect(res.body).toHaveProperty('application');
        expect(res.body).toHaveProperty('issuedAt');
        expect(res.body).toHaveProperty('validFrom');
        expect(res.body).toHaveProperty('validUntil');
      });

      it('officer should also be able to view the certificate', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/certificates/${certificateId}`)
          .set('Authorization', `Bearer ${officerToken}`)
          .expect(200);

        expect(res.body.id).toBe(certificateId);
      });

      it('should return 404 for nonexistent certificate', async () => {
        await request(app.getHttpServer())
          .get('/api/certificates/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${oemToken}`)
          .expect(404);
      });
    });

    // ─── Verify by Certificate Number (Public) ────────────────────────────────

    describe('GET /api/certificates/verify/:certificateNumber', () => {
      it('should verify a valid certificate by number (public endpoint)', async () => {
        const encodedNumber = encodeURIComponent(certificateNumber);

        const res = await request(app.getHttpServer())
          .get(`/api/certificates/verify/${encodedNumber}`)
          .expect(200);

        expect(res.body).toHaveProperty('isValid', true);
        expect(res.body).toHaveProperty('certificate');
        expect(res.body.certificate.certificateNumber).toBe(certificateNumber);
        expect(res.body.certificate.status).toBe('ACTIVE');
        expect(res.body.certificate).toHaveProperty('companyName');
        expect(res.body.certificate).toHaveProperty('validFrom');
        expect(res.body.certificate).toHaveProperty('validUntil');
      });

      it('should return isValid=false for nonexistent certificate number', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/certificates/verify/NPC%2FAPCD%2F2025%2F99999')
          .expect(200);

        expect(res.body).toHaveProperty('isValid', false);
        expect(res.body.certificate).toBeNull();
      });
    });

    // ─── Get Empaneled OEMs ──────────────────────────────────────────────────

    describe('GET /api/certificates/empaneled', () => {
      it('should return list of empaneled OEMs (public endpoint)', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/certificates/empaneled')
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);

        const empaneledOem = res.body.find(
          (o: any) => o.companyName === 'Certificate Test Corp',
        );
        expect(empaneledOem).toBeDefined();
        expect(empaneledOem).toHaveProperty('certificateNumber');
        expect(empaneledOem).toHaveProperty('validFrom');
        expect(empaneledOem).toHaveProperty('validUntil');
        expect(empaneledOem).toHaveProperty('status', 'ACTIVE');
      });
    });
  });

  // ─── OEM's Own Certificates ────────────────────────────────────────────────────

  describe('GET /api/certificates/my-certificates', () => {
    it('OEM should see their own certificates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/certificates/my-certificates')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const cert = res.body[0];
      expect(cert).toHaveProperty('id');
      expect(cert).toHaveProperty('certificateNumber');
      expect(cert).toHaveProperty('status');
      expect(cert).toHaveProperty('issuedAt');
      expect(cert).toHaveProperty('validUntil');
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/certificates/my-certificates')
        .expect(401);
    });
  });
});
