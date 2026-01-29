import { Module } from '@nestjs/common';

import { ApcdTypesService } from './apcd-types.service';
import { ApcdTypesController } from './apcd-types.controller';

@Module({
  controllers: [ApcdTypesController],
  providers: [ApcdTypesService],
  exports: [ApcdTypesService],
})
export class ApcdTypesModule {}
