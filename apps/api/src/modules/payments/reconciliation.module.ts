import { Module } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [AuditLogModule],
  providers: [ReconciliationService, PrismaService],
  controllers: [ReconciliationController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
