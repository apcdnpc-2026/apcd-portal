import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApplicationStatus, Role, EvaluationCriterion, EvaluationRecommendation } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';

// 8 Evaluation Criteria as per SOP (maps to EvaluationCriterion enum)
const EVALUATION_CRITERIA = [
  { id: EvaluationCriterion.EXPERIENCE_SCOPE, name: 'Experience & Scope of Supply', maxScore: 10 },
  { id: EvaluationCriterion.TECHNICAL_SPECIFICATION, name: 'Technical Specification of APCDs', maxScore: 10 },
  { id: EvaluationCriterion.TECHNICAL_TEAM, name: 'Technical Team & Capability', maxScore: 10 },
  { id: EvaluationCriterion.FINANCIAL_STANDING, name: 'Financial Standing', maxScore: 10 },
  { id: EvaluationCriterion.LEGAL_QUALITY_COMPLIANCE, name: 'Legal & Quality Compliance', maxScore: 10 },
  { id: EvaluationCriterion.COMPLAINT_HANDLING, name: 'Customer Complaint Handling', maxScore: 10 },
  { id: EvaluationCriterion.CLIENT_FEEDBACK, name: 'Client Feedback', maxScore: 10 },
  { id: EvaluationCriterion.GLOBAL_SUPPLY, name: 'Global Supply (Optional)', maxScore: 10 },
] as const;

const MINIMUM_PASSING_SCORE = 60;
const TOTAL_MAX_SCORE = 80; // 8 criteria x 10 points each

interface EvaluationScoreDto {
  criterion: EvaluationCriterion;
  score: number;
  remarks?: string;
}

interface SubmitEvaluationDto {
  scores: EvaluationScoreDto[];
  recommendation: EvaluationRecommendation;
  overallRemarks?: string;
}

