import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Attachments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemToken: string;
  let oemUserId: string;
  let officerToken: string;
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
        email: 'oem-attach@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Uploader',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Attachment Test Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACA1234F1ZK',
        panNo: 'AAACA1234F',
        contactNo: '9876543210',
        fullAddress: '500 Upload Street',
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

    // Create a DRAFT application
    const application = await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-8001',
        applicantId: oemUserId,
        oemProfileId: profileId,
        status: 'DRAFT',
        currentStep: 5,
      },
    });
    applicationId = application.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-attach@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Viewer',
        isActive: true,
        isVerified: true,
      },
    });
    void officerUser.id;

    // Login both users
    const oemLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'oem-attach@test.com', password });
    oemToken = oemLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-attach@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Upload PDF ──────────────────────────────────────────────────────────────

  describe('POST /api/attachments/upload', () => {
    let uploadedAttachmentId: string;

    it('should upload a PDF document via multipart form data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/attachments/upload')
        .set('Authorization', `Bearer ${oemToken}`)
        .field('applicationId', applicationId)
        .field('documentType', 'GST_CERTIFICATE')
        .field('description', 'GST Registration Certificate')
        .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), {
          filename: 'gst-certificate.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.applicationId).toBe(applicationId);
      expect(res.body.documentType).toBe('GST_CERTIFICATE');
      expect(res.body.originalName).toBe('gst-certificate.pdf');
      expect(res.body.mimeType).toBe('application/pdf');
      expect(res.body).toHaveProperty('filePath');
      expect(res.body).toHaveProperty('fileSize');

      uploadedAttachmentId = res.body.id;
    });

    it('should upload an image file', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/attachments/upload')
        .set('Authorization', `Bearer ${oemToken}`)
        .field('applicationId', applicationId)
        .field('documentType', 'FACTORY_PHOTO')
        .field('description', 'Factory front view')
        .attach('file', Buffer.from('fake-png-content'), {
          filename: 'factory-front.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.documentType).toBe('FACTORY_PHOTO');
      expect(res.body.originalName).toBe('factory-front.png');
      expect(res.body.mimeType).toBe('image/png');
    });

    it('should return 400 when no file is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/attachments/upload')
        .set('Authorization', `Bearer ${oemToken}`)
        .field('applicationId', applicationId)
        .field('documentType', 'PAN_CARD')
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/attachments/upload')
        .field('applicationId', applicationId)
        .field('documentType', 'GST_CERTIFICATE')
        .attach('file', Buffer.from('fake'), {
          filename: 'test.pdf',
          contentType: 'application/pdf',
        })
        .expect(401);
    });
  });

  // ─── Get Attachment List ──────────────────────────────────────────────────────

  describe('GET /api/attachments/application/:applicationId', () => {
    it('should return all attachments for the application', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/attachments/application/${applicationId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      // Each attachment should have expected properties
      for (const attachment of res.body) {
        expect(attachment).toHaveProperty('id');
        expect(attachment).toHaveProperty('documentType');
        expect(attachment).toHaveProperty('originalName');
        expect(attachment).toHaveProperty('mimeType');
        expect(attachment).toHaveProperty('fileSize');
        expect(attachment).toHaveProperty('filePath');
        expect(attachment.applicationId).toBe(applicationId);
      }

      // Verify we find both the PDF and image uploads
      const documentTypes = res.body.map((a: any) => a.documentType);
      expect(documentTypes).toContain('GST_CERTIFICATE');
      expect(documentTypes).toContain('FACTORY_PHOTO');
    });

    it('officer should also be able to view attachments', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/attachments/application/${applicationId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for application with no attachments', async () => {
      // Create a clean application with no attachments
      const cleanApp = await prisma.application.create({
        data: {
          applicationNumber: 'APCD-2025-8099',
          applicantId: oemUserId,
          oemProfileId: profileId,
          status: 'DRAFT',
          currentStep: 1,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/attachments/application/${cleanApp.id}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  // ─── Download URL ─────────────────────────────────────────────────────────────

  describe('GET /api/attachments/:id/download', () => {
    let attachmentId: string;

    beforeAll(async () => {
      const attachment = await prisma.attachment.findFirst({
        where: { applicationId },
      });
      attachmentId = attachment!.id;
    });

    it('should return a download URL or file stream for the attachment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      // Response may be a redirect URL or direct file stream
      // If JSON, check for downloadUrl property
      if (res.headers['content-type']?.includes('application/json')) {
        expect(res.body).toHaveProperty('downloadUrl');
      }
      // Otherwise, the response is the file content itself (binary stream)
    });

    it('should return 404 for nonexistent attachment', async () => {
      await request(app.getHttpServer())
        .get('/api/attachments/00000000-0000-0000-0000-000000000000/download')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(404);
    });
  });

  // ─── Delete Attachment ────────────────────────────────────────────────────────

  describe('DELETE /api/attachments/:id', () => {
    let attachmentToDeleteId: string;

    beforeAll(async () => {
      // Create a specific attachment for deletion
      const attachment = await prisma.attachment.create({
        data: {
          applicationId,
          documentType: 'OTHER',
          originalName: 'to-delete.pdf',
          filePath: '/uploads/to-delete.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        },
      });
      attachmentToDeleteId = attachment.id;
    });

    it('should delete the attachment and return success', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/attachments/${attachmentToDeleteId}`)
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Verify attachment is deleted from database
      const deleted = await prisma.attachment.findUnique({
        where: { id: attachmentToDeleteId },
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 when deleting a nonexistent attachment', async () => {
      await request(app.getHttpServer())
        .delete('/api/attachments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${oemToken}`)
        .expect(404);
    });

    it('should return 401 without a token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/attachments/${attachmentToDeleteId}`)
        .expect(401);
    });
  });

  // ─── Verify Attachment ────────────────────────────────────────────────────────

  describe('PUT /api/attachments/:id/verify', () => {
    let attachmentToVerifyId: string;

    beforeAll(async () => {
      const attachment = await prisma.attachment.findFirst({
        where: { applicationId, documentType: 'GST_CERTIFICATE' },
      });
      attachmentToVerifyId = attachment!.id;
    });

    it('officer should verify an attachment', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/attachments/${attachmentToVerifyId}/verify`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          isVerified: true,
          remarks: 'GST document verified against GSTN portal',
        })
        .expect(200);

      expect(res.body.isVerified).toBe(true);
      expect(res.body).toHaveProperty('verifiedAt');
    });

    it('OEM cannot verify their own attachments (403)', async () => {
      await request(app.getHttpServer())
        .put(`/api/attachments/${attachmentToVerifyId}/verify`)
        .set('Authorization', `Bearer ${oemToken}`)
        .send({
          isVerified: true,
          remarks: 'Self-verification attempt',
        })
        .expect(403);
    });
  });
});
