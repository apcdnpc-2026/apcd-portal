import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { GeoTagValidatorService } from './geo-tag-validator.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(), // Store in memory for MinIO upload
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, GeoTagValidatorService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
