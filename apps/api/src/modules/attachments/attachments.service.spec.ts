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
  documentType: DocumentType.COMPANY_REGISTRATION,
  fileName: 'cert.pdf',
  originalName: 'company-reg.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1024,
  storagePath: 'applications/app-1/COMPANY_REGISTRATION/123_cert.pdf',
  storageBucket: 'apcd-documents',
  checksum: 'abc123',
  uploadedBy: 'user-1',
  virusScanStatus: 'PENDING',
  createdAt: new Date(),
  fileData: null,
  hasValidGeoTag: null,
  geoLatitude: null,
  geoLongitude: null,
  geoTimestamp: null,
  isWithinIndia: null,
  photoSlot: null,
  isVerified: null,
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
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
  let minioService: {
    uploadFile: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
    getFileInfo: jest.Mock;
    isAvailable: jest.Mock;
    getLocalStoragePath: jest.Mock;
  };
  let geoValidator: { extractAndValidate: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();
    const mockMinio = {
      uploadFile: jest.fn().mockResolvedValue('object-key'),
      getPresignedUrl: jest.fn().mockResolvedValue('https://presigned-url.com/file'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getFileInfo: jest.fn().mockResolvedValue({ size: 1024 }),
      isAvailable: jest.fn().mockReturnValue(true),
      getLocalStoragePath: jest.fn().mockReturnValue('/tmp/uploads'),
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
      await service.upload(
        'app-1',
        DocumentType.COMPANY_REGISTRATION,
        file,
        'user-1',
      );

      expect(minioService.uploadFile).toHaveBeenCalled();
      expect(prisma.attachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          documentType: DocumentType.COMPANY_REGISTRATION,
          mimeType: 'application/pdf',
          fileSizeBytes: 1024,
          storageBucket: 'apcd-documents',
          uploadedBy: 'user-1',
          virusScanStatus: 'PENDING',
        }),
      });
    });

    it('should upload successfully when application status is QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.QUERIED,
      } as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile();
      await service.upload(
        'app-1',
        DocumentType.GST_CERTIFICATE,
        file,
        'user-1',
      );

      expect(minioService.uploadFile).toHaveBeenCalled();
      expect(prisma.attachment.create).toHaveBeenCalled();
    });

    it('should upload an image document successfully', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile({
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      });

      await service.upload('app-1', DocumentType.PAN_CARD, file, 'user-1');

      expect(minioService.uploadFile).toHaveBeenCalled();
    });

    it('should calculate SHA-256 checksum and store fileData as Uint8Array', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile();
      await service.upload(
        'app-1',
        DocumentType.COMPANY_REGISTRATION,
        file,
        'user-1',
      );

      const createCall = prisma.attachment.create.mock.calls[0][0];
      expect(createCall.data.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(createCall.data.fileData).toBeInstanceOf(Uint8Array);
    });

    // --- Error: application not found ---
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      const file = createMockFile();

      await expect(
        service.upload('bad-id', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    // --- Error: wrong owner ---
    it('should throw ForbiddenException when user is not the application owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile();

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    // --- Error: non-editable status ---
    it('should throw BadRequestException when application status is SUBMITTED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      const file = createMockFile();

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application status is UNDER_REVIEW', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.UNDER_REVIEW,
      } as any);

      const file = createMockFile();

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    // --- Error: invalid mime type ---
    it('should throw BadRequestException for invalid mime type (application/exe)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ mimetype: 'application/exe' });

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for zip mime type', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ mimetype: 'application/zip' });

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    // --- Error: file too large ---
    it('should throw BadRequestException when file exceeds 10MB', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ size: 11 * 1024 * 1024 });

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow a file exactly at 10MB', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile({ size: 10 * 1024 * 1024 });

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).resolves.toBeDefined();
    });

    // --- Error: total upload limit exceeded ---
    it('should throw BadRequestException when total upload exceeds 100MB', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        attachments: [{ fileSizeBytes: 95 * 1024 * 1024 }],
      } as any);

      const file = createMockFile({ size: 6 * 1024 * 1024 });

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow upload when total is exactly at 100MB limit', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        attachments: [{ fileSizeBytes: 90 * 1024 * 1024 }],
      } as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile({ size: 10 * 1024 * 1024 });

      await expect(
        service.upload('app-1', DocumentType.COMPANY_REGISTRATION, file, 'user-1'),
      ).resolves.toBeDefined();
    });

    // --- GEO_TAGGED_PHOTOS: valid geo-tag ---
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

    // --- GEO_TAGGED_PHOTOS: missing photoSlot ---
    it('should throw BadRequestException when photoSlot is missing for GEO_TAGGED_PHOTOS', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    // --- GEO_TAGGED_PHOTOS: duplicate slot ---
    it('should throw BadRequestException when photoSlot already exists (duplicate slot)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.findFirst.mockResolvedValue({
        ...mockAttachment,
        documentType: DocumentType.GEO_TAGGED_PHOTOS,
        photoSlot: 'front_view',
      } as any);

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1', 'front_view'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include slot name in error message for duplicate slot', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.findFirst.mockResolvedValue({
        ...mockAttachment,
        documentType: DocumentType.GEO_TAGGED_PHOTOS,
        photoSlot: 'front_view',
      } as any);

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1', 'front_view'),
      ).rejects.toThrow(/front_view/);
    });

    // --- GEO_TAGGED_PHOTOS: no GPS in EXIF ---
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

    it('should throw BadRequestException when geo-tagged photo has no timestamp', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.findFirst.mockResolvedValue(null);

      geoValidator.extractAndValidate.mockResolvedValue({
        hasGps: true,
        hasTimestamp: false,
        hasValidGeoTag: false,
        error: 'Timestamp not found in image EXIF data.',
      });

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1', 'front_view'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when geo-tagged photo has neither GPS nor timestamp', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.findFirst.mockResolvedValue(null);

      geoValidator.extractAndValidate.mockResolvedValue({
        hasGps: false,
        hasTimestamp: false,
        hasValidGeoTag: false,
        error: 'Photo has no GPS coordinates or timestamp. Use a Timestamp Camera app.',
      });

      const file = createMockFile({ mimetype: 'image/jpeg' });

      await expect(
        service.upload('app-1', DocumentType.GEO_TAGGED_PHOTOS, file, 'user-1', 'front_view'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not run geo-validation for GEO_TAGGED_PHOTOS with non-image mime type', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.attachment.create.mockResolvedValue(mockAttachment as any);

      const file = createMockFile({
        mimetype: 'application/pdf',
        originalname: 'factory_layout.pdf',
      });

      await service.upload(
        'app-1',
        DocumentType.GEO_TAGGED_PHOTOS,
        file,
        'user-1',
      );

      expect(geoValidator.extractAndValidate).not.toHaveBeenCalled();
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
        omit: { fileData: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no attachments exist', async () => {
      prisma.attachment.findMany.mockResolvedValue([]);

      const result = await service.findByApplication('app-no-attachments');

      expect(result).toEqual([]);
      expect(prisma.attachment.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-no-attachments' },
        omit: { fileData: true },
        orderBy: { createdAt: 'desc' },
      });
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

    it('should throw ForbiddenException when OEM tries to access another user\'s attachment', async () => {
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

    it('should allow ADMIN to download any attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      const result = await service.getDownloadUrl('att-1', 'admin-1', 'ADMIN');

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
    it('should delete attachment when application is in DRAFT status', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: mockApplication,
      } as any);
      prisma.attachment.delete.mockResolvedValue(mockAttachment as any);

      await service.delete('att-1', 'user-1');

      expect(minioService.deleteFile).toHaveBeenCalledWith(mockAttachment.storagePath);
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });

    it('should delete attachment when application is in QUERIED status', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, status: ApplicationStatus.QUERIED },
      } as any);
      prisma.attachment.delete.mockResolvedValue(mockAttachment as any);

      await service.delete('att-1', 'user-1');

      expect(minioService.deleteFile).toHaveBeenCalledWith(mockAttachment.storagePath);
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the application owner', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.delete('att-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when application status is SUBMITTED', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, status: ApplicationStatus.SUBMITTED },
      } as any);

      await expect(service.delete('att-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application status is UNDER_REVIEW', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: { ...mockApplication, status: ApplicationStatus.UNDER_REVIEW },
      } as any);

      await expect(service.delete('att-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should not delete from database if MinIO delete fails', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...mockAttachment,
        application: mockApplication,
      } as any);
      minioService.deleteFile.mockRejectedValue(new Error('MinIO unavailable'));

      await expect(service.delete('att-1', 'user-1')).rejects.toThrow('MinIO unavailable');
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getFileDataFromDb()
  // =========================================================================

  describe('getFileDataFromDb', () => {
    it('should return Buffer when file data exists in database', async () => {
      const fileBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      prisma.attachment.findFirst.mockResolvedValue({
        fileData: fileBytes,
      } as any);

      const result = await service.getFileDataFromDb(
        'applications/app-1/COMPANY_REGISTRATION/123_cert.pdf',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(Buffer.from(fileBytes));
      expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
        where: { storagePath: 'applications/app-1/COMPANY_REGISTRATION/123_cert.pdf' },
        select: { fileData: true },
      });
    });

    it('should return null when no attachment matches the storage path', async () => {
      prisma.attachment.findFirst.mockResolvedValue(null);

      const result = await service.getFileDataFromDb('nonexistent/path.pdf');

      expect(result).toBeNull();
    });

    it('should return null when attachment exists but fileData is null', async () => {
      prisma.attachment.findFirst.mockResolvedValue({
        fileData: null,
      } as any);

      const result = await service.getFileDataFromDb(
        'applications/app-1/COMPANY_REGISTRATION/123_cert.pdf',
      );

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // checkFileExists()
  // =========================================================================

  describe('checkFileExists', () => {
    it('should return exists:true with file info when file is found in MinIO', async () => {
      prisma.attachment.findUnique.mockResolvedValue(mockAttachment as any);
      minioService.getFileInfo.mockResolvedValue({ size: 1024 });
      minioService.isAvailable.mockReturnValue(true);

      const result = await service.checkFileExists('att-1');

      expect(result).toEqual({
        exists: true,
        storagePath: mockAttachment.storagePath,
        storageType: 'minio',
        sizeBytes: 1024,
      });
    });

    it('should return exists:true with storageType local when MinIO is unavailable', async () => {
      prisma.attachment.findUnique.mockResolvedValue(mockAttachment as any);
      minioService.getFileInfo.mockResolvedValue({ size: 2048 });
      minioService.isAvailable.mockReturnValue(false);

      const result = await service.checkFileExists('att-1');

      expect(result).toEqual({
        exists: true,
        storagePath: mockAttachment.storagePath,
        storageType: 'local',
        sizeBytes: 2048,
      });
    });

    it('should return exists:false when file is not found in storage', async () => {
      prisma.attachment.findUnique.mockResolvedValue(mockAttachment as any);
      minioService.getFileInfo.mockRejectedValue(new Error('File not found'));
      minioService.isAvailable.mockReturnValue(true);
      minioService.getLocalStoragePath.mockReturnValue('/tmp/uploads');

      const result = await service.checkFileExists('att-1');

      expect(result).toEqual({
        exists: false,
        storagePath: mockAttachment.storagePath,
        storageType: 'minio',
        localStoragePath: '/tmp/uploads',
      });
    });

    it('should return exists:false with local storageType when MinIO unavailable and file missing', async () => {
      prisma.attachment.findUnique.mockResolvedValue(mockAttachment as any);
      minioService.getFileInfo.mockRejectedValue(new Error('File not found'));
      minioService.isAvailable.mockReturnValue(false);
      minioService.getLocalStoragePath.mockReturnValue('/tmp/uploads');

      const result = await service.checkFileExists('att-1');

      expect(result).toEqual({
        exists: false,
        storagePath: mockAttachment.storagePath,
        storageType: 'local',
        localStoragePath: '/tmp/uploads',
      });
    });

    it('should throw NotFoundException when attachment record does not exist', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.checkFileExists('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // verify()
  // =========================================================================

  describe('verify', () => {
    it('should update attachment as verified with a note', async () => {
      prisma.attachment.update.mockResolvedValue({
        ...mockAttachment,
        isVerified: true,
        verifiedBy: 'officer-1',
        verifiedAt: new Date(),
        verificationNote: 'Looks good',
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

    it('should mark attachment as not verified with rejection note', async () => {
      prisma.attachment.update.mockResolvedValue({
        ...mockAttachment,
        isVerified: false,
        verifiedBy: 'officer-1',
        verifiedAt: new Date(),
        verificationNote: 'Document is blurry',
      } as any);

      await service.verify('att-1', 'officer-1', false, 'Document is blurry');

      expect(prisma.attachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: expect.objectContaining({
          isVerified: false,
          verifiedBy: 'officer-1',
          verificationNote: 'Document is blurry',
        }),
      });
    });

    it('should set verificationNote to undefined when no note is provided', async () => {
      prisma.attachment.update.mockResolvedValue({
        ...mockAttachment,
        isVerified: true,
        verifiedBy: 'officer-1',
        verifiedAt: new Date(),
        verificationNote: undefined,
      } as any);

      await service.verify('att-1', 'officer-1', true);

      expect(prisma.attachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          isVerified: true,
          verifiedBy: 'officer-1',
          verifiedAt: expect.any(Date),
          verificationNote: undefined,
        },
      });
    });
  });
});
