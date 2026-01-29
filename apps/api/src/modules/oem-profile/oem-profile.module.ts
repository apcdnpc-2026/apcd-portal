import { Module } from '@nestjs/common';

import { OemProfileService } from './oem-profile.service';
import { OemProfileController } from './oem-profile.controller';

@Module({
  controllers: [OemProfileController],
  providers: [OemProfileService],
  exports: [OemProfileService],
})
export class OemProfileModule {}
