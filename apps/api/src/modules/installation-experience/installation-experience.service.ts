import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

interface InstallationExperienceDto {
  industryName: string;
  location: string;
  installationDate: string;
  emissionSource: string;
  apcdType: string;
  apcdCapacity?: string;
  performanceResult?: string;
}

@Injectable()
export class InstallationExperienceService {
  constructor(private prisma: PrismaService) {}

  async findByApplication(applicationId: string) {
    return this.prisma.installationExperience.findMany({
      where: { applicationId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(applicationId: string, userId: string, dto: InstallationExperienceDto) {
    await this.validateOwnership(applicationId, userId);

    const count = await this.prisma.installationExperience.count({ where: { applicationId } });
    return this.prisma.installationExperience.create({
      data: { ...dto, applicationId, sortOrder: count + 1 },
    });
  }

  async update(id: string, userId: string, dto: Partial<InstallationExperienceDto>) {
    const exp = await this.prisma.installationExperience.findUnique({
      where: { id },
      include: { application: true },
    });
    if (!exp) throw new NotFoundException();
    if (exp.application.applicantId !== userId) throw new ForbiddenException();

    return this.prisma.installationExperience.update({ where: { id }, data: dto });
  }

  async delete(id: string, userId: string) {
    const exp = await this.prisma.installationExperience.findUnique({
      where: { id },
      include: { application: true },
    });
    if (!exp) throw new NotFoundException();
    if (exp.application.applicantId !== userId) throw new ForbiddenException();

    return this.prisma.installationExperience.delete({ where: { id } });
  }

  private async validateOwnership(applicationId: string, userId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');
    if (app.applicantId !== userId) throw new ForbiddenException();
  }
}
