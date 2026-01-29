import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';

import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createTestApp, cleanDatabase } from '../helpers/test-app';

describe('Committee (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let oemUserId: string;
  let committeeToken: string;
  let committeeUserId: string;
  let officerToken: string;
  let officerUserId: string;
  let profileId: string;
  let applicationId: string;

  const password = 'Str0ng@Pass!';

  // Full set of 8 evaluation scores matching the EvaluationCriterion enum
  const evaluationScores = [
    { criterion: 'EXPERIENCE_SCOPE', score: 8, remarks: 'Strong experience' },
    { criterion: 'TECHNICAL_SPECIFICATION', score: 9, remarks: 'Excellent specs' },
    { criterion: 'TECHNICAL_TEAM', score: 7, remarks: 'Adequate team' },
    { criterion: 'FINANCIAL_STANDING', score: 8, remarks: 'Sound financials' },
    { criterion: 'LEGAL_QUALITY_COMPLIANCE', score: 9, remarks: 'Full compliance' },
    { criterion: 'COMPLAINT_HANDLING', score: 8, remarks: 'Good process' },
    { criterion: 'CLIENT_FEEDBACK', score: 9, remarks: 'Very positive feedback' },
    { criterion: 'GLOBAL_SUPPLY', score: 7, remarks: 'Some exports' },
  ];

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    await cleanDatabase(prisma);

    const passwordHash = await bcrypt.hash(password, 12);

    // Create OEM user
    const oemUser = await prisma.user.create({
      data: {
        email: 'oem-committee@test.com',
        passwordHash,
        role: 'OEM',
        firstName: 'OEM',
        lastName: 'Evaluated',
        isActive: true,
        isVerified: true,
      },
    });
    oemUserId = oemUser.id;

    // Create OEM profile
    const profile = await prisma.oemProfile.create({
      data: {
        userId: oemUserId,
        companyName: 'Committee Eval Corp',
        firmType: 'PRIVATE_LIMITED',
        gstRegistrationNo: '07AAACC9999F1ZK',
        panNo: 'AAACC9999F',
        contactNo: '9876543299',
        fullAddress: '789 Committee Lane',
        state: 'Delhi',
        country: 'India',
        pinCode: '110003',
        gpsLatitude: 28.6139,
        gpsLongitude: 77.209,
        isMSE: false,
        isStartup: false,
        isLocalSupplier: false,
      },
    });
    profileId = profile.id;

    // Create application in COMMITTEE_REVIEW status
    const application = await prisma.application.create({
      data: {
        applicationNumber: 'APCD-2025-7001',
        applicantId: oemUserId,
        oemProfileId: profileId,
        status: 'COMMITTEE_REVIEW',
        currentStep: 9,
        submittedAt: new Date(),
      },
    });
    applicationId = application.id;

    // Create Committee user
    const committeeUser = await prisma.user.create({
      data: {
        email: 'committee-eval@test.com',
        passwordHash,
        role: 'COMMITTEE',
        firstName: 'Committee',
        lastName: 'Member',
        isActive: true,
        isVerified: true,
      },
    });
    committeeUserId = committeeUser.id;

    // Create Officer user
    const officerUser = await prisma.user.create({
      data: {
        email: 'officer-committee@test.com',
        passwordHash,
        role: 'OFFICER',
        firstName: 'Officer',
        lastName: 'Finalizer',
        isActive: true,
        isVerified: true,
      },
    });
    officerUserId = officerUser.id;

    // Login committee and officer
    const committeeLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'committee-eval@test.com', password });
    committeeToken = committeeLogin.body.accessToken;

    const officerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'officer-committee@test.com', password });
    officerToken = officerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // ─── Evaluation Criteria ─────────────────────────────────────────────────────

  describe('GET /api/committee/criteria', () => {
    it('should return 8 evaluation criteria with scores', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/committee/criteria')
        .set('Authorization', `Bearer ${committeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('criteria');
      expect(res.body).toHaveProperty('minimumPassingScore');
      expect(res.body).toHaveProperty('totalMaxScore');

      expect(res.body.criteria).toHaveLength(8);
      expect(res.body.minimumPassingScore).toBe(60);
      expect(res.body.totalMaxScore).toBe(80);

      // Each criterion should have id, name, and maxScore
      for (const criterion of res.body.criteria) {
        expect(criterion).toHaveProperty('id');
        expect(criterion).toHaveProperty('name');
        expect(criterion).toHaveProperty('maxScore');
        expect(criterion.maxScore).toBe(10);
      }

      // Check specific criteria exist
      const criterionIds = res.body.criteria.map((c: any) => c.id);
      expect(criterionIds).toContain('EXPERIENCE_SCOPE');
      expect(criterionIds).toContain('TECHNICAL_SPECIFICATION');
      expect(criterionIds).toContain('GLOBAL_SUPPLY');
    });
  });

  // ─── Pending Applications ────────────────────────────────────────────────────

  describe('GET /api/committee/pending', () => {
    it('should return application in COMMITTEE_REVIEW status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/committee/pending')
        .set('Authorization', `Bearer ${committeeToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const pendingApp = res.body.find((a: any) => a.id === applicationId);
      expect(pendingApp).toBeDefined();
      expect(pendingApp.status).toBe('COMMITTEE_REVIEW');
      expect(pendingApp).toHaveProperty('applicant');
      expect(pendingApp).toHaveProperty('oemProfile');
      expect(pendingApp.oemProfile.companyName).toBe('Committee Eval Corp');
    });
  });

  // ─── Submit Evaluation ───────────────────────────────────────────────────────

  describe('POST /api/committee/application/:id/evaluate', () => {
    it('should submit evaluation with 8 scores and recommendation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/committee/application/${applicationId}/evaluate`)
        .set('Authorization', `Bearer ${committeeToken}`)
        .send({
          scores: evaluationScores,
          recommendation: 'APPROVE',
          overallRemarks: 'Application meets all criteria satisfactorily',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.applicationId).toBe(applicationId);
      expect(res.body.evaluatorId).toBe(committeeUserId);
      expect(res.body.recommendation).toBe('APPROVE');
      expect(res.body).toHaveProperty('scores');
      expect(res.body.scores).toHaveLength(8);
      expect(res.body).toHaveProperty('evaluator');
      expect(res.body.evaluator.firstName).toBe('Committee');
    });

    it('should return 400 for duplicate evaluation by same member', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/committee/application/${applicationId}/evaluate`)
        .set('Authorization', `Bearer ${committeeToken}`)
        .send({
          scores: evaluationScores,
          recommendation: 'APPROVE',
          overallRemarks: 'Trying again',
        })
        .expect(400);

      expect(res.body.message).toMatch(/already evaluated/i);
    });
  });

  // ─── Evaluation Summary ──────────────────────────────────────────────────────

  describe('GET /api/committee/application/:id/summary', () => {
    it('should return average score and passing status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/committee/application/${applicationId}/summary`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('evaluationCount');
      expect(res.body).toHaveProperty('averageScore');
      expect(res.body).toHaveProperty('isPassing');
      expect(res.body).toHaveProperty('minimumPassingScore', 60);
      expect(res.body).toHaveProperty('evaluations');

      expect(res.body.evaluationCount).toBe(1);

      // Total score: 8+9+7+8+9+8+9+7 = 65
      expect(res.body.averageScore).toBe(65);
      expect(res.body.isPassing).toBe(true); // 65 >= 60

      expect(res.body.evaluations).toHaveLength(1);
      expect(res.body.evaluations[0].totalScore).toBe(65);
    });
  });

  // ─── Finalize Decision ───────────────────────────────────────────────────────

  describe('POST /api/committee/application/:id/finalize', () => {
    it('officer should finalize APPROVED decision and transition application status', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/committee/application/${applicationId}/finalize`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          decision: 'APPROVED',
          remarks: 'Committee evaluation passed with score 65/80',
        })
        .expect(201);

      expect(res.body.status).toBe('APPROVED');
      expect(res.body.approvedAt).toBeDefined();

      // Verify status history was recorded
      const history = await prisma.applicationStatusHistory.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'desc' },
      });

      const latestEntry = history[0];
      expect(latestEntry.fromStatus).toBe('COMMITTEE_REVIEW');
      expect(latestEntry.toStatus).toBe('APPROVED');
      expect(latestEntry.changedBy).toBe(officerUserId);
      expect(latestEntry.remarks).toContain('APPROVED');
    });
  });
});
