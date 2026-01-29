import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DocumentType, ApplicationStatus } from '@prisma/client';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
import * as crypto from 'crypto';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../../infrastructure/storage/minio.service';
import { GeoTagValidatorService } from './geo-tag-validator.service';

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    private geoValidator: GeoTagValidatorService,
  ) {}

  /**
   * Upload a document for an application
   */
  async upload(
    applicationId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    userId: string,
  ) {
    // Validate application ownership and status
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { attachments: true },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application.applicantId !== userId) throw new ForbiddenException();

    const editableStatuses: ApplicationStatus[] = [ApplicationStatus.DRAFT, ApplicationStatus.QUERIED];
    if (!editableStatuses.includes(application.status as ApplicationStatus)) {
      throw new BadRequestException('Cannot upload documents at this application stage');
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large. Maximum size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
      );
    }

    // Validate total upload size
    const currentTotal = application.attachments.reduce(
      (sum, a) => sum + Number(a.fileSizeBytes),
      0,
    );
    if (currentTotal + file.size > MAX_TOTAL_UPLOAD_BYTES) {
      throw new BadRequestException(
        `Total upload limit exceeded. Maximum: ${MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024}MB`,
      );
    }

    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Generate storage path
    const objectKey = MinioService.buildObjectKey(applicationId, documentType, file.originalname);

    // Extract geo-tag for photos
    let geoData: {
      geoLatitude?: number;
      geoLongitude?: number;
      geoTimestamp?: Date;
      hasValidGeoTag?: boolean;
    } = {};

    if (
      documentType === DocumentType.GEO_TAGGED_PHOTOS &&
      file.mimetype.startsWith('image/')
    ) {
      const geoResult = await this.geoValidator.extractGeoTag(file.buffer);
      geoData = {
        hasValidGeoTag: geoResult.hasValidGeoTag,
        geoLatitude: geoResult.latitude,
        geoLongitude: geoResult.longitude,
        geoTimestamp: geoResult.timestamp,
      };
    }

    // Upload to MinIO
    await this.minio.uploadFile(objectKey, file.buffer, file.mimetype);

    // Create attachment record
    return this.prisma.attachment.create({
      data: {
        applicationId,
        documentType,
        fileName: objectKey.split('/').pop() || file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        storagePath: objectKey,
        storageBucket: 'apcd-documents',
        checksum,
        uploadedBy: userId,
        virusScanStatus: 'PENDING',
        ...geoData,
      },
    });
  }

  /**
   * Get all attachments for an application
   */
  async findByApplication(applicationId: string) {
    return this.prisma.attachment.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get presigned download URL
   */
  async getDownloadUrl(attachmentId: string, userId: string, userRole: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { application: true },
    });

    if (!attachment) throw new NotFoundException('Attachment not found');

    // OEMs can only download their own attachments
    if (userRole === 'OEM' && attachment.application.applicantId !== userId) {
      throw new ForbiddenException();
    }

    return this.minio.getPresignedUrl(attachment.storagePath, 3600);
  }

  /**
   * Delete an attachment
   */
  async delete(attachmentId: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { application: true },
    });

    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.application.applicantId !== userId) throw new ForbiddenException();

    const editableStatuses2: ApplicationStatus[] = [ApplicationStatus.DRAFT, ApplicationStatus.QUERIED];
    if (!editableStatuses2.includes(attachment.application.status as ApplicationStatus)) {
      throw new BadRequestException('Cannot delete documents at this application stage');
    }

    // Delete from MinIO
    await this.minio.deleteFile(attachment.storagePath);

    // Delete record
    return this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  /**
   * Verify a document (officer action)
   */
  async verify(
    attachmentId: string,
    verifiedBy: string,
    isVerified: boolean,
    note?: string,
  ) {
    return this.prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        isVerified,
        verifiedBy,
        verifiedAt: new Date(),
        verificationNote: note,
      },
    });
  }
}
