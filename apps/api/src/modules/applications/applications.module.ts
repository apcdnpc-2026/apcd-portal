import { Module } from '@nestjs/common';

import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { ApplicationValidatorService } from './application-validator.service';
import { FeeCalculatorService } from './fee-calculator.service';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationValidatorService, FeeCalculatorService],
  exports: [ApplicationsService, FeeCalculatorService],
})
export class ApplicationsModule {}
