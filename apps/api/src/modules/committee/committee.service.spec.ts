import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaClient,
  ApplicationStatus,
  Role,
  EvaluationCriterion,
  EvaluationRecommendation,
} from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { CommitteeService } from './committee.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const ALL_CRITERIA: EvaluationCriterion[] = [
  EvaluationCriterion.EXPERIENCE_SCOPE,
  EvaluationCriterion.TECHNICAL_SPECIFICATION,
  EvaluationCriterion.TECHNICAL_TEAM,
  EvaluationCriterion.FINANCIAL_STANDING,
  EvaluationCriterion.LEGAL_QUALITY_COMPLIANCE,
  EvaluationCriterion.COMPLAINT_HANDLING,
  EvaluationCriterion.CLIENT_FEEDBACK,
  EvaluationCriterion.GLOBAL_SUPPLY,
];

/** Build a full set of 8 scores with a uniform value */
const buildFullScores = (score: number) =>
  ALL_CRITERIA.map((criterion) => ({ criterion, score }));

const mockApplication = {
  id: 'app-1',
  applicationNumber: 'APCD-2025-0001',
  applicantId: 'user-1',
  oemProfileId: 'profile-1',
  status: ApplicationStatus.COMMITTEE_REVIEW,
  currentStep: 5,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  submittedAt: new Date('2025-01-02'),
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  lastQueriedAt: null,
  assignedOfficerId: null,
};

const mockCommitteeMember = {
  id: 'eval-1',
  email: 'member@committee.gov',
  firstName: 'Priya',
  lastName: 'Sharma',
  role: Role.COMMITTEE,
  isActive: true,
};

const validDto = {
  scores: buildFullScores(8),
  recommendation: EvaluationRecommendation.APPROVE,
  overallRemarks: 'Good application, meets all criteria.',
};

