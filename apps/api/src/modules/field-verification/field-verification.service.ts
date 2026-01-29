import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApplicationStatus, Role } from '@prisma/client';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface FieldReportDto {
  siteIndex: number;
  visitDate: string;
  industryName: string;
  location: string;
  apcdCondition?: string;
  apcdOperational?: boolean;
  emissionCompliant?: boolean;
  inletReading?: string;
  outletReading?: string;
  pressureDrop?: string;
  observations?: string;
  recommendation?: string;
  overallResult?: string;
}

@Injectable()
export class FieldVerificationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get field verification sites for an application
   */
  async getSitesForApplication(applicationId: string) {
    return this.prisma.fieldVerificationSite.findMany({
      where: { applicationId },
      orderBy: { slNo: 'asc' },
    });
  }

  /**
   * Add field verification site
   */
  async addSite(applicationId: string, userId: string, data: any) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.applicantId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const count = await this.prisma.fieldVerificationSite.count({
      where: { applicationId },
    });

    if (count >= 3) {
      throw new BadRequestException('Maximum 3 field verification sites allowed');
    }

    return this.prisma.fieldVerificationSite.create({
      data: {
        applicationId,
        slNo: count + 1,
        ...data,
      },
    });
  }

  /**
   * Update field verification site
   */
  async updateSite(siteId: string, userId: string, data: any) {
    const site = await this.prisma.fieldVerificationSite.findUnique({
      where: { id: siteId },
      include: { application: true },
    });

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    if (site.application.applicantId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.prisma.fieldVerificationSite.update({
      where: { id: siteId },
      data,
    });
  }

  /**
   * Delete field verification site
   */
  async deleteSite(siteId: string, userId: string) {
    const site = await this.prisma.fieldVerificationSite.findUnique({
      where: { id: siteId },
      include: { application: true },
    });

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    if (site.application.applicantId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.prisma.fieldVerificationSite.delete({
      where: { id: siteId },
    });
  }

  /**
   * Get field reports for an application
   */
  async getReportsForApplication(applicationId: string) {
    return this.prisma.fieldReport.findMany({
      where: { applicationId },
      include: {
        verifier: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { visitDate: 'desc' },
    });
  }

  /**
   * Submit field report (by field verifier)
   */
  async submitReport(applicationId: string, verifierId: string, dto: FieldReportDto) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== ApplicationStatus.FIELD_VERIFICATION) {
      throw new BadRequestException('Application is not in field verification stage');
    }

    return this.prisma.fieldReport.create({
      data: {
        applicationId,
        verifierId,
        siteIndex: dto.siteIndex,
        visitDate: new Date(dto.visitDate),
        industryName: dto.industryName,
        location: dto.location,
        apcdCondition: dto.apcdCondition,
        apcdOperational: dto.apcdOperational,
        emissionCompliant: dto.emissionCompliant,
        inletReading: dto.inletReading,
        outletReading: dto.outletReading,
        pressureDrop: dto.pressureDrop,
        observations: dto.observations,
        recommendation: dto.recommendation,
        overallResult: dto.overallResult,
      },
    });
  }

  /**
   * Get pending verifications for a field verifier
   */
  async getPendingForVerifier(verifierId: string) {
    return this.prisma.application.findMany({
      where: {
        status: ApplicationStatus.FIELD_VERIFICATION,
        fieldReports: {
          some: { verifierId },
        },
      },
      include: {
        oemProfile: {
          select: { companyName: true, fullAddress: true },
        },
        fieldVerificationSites: true,
      },
    });
  }

  /**
   * Get applications pending field verification (officer view)
   */
  async getApplicationsPendingFieldVerification() {
    return this.prisma.application.findMany({
      where: {
        status: ApplicationStatus.FIELD_VERIFICATION,
      },
      include: {
        oemProfile: {
          select: { companyName: true, fullAddress: true },
        },
        fieldVerificationSites: true,
        fieldReports: {
          include: {
            verifier: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
  }

  /**
   * Get field verifiers
   */
  async getFieldVerifiers() {
    return this.prisma.user.findMany({
      where: {
        role: Role.FIELD_VERIFIER,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });
  }
}
