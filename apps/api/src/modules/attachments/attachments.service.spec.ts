import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, ApplicationStatus, DocumentType } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../../infrastructure/storage/minio.service';

import { AttachmentsService } from './attachments.service';
import { GeoTagValidatorService } from './geo-tag-validator.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockApplication = {
  id: 'app-1',
  applicantId: 'user-1',
  status: ApplicationStatus.DRAFT,
  attachments: [],
};

const mockAttachment = {
  id: 'att-1',
  applicationId: 'app-1',
  documentType: DocumentType.ISO_CERTIFICATE,
  fileName: 'cert.pdf',
  originalName: 'iso-cert.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1024,
  storagePath: 'applications/app-1/ISO_CERTIFICATE/123_cert.pdf',
  storageBucket: 'apcd-documents',
  checksum: 'abc123',
  uploadedBy: 'user-1',
  virusScanStatus: 'PENDING',
  createdAt: new Date(),
};

const createMockFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'test.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('test file content'),
  destination: '',
  filename: '',
  path: '',
  stream: null as any,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: DeepMockProxy<PrismaClient>;
  let minioService: { uploadFile: jest.Mock; getPresignedUrl: jest.Mock; deleteFile: jest.Mock };
  let geoValidator: { extractAndValidate: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();
    const mockMinio = {
      uploadFile: jest.fn().mockResolvedValue('object-key'),
      getPresignedUrl: jest.fn().mockResolvedValue('https://presigned-url.com/file'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const mockGeoValidator = {
      extractAndValidate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MinioService, useValue: mockMinio },
        { provide: GeoTagValidatorService, useValue: mockGeoValidator },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
    prisma = mockPrisma;
    minioService = mockMinio;
    geoValidator = mockGeoValidator;
  });

  // =========================================================================
  // upload()
  // =========================================================================

  describe('upload', () => {
    it('should upload a PDF document successfully', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile();
      const result = await service.upload(
        'app-1',
        DocumentType.ISO_CERTIFICATE,
        file,
        'user-1',
      );

      expect(minioService.uploadFile).toHaveBeenCalled();
      expect(prisma.attachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          documentType: DocumentType.ISO_CERTIFICATE,
          mimeType: 'application/pdf',
          uploadedBy: 'user-1',
          virusScanStatus: 'PENDING',
        }),
      });
    });

    it('should upload an image document successfully', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile({
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      await service.upload('app-1', DocumentType.ISO_CERTIFICATE, file, 'user-1');

      expect(minioService.uploadFile).toHaveBeenCalled();
    });

    it('should validate geo-tag for GEO_TAGGED_PHOTOS document type', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.findFirst.mockResolvedValue(null);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      geoValidator.extractAndValidate.mockResolvedValue({
        hasGps: true,
        hasTimestamp: true,
        hasValidGeoTag: true,
        latitude: 28.6139,
        longitude: 77.209,
        timestamp: new Date('2025-01-01'),
        isWithinIndia: true,
      });

      const file = createMockFile({
        mimetype: 'image/jpeg',
        originalname: 'factory.jpg',
      });

      await service.upload(
        'app-1',
        DocumentType.GEO_TAGGED_PHOTOS,
        file,
        'user-1',
        'front_view',
      );

      expect(geoValidator.extractAndValidate).toHaveBeenCalledWith(file.buffer);
      expect(prisma.attachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hasValidGeoTag: true,
          geoLatitude: 28.6139,
          geoLongitude: 77.209,
          isWithinIndia: true,
          photoSlot: 'front_view',
        }),
      });
    });

    it('should throw BadRequestException when geo-tagged photo has no GPS', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.findFirst.mockResolvedValue(null);

      geoValidator.extractAndValidate.mockResolvedValue({
        hasGps: false,
        hasTimestamp: true,
        hasValidGeoTag: false,
        error: 'GPS coordinates not found in image EXIF data.',
      });

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1', 'front_view'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when photoSlot is missing for geo-tagged photos', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid mime type', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ mimetype: 'application/zip' });

      await expect(
        service.upload('app-1', DocumentType.ISO_CERTIFICATE, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file exceeds 10MB', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ size: 11 * 1024 * 1024 });

      await expect(
        service.upload('app-1', DocumentType.ISO_CERTIFICATE, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when total upload exceeds 100MB', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        attachments: [{ fileSizeBytes: 95 * 1024 * 1024 }],
      } as any);

      const file = createMockFile({ size: 6 * 1024 * 1024 });

      await expect(
        service.upload('app-1', DocumentType.ISO_CERTIFICATE, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      const file = createMockFile();

      await expect(
        service.upload('bad-id', DocumentType.ISO_CERTIFICATE, file, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile();

      await expect(
        service.upload('app-1', DocumentType.ISO_CERTIFICATE, file, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when application is not in editable status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      const file = createMockFile();

      await expect(
        service.upload('app-1', DocumentType.ISO_CERTIFICATE, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // findByApplication()
  // =========================================================================

  describe('findByApplication', () => {
    it('should return attachments ordered by createdAt desc', async () => {
      const attachments = [mockAttachment, { ...mockAttachment, id: 'att-2' }];
      prisma.attachment.findMany.mockResolvedValue(attachments as any);

      const result = await service.findByApplication('app-1');

      expect(prisma.attachment.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // getDownloadUrl()
  // =========================================================================

  describe('getDownloadUrl', () => {
    it('should return presigned URL for authorized OEM user', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: mockApplication,
      } as any);

      const result = await service.getDownloadUrl('att-1', 'user-1', 'OEM');

      expect(minioService.getPresignedUrl).toHaveBeenCalledWith(
        mockAttachment.storagePath,
        3600,
      );
      expect(result).toBe('https://presigned-url.com/file');
    });

    it('should throw ForbiddenException when OEM tries to access another users attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.getDownloadUrl('att-1', 'user-1', 'OEM')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow OFFICER to download any attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      const result = await service.getDownloadUrl('att-1', 'officer-1', 'OFFICER');

      expect(result).toBe('https://presigned-url.com/file');
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.getDownloadUrl('bad-id', 'user-1', 'OEM')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe('delete', () => {
    it('should delete attachment in DRAFT status', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: mockApplication,
      } as any);
      prisma.attachment.delete.mockResolvedValue(mockAttachment as any);

      await service.delete('att-1', 'user-1');

      expect(minioService.deleteFile).toHaveBeenCalledWith(mockAttachment.storagePath);
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });

    it('should throw BadRequestException when application is in non-editable status', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, status: ApplicationStatus.SUBMITTED },
      } as any);

      await expect(service.delete('att-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.delete('att-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // verify()
  // =========================================================================

  describe('verify', () => {
    it('should update attachment verification status', async () => {
      prisma.attachment.update.mockResolvedValue({
        ...mockAttachment,
        isVerified: true,
        verifiedBy: 'officer-1',
        verifiedAt: expect.any(Date),
      } as any);

      await service.verify('att-1', 'officer-1', true, 'Looks good');

      expect(prisma.attachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          isVerified: true,
          verifiedBy: 'officer-1',
          verifiedAt: expect.any(Date),
          verificationNote: 'Looks good',
        },
      });
    });

    it('should mark attachment as not verified with a note', async () => {
      prisma.attachment.update.mockResolvedValue({
        ...mockAttachment,
        isVerified: false,
        verifiedBy: 'officer-1',
      } as any);

      await service.verify('att-1', 'officer-1', false, 'Document is blurry');

      expect(prisma.attachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: expect.objectContaining({
          isVerified: false,
          verificationNote: 'Document is blurry',
        }),
      });
    });
  });
});
