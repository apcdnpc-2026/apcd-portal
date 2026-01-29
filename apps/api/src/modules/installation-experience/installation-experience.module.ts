import { Module } from '@nestjs/common';

import { InstallationExperienceService } from './installation-experience.service';
import { InstallationExperienceController } from './installation-experience.controller';

@Module({
  controllers: [InstallationExperienceController],
  providers: [InstallationExperienceService],
})
export class InstallationExperienceModule {}
