import { Role, DocumentType } from '@apcd/database';
import { MAX_FILE_SIZE_BYTES } from '@apcd/shared';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';

import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MinioService } from '../../infrastructure/storage/minio.service';

import { AttachmentsService } from './attachments.service';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private attachmentsService: AttachmentsService,
    private minioService: MinioService,
  ) {}

  @Post('upload')
  @Roles(Role.OEM)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        applicationId: { type: 'string' },
        documentType: { type: 'string' },
        photoSlot: {
          type: 'string',
          description:
            'Required for GEO_TAGGED_PHOTOS: FRONT_VIEW, MANUFACTURING_AREA, TESTING_LAB, QC_AREA, RAW_MATERIAL_STORAGE, FINISHED_GOODS',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a document for an application' })
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES }),
          new FileTypeValidator({ fileType: /(pdf|jpeg|jpg|png)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('applicationId') applicationId: string,
    @Body('documentType') documentType: DocumentType,
    @Body('photoSlot') photoSlot: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentsService.upload(applicationId, documentType, file, user.sub, photoSlot);
  }

  @Get('application/:applicationId')
  @ApiOperation({ summary: 'Get all attachments for an application' })
  async findByApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string) {
    return this.attachmentsService.findByApplication(applicationId);
  }

  // Serve locally stored files — must be defined BEFORE :id routes to avoid
  // NestJS matching "local" as a UUID parameter
  @Get('local/download')
  @ApiOperation({ summary: 'Serve locally stored files (fallback when MinIO unavailable)' })
  async serveLocalFile(@Query('path') objectPath: string, @Res() res: Response) {
    try {
      if (!objectPath) {
        res.status(400).json({ message: 'Missing path parameter' });
        return;
      }
      const objectName = decodeURIComponent(objectPath);
      const buffer = await this.minioService.getFile(objectName);
      const ext = objectName.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      res.set('Content-Type', mimeTypes[ext || ''] || 'application/octet-stream');
      res.set('Content-Disposition', `inline; filename="${objectName.split('/').pop()}"`);
      res.send(buffer);
    } catch {
      res.status(404).json({ message: 'File not found' });
    }
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get presigned download URL for an attachment' })
  async getDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const url = await this.attachmentsService.getDownloadUrl(id, user.sub, user.role);
    return { url };
  }

  @Delete(':id')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Delete an attachment' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.attachmentsService.delete(id, user.sub);
  }

  @Post(':id/verify')
  @Roles(Role.OFFICER, Role.ADMIN)
  @ApiOperation({ summary: 'Verify an attachment (officer)' })
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isVerified') isVerified: boolean,
    @Body('note') note: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentsService.verify(id, user.sub, isVerified, note);
  }
}
