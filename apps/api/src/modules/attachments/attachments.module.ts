import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ExifValidationPipelineService } from './exif-validation-pipeline.service';
import { GeoTagValidatorService } from './geo-tag-validator.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(), // Store in memory for MinIO upload
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, GeoTagValidatorService, ExifValidationPipelineService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
