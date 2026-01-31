import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApplicationStatus, QueryStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface RaiseQueryDto {
  subject: string;
  description: string;
  documentType?: string;
  deadline?: Date;
}

interface RespondToQueryDto {
  message: string;
  attachmentPath?: string;
}

@Injectable()
export class VerificationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get applications pending verification (officer view)
   * Includes DRAFT applications so officers can pre-check documents before payment
   */
  async getPendingApplications() {
    return this.prisma.application.findMany({
      where: {
        status: {
          in: [
            ApplicationStatus.DRAFT,
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.UNDER_REVIEW,
            ApplicationStatus.RESUBMITTED,
          ],
        },
      },
      include: {
        applicant: {
          select: { id: true, email: true, firstName: true, lastName: true, phone: true },
        },
        oemProfile: {
          select: { companyName: true, fullAddress: true },
        },
        attachments: {
          select: { id: true },
        },
        payments: {
          where: { status: 'VERIFIED' },
          select: { id: true, totalAmount: true, paymentType: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get application with all details for verification
   */
  async getApplicationForVerification(applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        applicant: {
          select: { id: true, email: true, firstName: true, lastName: true, phone: true },
        },
        oemProfile: true,
        applicationApcds: {
          include: {
            apcdType: true,
          },
        },
        attachments: { omit: { fileData: true } },
        installationExperiences: true,
        staffDetails: true,
        payments: true,
        queries: {
          include: {
            raisedBy: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
            responses: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  /**
   * Raise a query on an application
   */
  async raiseQuery(applicationId: string, officerId: string, dto: RaiseQueryDto) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Create query record
    const query = await this.prisma.query.create({
      data: {
        applicationId,
        raisedById: officerId,
        subject: dto.subject,
        description: dto.description,
        documentType: dto.documentType as any,
        deadline: dto.deadline,
        status: QueryStatus.OPEN,
      },
    });

    // Update application status if not already queried
    if (application.status !== ApplicationStatus.QUERIED) {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.QUERIED,
          lastQueriedAt: new Date(),
          statusHistory: {
            create: {
              fromStatus: application.status,
              toStatus: ApplicationStatus.QUERIED,
              changedBy: officerId,
              remarks: `Query raised: ${dto.subject}`,
            },
          },
        },
      });
    }

    return query;
  }

  /**
   * Respond to a query (OEM)
   */
  async respondToQuery(queryId: string, userId: string, dto: RespondToQueryDto) {
    const query = await this.prisma.query.findUnique({
      where: { id: queryId },
      include: { application: true },
    });

    if (!query) {
      throw new NotFoundException('Query not found');
    }

    if (query.application.applicantId !== userId) {
      throw new ForbiddenException('Not authorized to respond to this query');
    }

    if (query.status !== QueryStatus.OPEN) {
      throw new BadRequestException('Query is not open for response');
    }

    // Create response
    await this.prisma.queryResponse.create({
      data: {
        queryId,
        responderId: userId,
        message: dto.message,
        attachmentPath: dto.attachmentPath,
      },
    });

    // Update query status
    await this.prisma.query.update({
      where: { id: queryId },
      data: {
        status: QueryStatus.RESPONDED,
      },
    });

    // Check if all queries are responded
    const openQueries = await this.prisma.query.count({
      where: {
        applicationId: query.applicationId,
        status: QueryStatus.OPEN,
      },
    });

    // If no open queries, update application status
    if (openQueries === 0) {
      await this.prisma.application.update({
        where: { id: query.applicationId },
        data: {
          status: ApplicationStatus.RESUBMITTED,
          statusHistory: {
            create: {
              fromStatus: ApplicationStatus.QUERIED,
              toStatus: ApplicationStatus.RESUBMITTED,
              changedBy: userId,
              remarks: 'All queries responded',
            },
          },
        },
      });
    }

    return { success: true };
  }

  /**
   * Close a query as resolved
   */
  async resolveQuery(queryId: string, _officerId: string, _remarks?: string) {
    const query = await this.prisma.query.findUnique({
      where: { id: queryId },
    });

    if (!query) {
      throw new NotFoundException('Query not found');
    }

    return this.prisma.query.update({
      where: { id: queryId },
      data: {
        status: QueryStatus.RESOLVED,
      },
    });
  }

  /**
   * Get queries for an application
   */
  async getQueriesForApplication(applicationId: string) {
    return this.prisma.query.findMany({
      where: { applicationId },
      include: {
        raisedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        responses: {
          include: {
            responder: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending queries for OEM
   */
  async getPendingQueriesForUser(userId: string) {
    return this.prisma.query.findMany({
      where: {
        application: { applicantId: userId },
        status: QueryStatus.OPEN,
      },
      include: {
        application: {
          select: { id: true, applicationNumber: true },
        },
        raisedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Mark application as verified and forward to committee
   */
  async forwardToCommittee(applicationId: string, officerId: string, remarks: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const validStatuses: ApplicationStatus[] = [
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.RESUBMITTED,
    ];

    if (!validStatuses.includes(application.status as ApplicationStatus)) {
      throw new BadRequestException(
        'Application cannot be forwarded to committee in current status',
      );
    }

    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.COMMITTEE_REVIEW,
        statusHistory: {
          create: {
            fromStatus: application.status,
            toStatus: ApplicationStatus.COMMITTEE_REVIEW,
            changedBy: officerId,
            remarks: remarks,
          },
        },
      },
    });
  }

  /**
   * Forward to field verification
   */
  async forwardToFieldVerification(applicationId: string, officerId: string, remarks: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.FIELD_VERIFICATION,
        statusHistory: {
          create: {
            fromStatus: application.status,
            toStatus: ApplicationStatus.FIELD_VERIFICATION,
            changedBy: officerId,
            remarks: remarks,
          },
        },
      },
    });
  }
}
