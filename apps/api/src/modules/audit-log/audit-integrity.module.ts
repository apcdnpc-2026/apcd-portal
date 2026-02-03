import { Module } from '@nestjs/common';

import { AlertRulesService } from './alert-rules.service';
import { AuditIntegrityController } from './audit-integrity.controller';
import { AuditIntegrityService } from './audit-integrity.service';

@Module({
  controllers: [AuditIntegrityController],
  providers: [AuditIntegrityService, AlertRulesService],
  exports: [AuditIntegrityService, AlertRulesService],
})
export class AuditIntegrityModule {}
