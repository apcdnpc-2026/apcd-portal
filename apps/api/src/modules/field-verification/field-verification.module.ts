import { Module } from '@nestjs/common';

import { FieldVerificationService } from './field-verification.service';
import { FieldVerificationController } from './field-verification.controller';

@Module({
  controllers: [FieldVerificationController],
  providers: [FieldVerificationService],
  exports: [FieldVerificationService],
})
export class FieldVerificationModule {}
