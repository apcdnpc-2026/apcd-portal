import {
  Controller, Get, Post, Delete, Param, Query, Body, ParseUUIDPipe,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Role, DocumentType } from '@apcd/database';
import { MAX_FILE_SIZE_BYTES } from '@apcd/shared';

import { AttachmentsService } from './attachments.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

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
        photoSlot: { type: 'string', description: 'Required for GEO_TAGGED_PHOTOS: FRONT_VIEW, MANUFACTURING_AREA, TESTING_LAB, QC_AREA, RAW_MATERIAL_STORAGE, FINISHED_GOODS' },
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

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get presigned download URL for an attachment' })
  async getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const url = await this.attachmentsService.getDownloadUrl(id, user.sub, user.role);
    return { url };
  }

  @Delete(':id')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Delete an attachment' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
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
