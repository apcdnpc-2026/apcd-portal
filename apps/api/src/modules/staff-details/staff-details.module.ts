import { Module } from '@nestjs/common';

import { StaffDetailsService } from './staff-details.service';
import { StaffDetailsController } from './staff-details.controller';

@Module({
  controllers: [StaffDetailsController],
  providers: [StaffDetailsService],
})
export class StaffDetailsModule {}
