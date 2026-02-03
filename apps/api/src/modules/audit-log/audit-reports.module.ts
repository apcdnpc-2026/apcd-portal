import { Module } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { AuditReportsController } from './audit-reports.controller';
import { AuditReportsService } from './audit-reports.service';

@Module({
  providers: [AuditReportsService, PrismaService],
  controllers: [AuditReportsController],
  exports: [AuditReportsService],
})
export class AuditReportsModule {}
