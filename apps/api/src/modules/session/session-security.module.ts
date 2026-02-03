import { Module } from '@nestjs/common';

import { SessionSecurityService } from './session-security.service';

@Module({
  providers: [SessionSecurityService],
  exports: [SessionSecurityService],
})
export class SessionSecurityModule {}
