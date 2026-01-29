import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApplicationStatus, Role, APCDInstallationCategory } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ApplicationValidatorService } from './application-validator.service';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/create-application.dto';
import { ApplicationFilterDto } from './dto/application-filter.dto';
import { PaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private validator: ApplicationValidatorService,
  ) {}

  /**
   * Create a new draft application
   */
  async create(userId: string) {
    const profile = await this.prisma.oemProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new BadRequestException('Create your company profile first before starting an application');
    }

    // Reuse existing DRAFT application instead of creating duplicates
    const existingDraft = await this.prisma.application.findFirst({
      where: {
        applicantId: userId,
        status: ApplicationStatus.DRAFT,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingDraft) {
      return existingDraft;
    }

    // Generate application number: APCD-YYYY-NNNN
    const year = new Date().getFullYear();
    const count = await this.prisma.application.count({
      where: {
        applicationNumber: { startsWith: `APCD-${year}` },
      },
    });
    const applicationNumber = `APCD-${year}-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.application.create({
      data: {
        applicationNumber,
        applicantId: userId,
        oemProfileId: profile.id,
        status: ApplicationStatus.DRAFT,
        currentStep: 1,
      },
    });
  }

  /**
   * Get application by ID with authorization check
   */
  async findById(id: string, userId: string, userRole: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        oemProfile: true,
        contactPersons: true,
        applicationApcds: { include: { apcdType: true } },
        attachments: {
          select: {
            id: true,
            documentType: true,
            originalName: true,
            fileSizeBytes: true,
            hasValidGeoTag: true,
            isVerified: true,
            createdAt: true,
          },
        },
        installationExperiences: { orderBy: { sortOrder: 'asc' } },
        fieldVerificationSites: { orderBy: { slNo: 'asc' } },
        staffDetails: { orderBy: { sortOrder: 'asc' } },
        payments: true,
        queries: {
          include: { responses: true, raisedBy: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        evaluations: {
          include: {
            scores: true,
            evaluator: { select: { firstName: true, lastName: true } },
          },
        },
        fieldReports: true,
        certificates: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!application) throw new NotFoundException('Application not found');

    // Authorization: OEMs can only see their own applications
    if (userRole === Role.OEM && application.applicantId !== userId) {
      throw new ForbiddenException('You can only access your own applications');
    }

    return application;
  }

  /**
   * List applications with role-based filtering
   */
  async findAll(
    filter: ApplicationFilterDto,
    userId: string,
    userRole: string,
  ): Promise<PaginatedResult<any>> {
    const where: any = {};

    // Role-based filtering
    if (userRole === Role.OEM) {
      where.applicantId = userId;
    } else if (filter.applicantId) {
      where.applicantId = filter.applicantId;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    // For officers: only show submitted+ applications
    if (userRole === Role.OFFICER) {
      where.status = where.status || { not: ApplicationStatus.DRAFT };
    }

    if (filter.search) {
      where.OR = [
        { applicationNumber: { contains: filter.search, mode: 'insensitive' } },
        { oemProfile: { companyName: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        include: {
          oemProfile: { select: { companyName: true, firmSize: true, isMSE: true } },
        },
        skip: filter.skip,
        take: filter.limit,
        orderBy: { [filter.sortBy || 'createdAt']: filter.sortOrder || 'desc' },
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: filter.page ?? 1,
        limit: filter.limit ?? 20,
        totalPages: Math.ceil(total / (filter.limit ?? 20)),
      },
    };
  }

  /**
   * Update a draft application (auto-save per step)
   */
  async update(id: string, userId: string, dto: UpdateApplicationDto) {
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Application not found');
    if (application.applicantId !== userId) throw new ForbiddenException();
    if (application.status !== ApplicationStatus.DRAFT && application.status !== ApplicationStatus.QUERIED) {
      throw new BadRequestException('Application can only be edited in DRAFT or QUERIED status');
    }

    const { contactPersons, apcdSelections, ...applicationData } = dto;

    // Update application fields
    const updated = await this.prisma.application.update({
      where: { id },
      data: applicationData,
    });

    // Update contact persons if provided
    if (contactPersons) {
      await this.prisma.contactPerson.deleteMany({ where: { applicationId: id } });
      await this.prisma.contactPerson.createMany({
        data: contactPersons.map((cp) => ({ ...cp, applicationId: id })),
      });
    }

    // Update APCD selections if provided
    if (apcdSelections) {
      await this.prisma.applicationApcd.deleteMany({ where: { applicationId: id } });
      await this.prisma.applicationApcd.createMany({
        data: apcdSelections.map((sel) => ({
          applicationId: id,
          apcdTypeId: sel.apcdTypeId,
          isManufactured: sel.isManufactured,
          seekingEmpanelment: sel.seekingEmpanelment,
          installationCategory: sel.installationCategory as APCDInstallationCategory | undefined,
          designCapacityRange: sel.designCapacityRange,
        })),
      });
    }

    return updated;
  }

  /**
   * Submit application (DRAFT -> SUBMITTED)
   */
  async submit(id: string, userId: string) {
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Application not found');
    if (application.applicantId !== userId) throw new ForbiddenException();
    if (application.status !== ApplicationStatus.DRAFT) {
      throw new BadRequestException('Only draft applications can be submitted');
    }

    // Validate completeness
    const errors = await this.validator.validateForSubmission(id);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Application is incomplete',
        errors,
      });
    }

    return this.transitionStatus(
      id,
      ApplicationStatus.DRAFT,
      ApplicationStatus.SUBMITTED,
      userId,
      'Application submitted by OEM',
    );
  }

  /**
   * Resubmit after responding to queries (QUERIED -> RESUBMITTED)
   */
  async resubmit(id: string, userId: string) {
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Application not found');
    if (application.applicantId !== userId) throw new ForbiddenException();

    return this.transitionStatus(
      id,
      ApplicationStatus.QUERIED,
      ApplicationStatus.RESUBMITTED,
      userId,
      'Application resubmitted after query response',
    );
  }

  /**
   * Withdraw application
   */
  async withdraw(id: string, userId: string, reason?: string) {
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Application not found');
    if (application.applicantId !== userId) throw new ForbiddenException();

    const withdrawableStatuses: ApplicationStatus[] = [ApplicationStatus.DRAFT, ApplicationStatus.QUERIED];
    if (!withdrawableStatuses.includes(application.status as ApplicationStatus)) {
      throw new BadRequestException('Application cannot be withdrawn at this stage');
    }

    return this.transitionStatus(
      id,
      application.status,
      ApplicationStatus.WITHDRAWN,
      userId,
      reason || 'Application withdrawn by OEM',
    );
  }

  /**
   * Change application status (for officers/admin)
   */
  async changeStatus(
    id: string,
    newStatus: ApplicationStatus,
    changedBy: string,
    remarks?: string,
  ) {
    const application = await this.prisma.application.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Application not found');

    // Basic validation - in production, add more comprehensive transition rules
    if (application.status === newStatus) {
      throw new BadRequestException('Status is already set to this value');
    }

    return this.transitionStatus(id, application.status, newStatus, changedBy, remarks);
  }

  /**
   * Internal: perform status transition with audit trail
   */
  private async transitionStatus(
    applicationId: string,
    fromStatus: ApplicationStatus,
    toStatus: ApplicationStatus,
    changedBy: string,
    remarks?: string,
  ) {
    const updateData: any = { status: toStatus };

    if (toStatus === ApplicationStatus.SUBMITTED) {
      updateData.submittedAt = new Date();
    } else if (toStatus === ApplicationStatus.APPROVED) {
      updateData.approvedAt = new Date();
    } else if (toStatus === ApplicationStatus.REJECTED) {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = remarks;
    } else if (toStatus === ApplicationStatus.QUERIED) {
      updateData.lastQueriedAt = new Date();
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.application.update({
        where: { id: applicationId },
        data: updateData,
      }),
      this.prisma.applicationStatusHistory.create({
        data: {
          applicationId,
          fromStatus,
          toStatus,
          changedBy,
          remarks,
        },
      }),
    ]);

    return updated;
  }
}
