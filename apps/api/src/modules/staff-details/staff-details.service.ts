import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface StaffDetailDto {
  name: string;
  designation: string;
  qualification: string;
  experienceYears: number;
  employeeId?: string;
  isFieldVisitCoordinator?: boolean;
  mobileNo?: string;
}

@Injectable()
export class StaffDetailsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all staff details for an application (Annexure 7)
   */
  async findByApplication(applicationId: string) {
    return this.prisma.staffDetail.findMany({
      where: { applicationId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Add staff detail to application
   */
  async create(applicationId: string, userId: string, dto: StaffDetailDto) {
    await this.validateOwnership(applicationId, userId);

    const count = await this.prisma.staffDetail.count({ where: { applicationId } });

    return this.prisma.staffDetail.create({
      data: {
        applicationId,
        name: dto.name,
        designation: dto.designation,
        qualification: dto.qualification,
        experienceYears: dto.experienceYears,
        employeeId: dto.employeeId,
        isFieldVisitCoordinator: dto.isFieldVisitCoordinator || false,
        mobileNo: dto.mobileNo,
        sortOrder: count + 1,
      },
    });
  }

  /**
   * Update staff detail
   */
  async update(id: string, userId: string, dto: Partial<StaffDetailDto>) {
    const staff = await this.prisma.staffDetail.findUnique({
      where: { id },
      include: { application: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff detail not found');
    }

    if (staff.application.applicantId !== userId) {
      throw new ForbiddenException('Not authorized to update this record');
    }

    return this.prisma.staffDetail.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Delete staff detail
   */
  async delete(id: string, userId: string) {
    const staff = await this.prisma.staffDetail.findUnique({
      where: { id },
      include: { application: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff detail not found');
    }

    if (staff.application.applicantId !== userId) {
      throw new ForbiddenException('Not authorized to delete this record');
    }

    return this.prisma.staffDetail.delete({ where: { id } });
  }

  /**
   * Bulk create staff details
   */
  async bulkCreate(applicationId: string, userId: string, staffList: StaffDetailDto[]) {
    await this.validateOwnership(applicationId, userId);

    // Delete existing staff details
    await this.prisma.staffDetail.deleteMany({ where: { applicationId } });

    // Create new staff details
    const data = staffList.map((staff, index) => ({
      applicationId,
      name: staff.name,
      designation: staff.designation,
      qualification: staff.qualification,
      experienceYears: staff.experienceYears,
      employeeId: staff.employeeId,
      isFieldVisitCoordinator: staff.isFieldVisitCoordinator || false,
      mobileNo: staff.mobileNo,
      sortOrder: index + 1,
    }));

    return this.prisma.staffDetail.createMany({ data });
  }

  /**
   * Reorder staff details
   */
  async reorder(applicationId: string, userId: string, orderedIds: string[]) {
    await this.validateOwnership(applicationId, userId);

    const updates = orderedIds.map((id, index) =>
      this.prisma.staffDetail.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    );

    await this.prisma.$transaction(updates);

    return this.findByApplication(applicationId);
  }

  private async validateOwnership(applicationId: string, userId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.applicantId !== userId) {
      throw new ForbiddenException('Not authorized');
    }
  }
}