@Injectable()
export class CommitteeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get evaluation criteria
   */
  getEvaluationCriteria() {
    return {
      criteria: EVALUATION_CRITERIA,
      minimumPassingScore: MINIMUM_PASSING_SCORE,
      totalMaxScore: TOTAL_MAX_SCORE,
    };
  }

  /**
   * Get applications pending committee review
   */
  async getPendingApplications() {
    return this.prisma.application.findMany({
      where: { status: ApplicationStatus.COMMITTEE_REVIEW },
      include: {
        applicant: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        oemProfile: {
          select: { companyName: true, fullAddress: true },
        },
        applicationApcds: {
          include: {
            apcdType: true,
          },
        },
        evaluations: {
          include: {
            evaluator: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get application details for committee evaluation
   */
  async getApplicationForEvaluation(applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        applicant: true,
        oemProfile: true,
        applicationApcds: {
          include: {
            apcdType: true,
          },
        },
        attachments: { omit: { fileData: true } },
        installationExperiences: true,
        staffDetails: true,
        payments: {
          where: { status: 'VERIFIED' },
        },
        fieldReports: true,
        evaluations: {
          include: {
            evaluator: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            scores: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  /**
   * Submit evaluation scores for an application
   */
  async submitEvaluation(
    applicationId: string,
    evaluatorId: string,
    dto: SubmitEvaluationDto,
  ) {
    // Validate application exists and is in committee review
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.COMMITTEE_REVIEW) {
      throw new BadRequestException('Application is not in committee review stage');
    }

    // Validate evaluator is a committee member
    const evaluator = await this.prisma.user.findUnique({
      where: { id: evaluatorId },
    });

    if (!evaluator || evaluator.role !== Role.COMMITTEE) {
      throw new ForbiddenException('Only committee members can evaluate');
    }

    // Check if already evaluated by this member
    const existing = await this.prisma.committeeEvaluation.findFirst({
      where: { applicationId, evaluatorId },
    });

    if (existing) {
      throw new BadRequestException('You have already evaluated this application');
    }

    // Validate scores
    for (const score of dto.scores) {
      if (score.score < 0 || score.score > 10) {
        throw new BadRequestException(`Score for ${score.criterion} must be between 0 and 10`);
      }
    }

    // Create evaluation with scores
    return this.prisma.committeeEvaluation.create({
      data: {
        applicationId,
        evaluatorId,
        recommendation: dto.recommendation,
        overallRemarks: dto.overallRemarks,
        completedAt: new Date(),
        scores: {
          create: dto.scores.map((s) => ({
            criterion: s.criterion,
            score: s.score,
            maxScore: 10,
            remarks: s.remarks,
          })),
        },
      },
      include: {
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        scores: true,
      },
    });
  }

  /**
   * Update an existing evaluation (before finalization)
   */
  async updateEvaluation(
    evaluationId: string,
    evaluatorId: string,
    dto: Partial<SubmitEvaluationDto>,
  ) {
    const evaluation = await this.prisma.committeeEvaluation.findUnique({
      where: { id: evaluationId },
      include: { application: true },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    if (evaluation.evaluatorId !== evaluatorId) {
      throw new ForbiddenException('Not authorized to update this evaluation');
    }

    if (evaluation.application.status !== ApplicationStatus.COMMITTEE_REVIEW) {
      throw new BadRequestException('Cannot update evaluation after finalization');
    }

    // Update evaluation
    const updateData: any = {};
    if (dto.recommendation) updateData.recommendation = dto.recommendation;
    if (dto.overallRemarks !== undefined) updateData.overallRemarks = dto.overallRemarks;

    // If scores provided, delete old and create new
    if (dto.scores && dto.scores.length > 0) {
      await this.prisma.evaluationScore.deleteMany({
        where: { evaluationId },
      });

      await this.prisma.evaluationScore.createMany({
        data: dto.scores.map((s) => ({
          evaluationId,
          criterion: s.criterion,
          score: s.score,
          maxScore: 10,
          remarks: s.remarks,
        })),
      });
    }

    return this.prisma.committeeEvaluation.update({
      where: { id: evaluationId },
      data: updateData,
      include: { scores: true },
    });
  }

  /**
   * Get evaluation summary for an application
   */
  async getEvaluationSummary(applicationId: string) {
    const evaluations = await this.prisma.committeeEvaluation.findMany({
      where: { applicationId },
      include: {
        evaluator: {
          select: { id: true, firstName: true, lastName: true },
        },
        scores: true,
      },
    });

    if (evaluations.length === 0) {
      return {
        evaluationCount: 0,
        averageScore: 0,
        isPassing: false,
        evaluations: [],
      };
    }

    // Calculate total scores for each evaluation
    const evaluationsWithTotals = evaluations.map((e) => {
      const totalScore = e.scores.reduce((sum, s) => sum + s.score, 0);
      return { ...e, totalScore };
    });

    const averageScore =
      evaluationsWithTotals.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length;

    return {
      evaluationCount: evaluations.length,
      averageScore: Math.round(averageScore * 100) / 100,
      isPassing: averageScore >= MINIMUM_PASSING_SCORE,
      minimumPassingScore: MINIMUM_PASSING_SCORE,
      evaluations: evaluationsWithTotals,
    };
  }

  /**
   * Finalize committee decision
   */
  async finalizeDecision(
    applicationId: string,
    officerId: string,
    decision: 'APPROVED' | 'REJECTED',
    remarks: string,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.COMMITTEE_REVIEW) {
      throw new BadRequestException('Application is not in committee review');
    }

    // Get evaluation summary
    const summary = await this.getEvaluationSummary(applicationId);

    if (summary.evaluationCount === 0) {
      throw new BadRequestException('No evaluations submitted yet');
    }

    // Determine new status
    const newStatus = decision === 'APPROVED'
      ? ApplicationStatus.APPROVED
      : ApplicationStatus.REJECTED;

    // Update application with status history
    const updateData: any = {
      status: newStatus,
      statusHistory: {
        create: {
          fromStatus: application.status,
          toStatus: newStatus,
          changedBy: officerId,
          remarks: `Committee decision: ${decision}. ${remarks}`,
        },
      },
    };

    if (decision === 'APPROVED') {
      updateData.approvedAt = new Date();
    } else {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = remarks;
    }

    return this.prisma.application.update({
      where: { id: applicationId },
      data: updateData,
    });
  }

  /**
   * Get committee members
   */
  async getCommitteeMembers() {
    return this.prisma.user.findMany({
      where: { role: Role.COMMITTEE, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        _count: {
          select: { evaluations: true },
        },
      },
    });
  }
}
