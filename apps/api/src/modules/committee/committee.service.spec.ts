import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { CommitteeService } from './committee.service';

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

  // ---------------------------------------------------------------------------
  // getEvaluationCriteria
  // ---------------------------------------------------------------------------
  describe('getEvaluationCriteria', () => {
    it('should return 8 criteria with max 10 points each', () => {
      const result = service.getEvaluationCriteria();

      expect(result.criteria).toHaveLength(8);
      result.criteria.forEach((c) => {
        expect(c.maxScore).toBe(10);
      });
    });

    it('should return minimum passing score of 60 and total max of 80', () => {
      const result = service.getEvaluationCriteria();

      expect(result.minimumPassingScore).toBe(60);
      expect(result.totalMaxScore).toBe(80);
    });
  });

  // ---------------------------------------------------------------------------
  // getPendingApplications
  // ---------------------------------------------------------------------------
  describe('getPendingApplications', () => {
    it('should query applications with COMMITTEE_REVIEW status', async () => {
      const mockApps = [{ id: 'app-1', status: 'COMMITTEE_REVIEW' }];
      prisma.application.findMany.mockResolvedValue(mockApps as any);

      const result = await service.getPendingApplications();

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'COMMITTEE_REVIEW' },
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
  });

  // ---------------------------------------------------------------------------
  // getApplicationForEvaluation
  // ---------------------------------------------------------------------------
  describe('getApplicationForEvaluation', () => {
    it('should return the application when found', async () => {
      const mockApp = { id: 'app-1', status: 'COMMITTEE_REVIEW' };
      prisma.application.findUnique.mockResolvedValue(mockApp as any);

      const result = await service.getApplicationForEvaluation('app-1');

      expect(result).toEqual(mockApp);
      expect(prisma.application.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'app-1' } }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.getApplicationForEvaluation('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // submitEvaluation
  // ---------------------------------------------------------------------------
  describe('submitEvaluation', () => {
    const validDto = {
      scores: [
        { criterion: 'EXPERIENCE_SCOPE' as any, score: 8 },
        { criterion: 'TECHNICAL_SPECIFICATION' as any, score: 7 },
      ],
      recommendation: 'APPROVE' as any,
      overallRemarks: 'Good application',
    };

    const setupValidSubmission = () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'COMMITTEE_REVIEW',
      } as any);
      prisma.user.findUnique.mockResolvedValue({
        id: 'eval-1',
        role: 'COMMITTEE',
      } as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);
      prisma.committeeEvaluation.create.mockResolvedValue({
        id: 'evaluation-1',
        applicationId: 'app-1',
        evaluatorId: 'eval-1',
      } as any);
    };

    it('should create evaluation with scores for a valid submission', async () => {
      setupValidSubmission();

      const result = await service.submitEvaluation('app-1', 'eval-1', validDto);

      expect(prisma.committeeEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: 'app-1',
            evaluatorId: 'eval-1',
            recommendation: validDto.recommendation,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.submitEvaluation('missing', 'eval-1', validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when application is not in COMMITTEE_REVIEW', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'DRAFT',
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException when evaluator is not a committee member', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'COMMITTEE_REVIEW',
      } as any);
      prisma.user.findUnique.mockResolvedValue({
        id: 'eval-1',
        role: 'APPLICANT',
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when member has already evaluated', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'COMMITTEE_REVIEW',
      } as any);
      prisma.user.findUnique.mockResolvedValue({
        id: 'eval-1',
        role: 'COMMITTEE',
      } as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue({
        id: 'existing-eval',
      } as any);

      await expect(service.submitEvaluation('app-1', 'eval-1', validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when a score exceeds the 0-10 range', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'COMMITTEE_REVIEW',
      } as any);
      prisma.user.findUnique.mockResolvedValue({
        id: 'eval-1',
        role: 'COMMITTEE',
      } as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const invalidDto = {
        ...validDto,
        scores: [{ criterion: 'EXPERIENCE_SCOPE' as any, score: 15 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when a score is negative', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'COMMITTEE_REVIEW',
      } as any);
      prisma.user.findUnique.mockResolvedValue({
        id: 'eval-1',
        role: 'COMMITTEE',
      } as any);
      prisma.committeeEvaluation.findFirst.mockResolvedValue(null);

      const negativeDto = {
        ...validDto,
        scores: [{ criterion: 'EXPERIENCE_SCOPE' as any, score: -1 }],
      };

      await expect(service.submitEvaluation('app-1', 'eval-1', negativeDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateEvaluation
  // ---------------------------------------------------------------------------
  describe('updateEvaluation', () => {
    it('should update the evaluation when called by the original evaluator', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: 'user-1',
        application: { status: 'COMMITTEE_REVIEW' },
      } as any);
      prisma.committeeEvaluation.update.mockResolvedValue({ id: 'eval-1' } as any);

      const result = await service.updateEvaluation('eval-1', 'user-1', {
        recommendation: 'REJECT' as any,
      });

      expect(prisma.committeeEvaluation.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when evaluation does not exist', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue(null);

      await expect(service.updateEvaluation('missing', 'user-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when evaluator is not the original author', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: 'other-user',
        application: { status: 'COMMITTEE_REVIEW' },
      } as any);

      await expect(service.updateEvaluation('eval-1', 'user-1', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when application is already finalized', async () => {
      prisma.committeeEvaluation.findUnique.mockResolvedValue({
        id: 'eval-1',
        evaluatorId: 'user-1',
        application: { status: 'APPROVED' },
      } as any);

      await expect(
        service.updateEvaluation('eval-1', 'user-1', { recommendation: 'APPROVE' as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // getEvaluationSummary
  // ---------------------------------------------------------------------------
  describe('getEvaluationSummary', () => {
    it('should return zero values when no evaluations exist', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([]);

      const result = await service.getEvaluationSummary('app-1');

      expect(result.evaluationCount).toBe(0);
      expect(result.averageScore).toBe(0);
      expect(result.isPassing).toBe(false);
    });

    it('should calculate isPassing as true when average score >= 60', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores: [{ score: 30 }, { score: 35 }] },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      expect(result.averageScore).toBe(65);
      expect(result.isPassing).toBe(true);
    });

    it('should calculate isPassing as false when average score < 60', async () => {
      prisma.committeeEvaluation.findMany.mockResolvedValue([
        { id: 'e1', scores: [{ score: 20 }, { score: 15 }] },
      ] as any);

      const result = await service.getEvaluationSummary('app-1');

      expect(result.averageScore).toBe(35);
      expect(result.isPassing).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // finalizeDecision
  // ---------------------------------------------------------------------------
  describe('finalizeDecision', () => {
    const setupFinalize = (evalCount: number) => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'COMMITTEE_REVIEW',
      } as any);
      // getEvaluationSummary is called internally
      prisma.committeeEvaluation.findMany.mockResolvedValue(
        evalCount > 0 ? [{ id: 'e1', scores: [{ score: 40 }, { score: 30 }] }] : ([] as any),
      );
      prisma.application.update.mockResolvedValue({ id: 'app-1', status: 'APPROVED' } as any);
    };

    it('should update application to APPROVED with approvedAt timestamp', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'Meets all criteria');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.status).toBe('APPROVED');
      expect(updateCall.data.approvedAt).toBeInstanceOf(Date);
    });

    it('should update application to REJECTED with rejectedAt and rejectionReason', async () => {
      setupFinalize(1);

      await service.finalizeDecision('app-1', 'officer-1', 'REJECTED', 'Does not meet standards');

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      expect(updateCall.data.status).toBe('REJECTED');
      expect(updateCall.data.rejectedAt).toBeInstanceOf(Date);
      expect(updateCall.data.rejectionReason).toBe('Does not meet standards');
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.finalizeDecision('missing', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when application is not in COMMITTEE_REVIEW', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: 'DRAFT',
      } as any);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no evaluations have been submitted', async () => {
      setupFinalize(0);

      await expect(
        service.finalizeDecision('app-1', 'officer-1', 'APPROVED', 'ok'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // getCommitteeMembers
  // ---------------------------------------------------------------------------
  describe('getCommitteeMembers', () => {
    it('should query active users with COMMITTEE role', async () => {
      const mockMembers = [
        {
          id: 'u1',
          firstName: 'Alice',
          lastName: 'Jones',
          email: 'a@b.com',
          _count: { evaluations: 3 },
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockMembers as any);

      const result = await service.getCommitteeMembers();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'COMMITTEE', isActive: true },
        }),
      );
      expect(result).toEqual(mockMembers);
    });
  });
});
