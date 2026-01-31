import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { OemProfileService } from './oem-profile.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockOemProfile = {
  id: 'profile-1',
  userId: 'user-1',
  companyName: 'Test Pollution Control Pvt. Ltd.',
  fullAddress: '123, Industrial Area, Gurgaon',
  state: 'Haryana',
  country: 'India',
  pinCode: '122002',
  contactNo: '9876543210',
  gstRegistrationNo: '06AABCU9603R1ZM',
  panNo: 'AABCU9603R',
  firmType: 'PRIVATE_LIMITED',
  firmSize: 'MEDIUM',
  firmAreaSqm: 5000,
  employeeCount: 50,
  gpsLatitude: 28.4595,
  gpsLongitude: 77.0266,
  udyamRegistrationNo: null,
  isMSE: false,
  isStartup: false,
  isLocalSupplier: false,
  localContentPercent: null,
  dpiitRecognitionNo: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockCreateDto = {
  companyName: 'Test Pollution Control Pvt. Ltd.',
  fullAddress: '123, Industrial Area, Gurgaon',
  state: 'Haryana',
  pinCode: '122002',
  contactNo: '9876543210',
  gstRegistrationNo: '06AABCU9603R1ZM',
  panNo: 'AABCU9603R',
  firmType: 'PRIVATE_LIMITED' as any,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OemProfileService', () => {
  let service: OemProfileService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OemProfileService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OemProfileService>(OemProfileService);
    prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // getByUserId()
  // =========================================================================

  describe('getByUserId', () => {
    it('should return the OEM profile when it exists', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);

      const result = await service.getByUserId('user-1');

      expect(result).toEqual(mockOemProfile);
      expect(prisma.oemProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      await expect(service.getByUserId('nonexistent-user')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getByUserId('nonexistent-user')).rejects.toThrow(
        'OEM profile not found. Please create one first.',
      );
    });

    it('should call findUnique with the correct userId', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);

      await service.getByUserId('specific-user-id');

      expect(prisma.oemProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'specific-user-id' },
      });
    });

    it('should return profile with all fields intact', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);

      const result = await service.getByUserId('user-1');

      expect(result.id).toBe('profile-1');
      expect(result.companyName).toBe('Test Pollution Control Pvt. Ltd.');
      expect(result.firmType).toBe('PRIVATE_LIMITED');
      expect(result.firmSize).toBe('MEDIUM');
      expect(result.isMSE).toBe(false);
      expect(result.isStartup).toBe(false);
      expect(result.isLocalSupplier).toBe(false);
    });
  });

  // =========================================================================
  // create()
  // =========================================================================

  describe('create', () => {
    it('should create a new OEM profile successfully', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue(mockOemProfile as any);

      const result = await service.create('user-1', mockCreateDto);

      expect(result).toEqual(mockOemProfile);
      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          ...mockCreateDto,
        },
      });
    });

    it('should throw ConflictException when profile already exists', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);

      await expect(service.create('user-1', mockCreateDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create('user-1', mockCreateDto)).rejects.toThrow(
        'OEM profile already exists for this user',
      );
    });

    it('should check for existing profile before creating', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue(mockOemProfile as any);

      await service.create('user-1', mockCreateDto);

      expect(prisma.oemProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.oemProfile.create).toHaveBeenCalledTimes(1);
    });

    it('should not call create when profile already exists', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);

      await expect(service.create('user-1', mockCreateDto)).rejects.toThrow(ConflictException);

      expect(prisma.oemProfile.create).not.toHaveBeenCalled();
    });

    it('should spread dto fields into the data object', async () => {
      const dtoWithOptionals = {
        ...mockCreateDto,
        country: 'India',
        firmSize: 'LARGE' as any,
        isMSE: true,
        isStartup: false,
      };

      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue({ ...mockOemProfile, ...dtoWithOptionals } as any);

      await service.create('user-1', dtoWithOptionals);

      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          ...dtoWithOptionals,
        },
      });
    });

    it.each([
      'PROPRIETARY',
      'PRIVATE_LIMITED',
      'LIMITED_COMPANY',
      'PUBLIC_SECTOR',
      'SOCIETY',
    ])('should accept firmType %s', async (firmType) => {
      const dto = { ...mockCreateDto, firmType: firmType as any };

      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue({ ...mockOemProfile, firmType } as any);

      const result = await service.create('user-1', dto);

      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmType }),
      });
      expect(result.firmType).toBe(firmType);
    });

    it.each([
      'COTTAGE',
      'MICRO',
      'SMALL',
      'MEDIUM',
      'LARGE',
    ])('should accept firmSize %s', async (firmSize) => {
      const dto = { ...mockCreateDto, firmSize: firmSize as any };

      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue({ ...mockOemProfile, firmSize } as any);

      const result = await service.create('user-1', dto);

      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmSize }),
      });
      expect(result.firmSize).toBe(firmSize);
    });

    it('should pass empty string firmType through to Prisma without validation', async () => {
      // Note: The service does NOT validate firmType values; it delegates to Prisma.
      // An empty string would be passed to the database, which may reject it at the
      // schema level. The service layer itself does not guard against this.
      const dto = { ...mockCreateDto, firmType: '' as any };

      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue({ ...mockOemProfile, firmType: '' } as any);

      const result = await service.create('user-1', dto);

      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmType: '' }),
      });
      expect(result.firmType).toBe('');
    });

    it('should create profile with MSE and startup flags set', async () => {
      const dto = {
        ...mockCreateDto,
        isMSE: true,
        isStartup: true,
        isLocalSupplier: false,
        udyamRegistrationNo: 'UDYAM-HR-01-0012345',
        dpiitRecognitionNo: 'DPIIT12345',
      };

      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue({ ...mockOemProfile, ...dto } as any);

      const result = await service.create('user-1', dto);

      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          ...dto,
        },
      });
      expect(result.isMSE).toBe(true);
      expect(result.isStartup).toBe(true);
    });

    it('should create profile with GPS coordinates and local content', async () => {
      const dto = {
        ...mockCreateDto,
        gpsLatitude: 28.4595,
        gpsLongitude: 77.0266,
        isLocalSupplier: true,
        localContentPercent: 85,
      };

      prisma.oemProfile.findUnique.mockResolvedValue(null);
      prisma.oemProfile.create.mockResolvedValue({ ...mockOemProfile, ...dto } as any);

      await service.create('user-1', dto);

      expect(prisma.oemProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gpsLatitude: 28.4595,
          gpsLongitude: 77.0266,
          isLocalSupplier: true,
          localContentPercent: 85,
        }),
      });
    });
  });

  // =========================================================================
  // update()
  // =========================================================================

  describe('update', () => {
    it('should update an existing OEM profile', async () => {
      const updateDto = { companyName: 'Updated Company Name' };
      const updatedProfile = { ...mockOemProfile, ...updateDto };

      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);
      prisma.oemProfile.update.mockResolvedValue(updatedProfile as any);

      const result = await service.update('user-1', updateDto);

      expect(result.companyName).toBe('Updated Company Name');
      expect(prisma.oemProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: updateDto,
      });
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { companyName: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.update('nonexistent', { companyName: 'X' })).rejects.toThrow(
        'OEM profile not found',
      );
    });

    it('should check for existing profile before updating', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);
      prisma.oemProfile.update.mockResolvedValue(mockOemProfile as any);

      await service.update('user-1', {});

      expect(prisma.oemProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should not call update when profile is not found', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      await expect(service.update('user-1', {})).rejects.toThrow(NotFoundException);

      expect(prisma.oemProfile.update).not.toHaveBeenCalled();
    });

    it('should allow partial updates with only some fields', async () => {
      const partialDto = { isMSE: true, isStartup: true };

      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);
      prisma.oemProfile.update.mockResolvedValue({ ...mockOemProfile, ...partialDto } as any);

      const result = await service.update('user-1', partialDto);

      expect(prisma.oemProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: partialDto,
      });
      expect(result.isMSE).toBe(true);
      expect(result.isStartup).toBe(true);
    });

    it('should update firmType to a different valid value', async () => {
      const updateDto = { firmType: 'PROPRIETARY' as any };

      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);
      prisma.oemProfile.update.mockResolvedValue({ ...mockOemProfile, ...updateDto } as any);

      const result = await service.update('user-1', updateDto);

      expect(result.firmType).toBe('PROPRIETARY');
      expect(prisma.oemProfile.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { firmType: 'PROPRIETARY' },
      });
    });

    it('should update firmSize from MEDIUM to COTTAGE', async () => {
      const updateDto = { firmSize: 'COTTAGE' as any };

      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);
      prisma.oemProfile.update.mockResolvedValue({ ...mockOemProfile, ...updateDto } as any);

      const result = await service.update('user-1', updateDto);

      expect(result.firmSize).toBe('COTTAGE');
    });

    it('should update multiple fields at once', async () => {
      const updateDto = {
        companyName: 'New Name',
        fullAddress: '456, New Address',
        state: 'Delhi',
        isMSE: true,
        firmSize: 'SMALL' as any,
        employeeCount: 10,
      };

      prisma.oemProfile.findUnique.mockResolvedValue(mockOemProfile as any);
      prisma.oemProfile.update.mockResolvedValue({ ...mockOemProfile, ...updateDto } as any);

      const result = await service.update('user-1', updateDto);

      expect(result.companyName).toBe('New Name');
      expect(result.state).toBe('Delhi');
      expect(result.isMSE).toBe(true);
      expect(result.firmSize).toBe('SMALL');
      expect(result.employeeCount).toBe(10);
    });
  });

  // =========================================================================
  // isDiscountEligible()
  // =========================================================================

  describe('isDiscountEligible', () => {
    it('should return true when user is MSE', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: true,
        isStartup: false,
        isLocalSupplier: false,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return true when user is a startup', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: false,
        isStartup: true,
        isLocalSupplier: false,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return true when user is a local supplier', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: false,
        isStartup: false,
        isLocalSupplier: true,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return true when all three eligibility flags are set', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: true,
        isStartup: true,
        isLocalSupplier: true,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return true when isMSE and isStartup are set', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: true,
        isStartup: true,
        isLocalSupplier: false,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return true when isMSE and isLocalSupplier are set', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: true,
        isStartup: false,
        isLocalSupplier: true,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return true when isStartup and isLocalSupplier are set', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: false,
        isStartup: true,
        isLocalSupplier: true,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(true);
    });

    it('should return false when no eligibility flags are set', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue({
        ...mockOemProfile,
        isMSE: false,
        isStartup: false,
        isLocalSupplier: false,
      } as any);

      const result = await service.isDiscountEligible('user-1');

      expect(result).toBe(false);
    });

    it('should return false when profile does not exist', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      const result = await service.isDiscountEligible('nonexistent');

      expect(result).toBe(false);
    });

    it('should query by userId', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      await service.isDiscountEligible('specific-user');

      expect(prisma.oemProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'specific-user' },
      });
    });

    it('should not throw when profile is missing -- returns false gracefully', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      const result = await service.isDiscountEligible('user-no-profile');

      expect(result).toBe(false);
      expect(prisma.oemProfile.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