const mockCreatedEvaluation = {
  id: 'evaluation-1',
  applicationId: 'app-1',
  evaluatorId: 'eval-1',
  recommendation: EvaluationRecommendation.APPROVE,
  overallRemarks: 'Good application, meets all criteria.',
  completedAt: new Date(),
  evaluator: { id: 'eval-1', firstName: 'Priya', lastName: 'Sharma' },
  scores: validDto.scores.map((s, i) => ({
    id: `score-${i}`,
    evaluationId: 'evaluation-1',
    criterion: s.criterion,
    score: s.score,
    maxScore: 10,
    remarks: null,
  })),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CommitteeService', () => {
  let service: CommitteeService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommitteeService, { provide: PrismaService, useValue: mockDeep<PrismaClient>() }],
    }).compile();

    service = module.get<CommitteeService>(CommitteeService);
    prisma = module.get(PrismaService);
  });

  // =========================================================================
  // getEvaluationCriteria
  // =========================================================================

  describe('getEvaluationCriteria', () => {
    it('should return exactly 8 criteria', () => {
      const result = service.getEvaluationCriteria();
      expect(result.criteria).toHaveLength(8);
    });

    it('should set maxScore to 10 for every criterion', () => {
      const result = service.getEvaluationCriteria();
      result.criteria.forEach((c) => {
        expect(c.maxScore).toBe(10);
      });
    });

    it('should include all expected criterion ids', () => {
      const result = service.getEvaluationCriteria();
      const ids = result.criteria.map((c) => c.id);
      ALL_CRITERIA.forEach((criterion) => {
        expect(ids).toContain(criterion);
      });
    });

    it('should return minimum passing score of 60', () => {
      const result = service.getEvaluationCriteria();
      expect(result.minimumPassingScore).toBe(60);
    });

    it('should return total max score of 80', () => {
      const result = service.getEvaluationCriteria();
      expect(result.totalMaxScore).toBe(80);
    });
  });

  // =========================================================================
  // getCommitteeMembers
  // =========================================================================

  describe('getCommitteeMembers', () => {
    it('should query active users with COMMITTEE role', async () => {
      const mockMembers = [
        {
          id: 'u1',
          firstName: 'Alice',
          lastName: 'Jones',
          email: 'alice@gov.in',
          _count: { evaluations: 3 },
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockMembers as any);

      const result = await service.getCommitteeMembers();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: Role.COMMITTEE, isActive: true },
        }),
      );
      expect(result).toEqual(mockMembers);
    });

    it('should return empty array when no committee members exist', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.getCommitteeMembers();

      expect(result).toEqual([]);
    });

    it('should include evaluation count in the select', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getCommitteeMembers();

      const callArg = prisma.user.findMany.mock.calls[0][0] as any;
      expect(callArg.select._count).toEqual({ select: { evaluations: true } });
    });
  });

  // =========================================================================
  // getPendingApplications
  // =========================================================================

  describe('getPendingApplications', () => {
    it('should query applications with COMMITTEE_REVIEW status', async () => {
      const mockApps = [{ id: 'app-1', status: ApplicationStatus.COMMITTEE_REVIEW }];
      prisma.application.findMany.mockResolvedValue(mockApps as any);

      const result = await service.getPendingApplications();

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ApplicationStatus.COMMITTEE_REVIEW },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(result).toEqual(mockApps);
    });

    it('should include applicant, oemProfile, applicationApcds, and evaluations', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      await service.getPendingApplications();

      const callArg = prisma.application.findMany.mock.calls[0][0] as any;
      expect(callArg.include).toHaveProperty('applicant');
      expect(callArg.include).toHaveProperty('oemProfile');
      expect(callArg.include).toHaveProperty('applicationApcds');
      expect(callArg.include).toHaveProperty('evaluations');
    });

    it('should return empty array when no applications are pending', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getPendingApplications();

      expect(result).toEqual([]);
    });

    it('should include evaluator details inside evaluations', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      await service.getPendingApplications();

      const callArg = prisma.application.findMany.mock.calls[0][0] as any;
      expect(callArg.include.evaluations.include.evaluator).toEqual({
        select: { id: true, firstName: true, lastName: true },
      });
    });
  });

  // =========================================================================
  // getApplicationForEvaluation
  // =========================================================================

  describe('getApplicationForEvaluation', () => {
    it('should return the application when found', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const result = await service.getApplicationForEvaluation('app-1');

      expect(result).toEqual(mockApplication);
      expect(prisma.application.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'app-1' } }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.getApplicationForEvaluation('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include attachments with fileData omitted', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await service.getApplicationForEvaluation('app-1');

      const callArg = prisma.application.findUnique.mock.calls[0][0] as any;
      expect(callArg.include.attachments).toEqual({ omit: { fileData: true } });
    });

    it('should include evaluations with evaluator and scores', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await service.getApplicationForEvaluation('app-1');

      const callArg = prisma.application.findUnique.mock.calls[0][0] as any;
      expect(callArg.include.evaluations).toEqual({
        include: {
          evaluator: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          scores: true,
        },
      });
    });

    it('should include statusHistory ordered by createdAt desc, limited to 10', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await service.getApplicationForEvaluation('app-1');

      const callArg = prisma.application.findUnique.mock.calls[0][0] as any;
      expect(callArg.include.statusHistory).toEqual({
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });

    it('should include payments filtered by VERIFIED status', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await service.getApplicationForEvaluation('app-1');

      const callArg = prisma.application.findUnique.mock.calls[0][0] as any;
      expect(callArg.include.payments).toEqual({ where: { status: 'VERIFIED' } });
    });

    it('should include all related entities (applicant, oemProfile, staffDetails, etc.)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await service.getApplicationForEvaluation('app-1');

      const callArg = prisma.application.findUnique.mock.calls[0][0] as any;
      expect(callArg.include).toHaveProperty('applicant');
      expect(callArg.include).toHaveProperty('oemProfile');
      expect(callArg.include).toHaveProperty('installationExperiences');
      expect(callArg.include).toHaveProperty('staffDetails');
      expect(callArg.include).toHaveProperty('fieldReports');
    });
  });

  // =========================================================================
  // submitEvaluation
  // =========================================================================

  describe('submitEvaluation', () => {
    /** Sets up all mocks for a valid submission flow */
    const setupValidSubmission = () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);
      prisma.committeeEvaluation.create.mockResolvedValue(mockCreatedEvaluation as any);
    };

    // --- Happy path ---

    it('should create evaluation with all scores for a valid submission', async () => {
      setupValidSubmission();

      const result = await service.submitEvaluation('app-1', 'eval-1', validDto);

      expect(prisma.committeeEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: 'app-1',
            evaluatorId: 'eval-1',
            recommendation: EvaluationRecommendation.APPROVE,
            overallRemarks: validDto.overallRemarks,
            completedAt: expect.any(Date),
            scores: {
              create: validDto.scores.map((s) => ({
                criterion: s.criterion,
                score: s.score,
                maxScore: 10,
                remarks: undefined,
              })),
            },
          }),
          include: {
            evaluator: { select: { id: true, firstName: true, lastName: true } },
            scores: true,
          },
        }),
      );
      expect(result).toBeDefined();
      expect(result.id).toBe('evaluation-1');
    });

    it('should accept scores with remarks', async () => {
      setupValidSubmission();

      const dtoWithRemarks = {
        ...validDto,
        scores: [
          {
            criterion: EvaluationCriterion.EXPERIENCE_SCOPE,
            score: 9,
            remarks: 'Excellent track record',
          },
          {
            criterion: EvaluationCriterion.TECHNICAL_SPECIFICATION,
            score: 7,
            remarks: 'Adequate specs',
          },
        ],
      };

      await service.submitEvaluation('app-1', 'eval-1', dtoWithRemarks);

      const createCall = prisma.committeeEvaluation.create.mock.calls[0][0] as any;
      expect(createCall.data.scores.create[0].remarks).toBe('Excellent track record');
      expect(createCall.data.scores.create[1].remarks).toBe('Adequate specs');
    });

    it('should accept boundary scores of 0 and 10', async () => {
      setupValidSubmission();

      const boundaryDto = {
        ...validDto,
        scores: [
          { criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: 0 },
          { criterion: EvaluationCriterion.TECHNICAL_SPECIFICATION, score: 10 },
        ],
      };

      await expect(
        service.submitEvaluation('app-1', 'eval-1', boundaryDto),
      ).resolves.toBeDefined();
    });

    it('should accept all recommendation types', async () => {
      const recommendations = [
        EvaluationRecommendation.APPROVE,
        EvaluationRecommendation.REJECT,
        EvaluationRecommendation.NEED_MORE_INFO,
        EvaluationRecommendation.FIELD_VERIFICATION_REQUIRED,
      ];

      for (const recommendation of recommendations) {
        setupValidSubmission();
        jest.clearAllMocks();
        setupValidSubmission();

        const dto = { ...validDto, recommendation };
        await service.submitEvaluation('app-1', 'eval-1', dto);

        const createCall = prisma.committeeEvaluation.create.mock.calls[0][0] as any;
        expect(createCall.data.recommendation).toBe(recommendation);
      }
    });

    it('should accept submission without overallRemarks', async () => {
      setupValidSubmission();

      const dto = {
        scores: buildFullScores(7),
        recommendation: EvaluationRecommendation.APPROVE,
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', dto)).resolves.toBeDefined();
    });

    // --- Application not found ---

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.submitEvaluation('missing', 'eval-1', validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    // --- Wrong application status ---

    it('should throw BadRequestException when application is in DRAFT status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when application is APPROVED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.APPROVED,
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when application is SUBMITTED (not yet at committee stage)', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // --- Evaluator role validation ---

    it('should throw ForbiddenException when evaluator is not a committee member', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue({
        ...mockCommitteeMember,
        id: 'eval-1',
        role: Role.OEM,
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when evaluator is an OFFICER', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue({
        ...mockCommitteeMember,
        id: 'eval-1',
        role: Role.OFFICER,
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when evaluator user is not found', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    // --- Duplicate evaluation ---

    it('should throw BadRequestException when member has already evaluated this application', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue({
        id: 'existing-eval',
        applicationId: 'app-1',
        evaluatorId: 'eval-1',
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include "already evaluated" in error message for duplicate attempt', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue({
        id: 'existing-eval',
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        /already evaluated/,
      );
    });

    // --- Score out of range (> 10) ---

    it('should throw BadRequestException when a score exceeds 10', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const invalidDto = {
        ...validDto,
        scores: [{ criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: 15 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when a score is 11 (just over max)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const invalidDto = {
        ...validDto,
        scores: [{ criterion: EvaluationCriterion.FINANCIAL_STANDING, score: 11 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // --- Negative score ---

    it('should throw BadRequestException when a score is negative', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const negativeDto = {
        ...validDto,
        scores: [{ criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: -1 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', negativeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when a score is a large negative number', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const negativeDto = {
        ...validDto,
        scores: [{ criterion: EvaluationCriterion.TECHNICAL_TEAM, score: -100 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', negativeDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // --- Non-integer score ---

    it('should accept non-integer score 5.5 (service only validates range 0-10)', async () => {
      setupValidSubmission();

      const fractionalDto = {
        ...validDto,
        scores: [{ criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: 5.5 }],
      };

      // The service validates only 0-10 range, not integer-ness. 5.5 is within range.
      await expect(
        service.submitEvaluation('app-1', 'eval-1', fractionalDto),
      ).resolves.toBeDefined();
    });

    it('should reject non-integer score 10.5 (above range regardless of integer check)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.user.findUnique.mockResolvedValue(mockCommitteeMember as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const fractionalDto = {
        ...validDto,
        scores: [{ criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: 10.5 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', fractionalDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // --- Empty scores array ---

    it('should succeed with empty scores array (no validation on completeness)', async () => {
      setupValidSubmission();

      const emptyScoresDto = {
        scores: [] as { criterion: EvaluationCriterion; score: number }[],
        recommendation: EvaluationRecommendation.APPROVE,
      };

      // The loop validation passes vacuously for an empty array
      await expect(
        service.submitEvaluation('app-1', 'eval-1', emptyScoresDto),
      ).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // updateEvaluation
  // =========================================================================

  describe('updateEvaluation', () => {
    const mockEvaluation = {
      id: 'eval-1',
      evaluatorId: 'user-1',
      applicationId: 'app-1',
      recommendation: EvaluationRecommendation.APPROVE,
      overallRemarks: 'Initial remarks',
      application: { ...mockApplication, status: ApplicationStatus.COMMITTEE_REVIEW },
    };

    // --- Happy path ---

    it('should update recommendation when called by the original evaluator', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(mockEvaluation as any);
      prisma.committeeEvaluation.update.mockResolvedValue({
        id: 'eval-1',
        recommendation: EvaluationRecommendation.REJECT,
        scores: [],
      } as any);

      const result = await service.updateEvaluation('eval-1', 'user-1', {
        recommendation: EvaluationRecommendation.REJECT,
      });

      expect(prisma.committeeEvaluation.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update overallRemarks', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(mockEvaluation as any);
      prisma.committeeEvaluation.update.mockResolvedValue({ id: 'eval-1', scores: [] } as any);

      await service.updateEvaluation('eval-1', 'user-1', {
        overallRemarks: 'Updated remarks after discussion',
      });

      const updateCall = prisma.committeeEvaluation.update.mock.calls[0][0] as any;
      expect(updateCall.data.overallRemarks).toBe('Updated remarks after discussion');
    });

    it('should delete old scores and create new ones when scores are provided', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(mockEvaluation as any);
      prisma.evaluationScore.deleteMany.mockResolvedValue({ count: 8 } as any);
      prisma.evaluationScore.createMany.mockResolvedValue({ count: 2 } as any);
      prisma.committeeEvaluation.update.mockResolvedValue({ id: 'eval-1', scores: [] } as any);

      const newScores = [
        { criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: 9 },
        { criterion: EvaluationCriterion.TECHNICAL_SPECIFICATION, score: 6 },
      ];

      await service.updateEvaluation('eval-1', 'user-1', { scores: newScores });

      expect(prisma.evaluationScore.deleteMany).toHaveBeenCalledWith({
        where: { evaluationId: 'eval-1' },
      });
      expect(prisma.evaluationScore.createMany).toHaveBeenCalledWith({
        data: newScores.map((s) => ({
          evaluationId: 'eval-1',
          criterion: s.criterion,
          score: s.score,
          maxScore: 10,
          remarks: undefined,
        })),
      });
    });

    it('should not delete scores when no scores are provided in the update', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(mockEvaluation as any);
      prisma.committeeEvaluation.update.mockResolvedValue({ id: 'eval-1', scores: [] } as any);

      await service.updateEvaluation('eval-1', 'user-1', {
        recommendation: EvaluationRecommendation.NEED_MORE_INFO,
      });

      expect(prisma.evaluationScore.deleteMany).not.toHaveBeenCalled();
      expect(prisma.evaluationScore.createMany).not.toHaveBeenCalled();
    });

    it('should not delete scores when empty scores array is provided', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(mockEvaluation as any);
      prisma.committeeEvaluation.update.mockResolvedValue({ id: 'eval-1', scores: [] } as any);

      await service.updateEvaluation('eval-1', 'user-1', { scores: [] });

      expect(prisma.evaluationScore.deleteMany).not.toHaveBeenCalled();
    });

    // --- Evaluation not found ---

    it('should throw NotFoundException when evaluation does not exist', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(null);

      await expect(service.updateEvaluation('missing', 'user-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    // --- Not the original evaluator ---

    it('should throw ForbiddenException when called by a different evaluator', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue({
        ...mockEvaluation,
        evaluatorId: 'other-user',
      } as any);

      await expect(
        service.updateEvaluation('eval-1', 'user-1', {
          recommendation: EvaluationRecommendation.REJECT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // --- Application already finalized ---

    it('should throw BadRequestException when application is APPROVED', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue({
        ...mockEvaluation,
        application: { ...mockApplication, status: ApplicationStatus.APPROVED },
      } as any);

      await expect(
        service.updateEvaluation('eval-1', 'user-1', {
          recommendation: EvaluationRecommendation.APPROVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application is REJECTED', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue({
        ...mockEvaluation,
        application: { ...mockApplication, status: ApplicationStatus.REJECTED },
      } as any);

      await expect(
        service.updateEvaluation('eval-1', 'user-1', {
          recommendation: EvaluationRecommendation.REJECT,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // getEvaluationSummary
  // =========================================================================

  describe('getEvaluationSummary', () => {
    // --- No evaluations ---

    it('should return zero values when no evaluations exist', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([]);

      const result = await service.getEvaluationSummary('app-1');

      expect(result.evaluationCount).toBe(0);
      expect(result.averageScore).toBe(0);
      expect(result.isPassing).toBe(false);
      expect(result.evaluations).toEqual([]);
    });

    // --- Single evaluation passing ---

    it('should calculate isPassing as true when total score >= 60', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        {
          id: 'e1',
          evaluator: { id: 'u1', firstName: 'A', lastName: 'B' },
          scores: buildFullScores(8).map((s, i) => ({
            id: `s-${i}`,
            evaluationId: 'e1',
            ...s,
            maxScore: 10,
            remarks: null,
          })),
        },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      // 8 criteria x 8 points = 64
      expect(result.averageScore).toBe(64);
      expect(result.isPassing).toBe(true);
      expect(result.evaluationCount).toBe(1);
    });

    // --- Single evaluation failing ---

    it('should calculate isPassing as false when total score < 60', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        {
          id: 'e1',
          scores: buildFullScores(5).map((s, i) => ({
            id: `s-${i}`,
            evaluationId: 'e1',
            ...s,
            maxScore: 10,
            remarks: null,
          })),
        },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      // 8 criteria x 5 points = 40
      expect(result.averageScore).toBe(40);
      expect(result.isPassing).toBe(false);
    });

    // --- Exactly on the threshold ---

    it('should mark isPassing as true when average equals exactly 60', async () => {
      // Need total score = 60 from one evaluation
      // 7 criteria at 8 + 1 criterion at 4 = 56 + 4 = 60
      const scores = ALL_CRITERIA.map((criterion, i) => ({
        id: `s-${i}`,
        evaluationId: 'e1',
        criterion,
        score: i < 7 ? 8 : 4,
        maxScore: 10,
        remarks: null,
      }));

      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      expect(result.averageScore).toBe(60);
      expect(result.isPassing).toBe(true);
    });

    // --- Multiple evaluations averaging ---

    it('should average scores across multiple evaluations', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        {
          id: 'e1',
          scores: [{ score: 30 }, { score: 30 }], // total 60
        },
        {
          id: 'e2',
          scores: [{ score: 20 }, { score: 20 }], // total 40
        },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      // average = (60 + 40) / 2 = 50
      expect(result.evaluationCount).toBe(2);
      expect(result.averageScore).toBe(50);
      expect(result.isPassing).toBe(false);
    });

    it('should round averageScore to two decimal places', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores: [{ score: 10 }, { score: 10 }, { score: 10 }] }, // total 30
        { id: 'e2', scores: [{ score: 10 }, { score: 10 }, { score: 11 }] }, // total 31
        { id: 'e3', scores: [{ score: 10 }, { score: 10 }, { score: 12 }] }, // total 32
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      // average = (30 + 31 + 32) / 3 = 31
      expect(result.averageScore).toBe(31);
    });

    it('should round correctly when result is a repeating decimal', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores: [{ score: 20 }] }, // total 20
        { id: 'e2', scores: [{ score: 21 }] }, // total 21
        { id: 'e3', scores: [{ score: 22 }] }, // total 22
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      // average = (20 + 21 + 22) / 3 = 21.0
      expect(result.averageScore).toBe(21);
    });

    // --- Includes minimumPassingScore in result ---

    it('should include minimumPassingScore in the result when evaluations exist', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores: [{ score: 40 }] },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      expect(result.minimumPassingScore).toBe(60);
    });

    // --- Includes evaluationsWithTotals ---

    it('should attach totalScore to each evaluation in the result', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores: [{ score: 5 }, { score: 10 }] },
        { id: 'e2', scores: [{ score: 8 }, { score: 7 }] },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      const totals = result.evaluations.map((e: any) => e.totalScore);
      expect(totals).toEqual([15, 15]);
    });
  });

  // =========================================================================
  // finalizeDecision
  // =========================================================================

  describe('finalizeDecision', () => {
    /** Set up mocks for a finalization scenario */
    const setupFinalize = (evaluationCount: number) => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.committeeEvaluation.findMany.mockResolvedValue(
        evaluationCount > 0
          ? [
              {
                id: 'e1',
                evaluator: { id: 'u1', firstName: 'A', lastName: 'B' },
                scores: [{ score: 40 }, { score: 30 }],
              },
            ]
          : ([] as any),
      );
      prisma.application.update.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.APPROVED,
      } as any);
    };

    // --- Happy path: APPROVED ---

    it('should update application to APPROVED with approvedAt timestamp', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'Meets all criteria');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.status).toBe(ApplicationStatus.APPROVED);
      expect(updateCall.data.approvedAt).toBeInstanceOf(Date);
      expect(updateCall.data.rejectedAt).toBeUndefined();
      expect(updateCall.data.rejectionReason).toBeUndefined();
    });

    it('should create statusHistory entry for APPROVED decision', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'All good');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.statusHistory.create).toEqual(
        expect.objectContaining({
          fromStatus: ApplicationStatus.COMMITTEE_REVIEW,
          toStatus: ApplicationStatus.APPROVED,
          changedBy: 'officer-1',
          remarks: expect.stringContaining('APPROVED'),
        }),
      );
    });

    // --- Happy path: REJECTED ---

    it('should update application to REJECTED with rejectedAt and rejectionReason', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'REJECTED', 'Does not meet standards');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.status).toBe(ApplicationStatus.REJECTED);
      expect(updateCall.data.rejectedAt).toBeInstanceOf(Date);
      expect(updateCall.data.rejectionReason).toBe('Does not meet standards');
      expect(updateCall.data.approvedAt).toBeUndefined();
    });

    it('should create statusHistory entry for REJECTED decision', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'REJECTED', 'Insufficient docs');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.statusHistory.create).toEqual(
        expect.objectContaining({
          fromStatus: ApplicationStatus.COMMITTEE_REVIEW,
          toStatus: ApplicationStatus.REJECTED,
          changedBy: 'officer-1',
          remarks: expect.stringContaining('REJECTED'),
        }),
      );
    });

    it('should include remarks in the statusHistory entry', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'Excellent submission');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.statusHistory.create.remarks).toContain('Excellent submission');
    });

    // --- Application not found ---

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.finalizeDecision('missing', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(NotFoundException);
    });

    // --- Wrong application status ---

    it('should throw BadRequestException when application is in DRAFT status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
      } as any);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application is already APPROVED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.APPROVED,
      } as any);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application is already REJECTED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.REJECTED,
      } as any);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'REJECTED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application is SUBMITTED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    // --- No evaluations submitted ---

    it('should throw BadRequestException when no evaluations have been submitted', async () => {
      setupFinalize(0);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include "No evaluations" in error message when none submitted', async () => {
      setupFinalize(0);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(/No evaluations/);
    });
  });
});
