import { Module } from '@nestjs/common';

import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
