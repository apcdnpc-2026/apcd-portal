import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { InstallationExperienceService } from './installation-experience.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockApplication = {
  id: 'app-1',
  applicantId: 'user-1',
  status: 'DRAFT',
};

const mockExperience = {
  id: 'exp-1',
  applicationId: 'app-1',
  industryName: 'Steel Plant A',
  location: 'Jamshedpur',
  installationDate: '2023-06-15',
  emissionSource: 'Boiler',
  apcdType: 'ESP',
  apcdCapacity: '100 MW',
  performanceResult: 'Satisfactory',
  sortOrder: 1,
};

const mockExperienceDto = {
  industryName: 'Steel Plant A',
  location: 'Jamshedpur',
  installationDate: '2023-06-15',
  emissionSource: 'Boiler',
  apcdType: 'ESP',
  apcdCapacity: '100 MW',
  performanceResult: 'Satisfactory',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('InstallationExperienceService', () => {
  let service: InstallationExperienceService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallationExperienceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InstallationExperienceService>(InstallationExperienceService);
    prisma = mockPrisma;
  });

  // =========================================================================
  // findByApplication()
  // =========================================================================

  describe('findByApplication', () => {
    it('should return experiences ordered by sortOrder', async () => {
      const experiences = [mockExperience, { ...mockExperience, id: 'exp-2', sortOrder: 2 }];
      prisma.installationExperience.findMany.mockResolvedValue(experiences as any);

      const result = await service.findByApplication('app-1');

      expect(result).toEqual(experiences);
      expect(prisma.installationExperience.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should return empty array when no experiences exist', async () => {
      prisma.installationExperience.findMany.mockResolvedValue([]);

      const result = await service.findByApplication('app-1');

      expect(result).toEqual([]);
    });

    it('should pass correct applicationId', async () => {
      prisma.installationExperience.findMany.mockResolvedValue([]);

      await service.findByApplication('custom-id');

      expect(prisma.installationExperience.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'custom-id' },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  // =========================================================================
  // create()
  // =========================================================================

  describe('create', () => {
    it('should create experience with correct sortOrder based on existing count', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.count.mockResolvedValue(3);
      prisma.installationExperience.create.mockResolvedValue({
        ...mockExperience,
        sortOrder: 4,
      } as any);

      const result = await service.create('app-1', 'user-1', mockExperienceDto);

      expect(prisma.installationExperience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          sortOrder: 4,
          industryName: 'Steel Plant A',
        }),
      });
      expect(result.sortOrder).toBe(4);
    });

    it('should set sortOrder to 1 for first experience', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.count.mockResolvedValue(0);
      prisma.installationExperience.create.mockResolvedValue({
        ...mockExperience,
        sortOrder: 1,
      } as any);

      await service.create('app-1', 'user-1', mockExperienceDto);

      expect(prisma.installationExperience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortOrder: 1,
        }),
      });
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.create('bad-id', 'user-1', mockExperienceDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.create('app-1', 'other-user', mockExperienceDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should spread all DTO fields into create data', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.count.mockResolvedValue(0);
      prisma.installationExperience.create.mockResolvedValue(mockExperience as any);

      await service.create('app-1', 'user-1', mockExperienceDto);

      expect(prisma.installationExperience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          industryName: 'Steel Plant A',
          location: 'Jamshedpur',
          installationDate: '2023-06-15',
          emissionSource: 'Boiler',
          apcdType: 'ESP',
          apcdCapacity: '100 MW',
          performanceResult: 'Satisfactory',
        }),
      });
    });
  });

  // =========================================================================
  // update()
  // =========================================================================

  describe('update', () => {
    it('should update experience fields', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue({
        ...mockExperience,
        application: mockApplication,
      } as any);
      prisma.installationExperience.update.mockResolvedValue({
        ...mockExperience,
        location: 'Mumbai',
      } as any);

      const result = await service.update('exp-1', 'user-1', { location: 'Mumbai' });

      expect(prisma.installationExperience.update).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: { location: 'Mumbai' },
      });
      expect(result.location).toBe('Mumbai');
    });

    it('should throw NotFoundException when experience does not exist', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue({
        ...mockExperience,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.update('exp-1', 'user-1', {})).rejects.toThrow(ForbiddenException);
    });

    it('should update multiple fields at once', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue({
        ...mockExperience,
        application: mockApplication,
      } as any);
      prisma.installationExperience.update.mockResolvedValue({
        ...mockExperience,
        location: 'Delhi',
        emissionSource: 'Furnace',
      } as any);

      await service.update('exp-1', 'user-1', {
        location: 'Delhi',
        emissionSource: 'Furnace',
      });

      expect(prisma.installationExperience.update).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: { location: 'Delhi', emissionSource: 'Furnace' },
      });
    });
  });

  // =========================================================================
  // bulkCreate()
  // =========================================================================

  describe('bulkCreate', () => {
    it('should delete existing entries and create new ones with correct sortOrder', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.deleteMany.mockResolvedValue({ count: 1 } as any);
      prisma.installationExperience.createMany.mockResolvedValue({ count: 2 } as any);
      prisma.installationExperience.findMany.mockResolvedValue([
        { ...mockExperience, sortOrder: 1 },
        { ...mockExperience, id: 'exp-2', sortOrder: 2, industryName: 'Plant B' },
      ] as any);

      const entries = [mockExperienceDto, { ...mockExperienceDto, industryName: 'Plant B' }];
      const result = await service.bulkCreate('app-1', 'user-1', entries);

      expect(prisma.installationExperience.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
      });
      expect(prisma.installationExperience.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ applicationId: 'app-1', sortOrder: 1 }),
          expect.objectContaining({ applicationId: 'app-1', sortOrder: 2 }),
        ]),
      });
      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.bulkCreate('bad-id', 'user-1', [])).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.bulkCreate('app-1', 'other-user', [])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should handle empty entries list', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.installationExperience.createMany.mockResolvedValue({ count: 0 } as any);
      prisma.installationExperience.findMany.mockResolvedValue([]);

      const result = await service.bulkCreate('app-1', 'user-1', []);

      expect(prisma.installationExperience.deleteMany).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return re-fetched list after bulk create', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.installationExperience.createMany.mockResolvedValue({ count: 1 } as any);
      const freshList = [{ ...mockExperience, sortOrder: 1 }];
      prisma.installationExperience.findMany.mockResolvedValue(freshList as any);

      const result = await service.bulkCreate('app-1', 'user-1', [mockExperienceDto]);

      expect(result).toEqual(freshList);
    });

    it('should assign sequential sortOrder starting from 1', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.installationExperience.createMany.mockResolvedValue({ count: 3 } as any);
      prisma.installationExperience.findMany.mockResolvedValue([]);

      const entries = [
        { ...mockExperienceDto, industryName: 'A' },
        { ...mockExperienceDto, industryName: 'B' },
        { ...mockExperienceDto, industryName: 'C' },
      ];

      await service.bulkCreate('app-1', 'user-1', entries);

      expect(prisma.installationExperience.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ industryName: 'A', sortOrder: 1 }),
          expect.objectContaining({ industryName: 'B', sortOrder: 2 }),
          expect.objectContaining({ industryName: 'C', sortOrder: 3 }),
        ]),
      });
    });

    it('should handle large bulk create (15 entries)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.installationExperience.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.installationExperience.createMany.mockResolvedValue({ count: 15 } as any);
      prisma.installationExperience.findMany.mockResolvedValue([]);

      const entries = Array.from({ length: 15 }, (_, i) => ({
        ...mockExperienceDto,
        industryName: `Plant ${i + 1}`,
      }));

      await service.bulkCreate('app-1', 'user-1', entries);

      const callArgs = prisma.installationExperience.createMany.mock.calls[0][0] as any;
      expect(callArgs.data).toHaveLength(15);
      expect(callArgs.data[14].sortOrder).toBe(15);
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe('delete', () => {
    it('should delete the experience', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue({
        ...mockExperience,
        application: mockApplication,
      } as any);
      prisma.installationExperience.delete.mockResolvedValue(mockExperience as any);

      const result = await service.delete('exp-1', 'user-1');

      expect(prisma.installationExperience.delete).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
      });
      expect(result).toEqual(mockExperience);
    });

    it('should throw NotFoundException when experience does not exist', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.installationExperience.findUnique.mockResolvedValue({
        ...mockExperience,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.delete('exp-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
