import * as crypto from 'crypto';

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

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../../infrastructure/storage/minio.service';

import {
  ExifValidationPipelineService,
  ValidationContext,
  FullValidationResult,
} from './exif-validation-pipeline.service';
import { GeoTagValidatorService } from './geo-tag-validator.service';

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    private geoValidator: GeoTagValidatorService,
    private exifPipeline: ExifValidationPipelineService,
  ) {}

  /**
   * Upload a document for an application
   */
  async upload(
    applicationId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    userId: string,
    photoSlot?: string,
  ) {
    // Validate application ownership and status
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { attachments: { omit: { fileData: true } } },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application.applicantId !== userId) throw new ForbiddenException();

    const editableStatuses: ApplicationStatus[] = [
      ApplicationStatus.DRAFT,
      ApplicationStatus.QUERIED,
    ];
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

    // Extract and validate geo-tag for factory photos / field photos
    let geoData: Record<string, unknown> = {};
    let exifValidationResult: FullValidationResult | null = null;

    const isGeoTaggedType =
      documentType === DocumentType.GEO_TAGGED_PHOTOS || documentType === DocumentType.FIELD_PHOTOS;

    if (isGeoTaggedType && file.mimetype.startsWith('image/')) {
      if (documentType === DocumentType.GEO_TAGGED_PHOTOS && !photoSlot) {
        throw new BadRequestException('photoSlot is required for geo-tagged factory photos');
      }

      // Check for duplicate slot (only for GEO_TAGGED_PHOTOS)
      if (documentType === DocumentType.GEO_TAGGED_PHOTOS && photoSlot) {
        const existing = await this.prisma.attachment.findFirst({
          where: { applicationId, documentType, photoSlot },
        });
        if (existing) {
          throw new BadRequestException(
            `A photo for slot "${photoSlot}" already exists. Delete the existing one first.`,
          );
        }
      }

      // Build validation context
      const validationContext: ValidationContext = {
        verificationType: documentType === DocumentType.FIELD_PHOTOS ? 'FIELD_VERIFICATION' : 'OEM',
      };

      // Run the enhanced EXIF validation pipeline
      exifValidationResult = await this.exifPipeline.validate(file.buffer, validationContext);

      if (!exifValidationResult.hasGps || !exifValidationResult.hasTimestamp) {
        throw new BadRequestException(
          exifValidationResult.error ||
            'Photo must contain both GPS coordinates and a timestamp in EXIF data. Use a Timestamp Camera app.',
        );
      }

      geoData = {
        hasValidGeoTag: true,
        geoLatitude: exifValidationResult.latitude,
        geoLongitude: exifValidationResult.longitude,
        geoTimestamp: exifValidationResult.geoTimestamp,
        isWithinIndia: exifValidationResult.isWithinIndia,
        ...(photoSlot ? { photoSlot } : {}),
      };
    }

    // Upload to MinIO / local storage
    await this.minio.uploadFile(objectKey, file.buffer, file.mimetype);

    // Create attachment record — also store file bytes in DB so files survive
    // ephemeral container restarts (Railway, etc.)
    const attachment = await this.prisma.attachment.create({
      data: {
        applicationId,
        documentType,
        fileName: objectKey.split('/').pop() || file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        storagePath: objectKey,
        storageBucket: 'apcd-documents',
        fileData: new Uint8Array(file.buffer),
        checksum,
        uploadedBy: userId,
        virusScanStatus: 'PENDING',
        ...geoData,
      },
    });

    // Create ExifMetadata record if we ran the validation pipeline
    if (exifValidationResult && exifValidationResult.extractionSuccess) {
      try {
        await this.prisma.exifMetadata.create({
          data: {
            attachmentId: attachment.id,
            gpsLatitude: exifValidationResult.latitude ?? null,
            gpsLongitude: exifValidationResult.longitude ?? null,
            gpsAltitude: exifValidationResult.exif.altitude ?? null,
            gpsAccuracyM: exifValidationResult.exif.gpsAccuracyM ?? null,
            dateTimeOriginal: exifValidationResult.exif.dateTimeOriginal ?? null,
            dateTimeDigitized: exifValidationResult.exif.dateTimeDigitized ?? null,
            dateTimeModified: exifValidationResult.exif.dateTime ?? null,
            cameraMake: exifValidationResult.exif.make ?? null,
            cameraModel: exifValidationResult.exif.model ?? null,
            software: exifValidationResult.exif.software ?? null,
            distanceFromFactoryM: exifValidationResult.geo.distanceFromFactoryM ?? null,
            isWithinProximity: exifValidationResult.geo.isWithinProximity ?? null,
            gpsAccuracyGrade: this.exifPipeline.assessGpsAccuracy(
              exifValidationResult.exif.gpsAccuracyM,
            ),
            timestampAgeHours: exifValidationResult.timestamp.ageHours ?? null,
            softwareRiskLevel: exifValidationResult.antiSpoofing.softwareRiskLevel,
            overallTrustScore: exifValidationResult.trustScore,
            spoofingFlags:
              exifValidationResult.flags.length > 0
                ? JSON.parse(JSON.stringify(exifValidationResult.flags))
                : undefined,
            clientLatitude: null,
            clientLongitude: null,
            clientExifDistM: exifValidationResult.antiSpoofing.clientExifDistanceM ?? null,
          },
        });
      } catch (error: unknown) {
        this.logger.warn(
          `ExifMetadata creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return attachment;
  }

  /**
   * Get all attachments for an application (excludes file blob data)
   */
  async findByApplication(applicationId: string) {
    return this.prisma.attachment.findMany({
      where: { applicationId },
      omit: { fileData: true },
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

    const editableStatuses2: ApplicationStatus[] = [
      ApplicationStatus.DRAFT,
      ApplicationStatus.QUERIED,
    ];
    if (!editableStatuses2.includes(attachment.application.status as ApplicationStatus)) {
      throw new BadRequestException('Cannot delete documents at this application stage');
    }

    // Delete from MinIO
    await this.minio.deleteFile(attachment.storagePath);

    // Delete record
    return this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  /**
   * Retrieve file content from the database by storage path.
   * Used as fallback when local/MinIO storage is unavailable (e.g. container restart).
   */
  async getFileDataFromDb(storagePath: string): Promise<Buffer | null> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { storagePath },
      select: { fileData: true },
    });
    if (!attachment?.fileData) return null;
    return Buffer.from(attachment.fileData);
  }

  /**
   * Check if a file exists in storage (admin diagnostic)
   */
  async checkFileExists(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) throw new NotFoundException('Attachment not found');

    try {
      const info = await this.minio.getFileInfo(attachment.storagePath);
      return {
        exists: true,
        storagePath: attachment.storagePath,
        storageType: this.minio.isAvailable() ? 'minio' : 'local',
        sizeBytes: info.size,
      };
    } catch {
      return {
        exists: false,
        storagePath: attachment.storagePath,
        storageType: this.minio.isAvailable() ? 'minio' : 'local',
        localStoragePath: this.minio.getLocalStoragePath(),
      };
    }
  }

  /**
   * Verify a document (officer action)
   */
  async verify(attachmentId: string, verifiedBy: string, isVerified: boolean, note?: string) {
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
