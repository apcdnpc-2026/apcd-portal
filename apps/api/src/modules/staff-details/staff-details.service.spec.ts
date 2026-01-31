import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { StaffDetailsService } from './staff-details.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockApplication = {
  id: 'app-1',
  applicantId: 'user-1',
  status: 'DRAFT',
};

const mockStaffDetail = {
  id: 'staff-1',
  applicationId: 'app-1',
  name: 'John Doe',
  designation: 'Engineer',
  qualification: 'B.Tech',
  experienceYears: 5,
  employeeId: 'EMP-001',
  isFieldVisitCoordinator: false,
  mobileNo: '9999999999',
  sortOrder: 1,
};

const mockStaffDto = {
  name: 'John Doe',
  designation: 'Engineer',
  qualification: 'B.Tech',
  experienceYears: 5,
  employeeId: 'EMP-001',
  isFieldVisitCoordinator: false,
  mobileNo: '9999999999',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('StaffDetailsService', () => {
  let service: StaffDetailsService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffDetailsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StaffDetailsService>(StaffDetailsService);
    prisma = mockPrisma;

    prisma.$transaction.mockImplementation(async (args: any) => {
      if (Array.isArray(args)) return Promise.all(args);
      return args(prisma);
    });
  });

  // =========================================================================
  // findByApplication()
  // =========================================================================

  describe('findByApplication', () => {
    it('should return staff details ordered by sortOrder', async () => {
      const staffList = [mockStaffDetail, { ...mockStaffDetail, id: 'staff-2', sortOrder: 2 }];
      prisma.staffDetail.findMany.mockResolvedValue(staffList as any);

      const result = await service.findByApplication('app-1');

      expect(result).toEqual(staffList);
      expect(prisma.staffDetail.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should return empty array when no staff details exist', async () => {
      prisma.staffDetail.findMany.mockResolvedValue([]);

      const result = await service.findByApplication('app-1');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // create()
  // =========================================================================

  describe('create', () => {
    it('should create staff detail with correct sortOrder', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.staffDetail.count.mockResolvedValue(2);
      prisma.staffDetail.create.mockResolvedValue({
        ...mockStaffDetail,
        sortOrder: 3,
      } as any);

      const result = await service.create('app-1', 'user-1', mockStaffDto);

      expect(prisma.staffDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          name: 'John Doe',
          sortOrder: 3,
        }),
      });
      expect(result.sortOrder).toBe(3);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.create('bad-id', 'user-1', mockStaffDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.create('app-1', 'other-user', mockStaffDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should default isFieldVisitCoordinator to false when not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.staffDetail.count.mockResolvedValue(0);
      prisma.staffDetail.create.mockResolvedValue(mockStaffDetail as any);

      const dtoWithoutCoordinator = { ...mockStaffDto };
      delete (dtoWithoutCoordinator as any).isFieldVisitCoordinator;

      await service.create('app-1', 'user-1', dtoWithoutCoordinator);

      expect(prisma.staffDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isFieldVisitCoordinator: false,
        }),
      });
    });
  });

  // =========================================================================
  // update()
  // =========================================================================

  describe('update', () => {
    it('should update staff detail fields', async () => {
      prisma.staffDetail.findUnique.mockResolvedValue({
        ...mockStaffDetail,
        application: mockApplication,
      } as any);
      prisma.staffDetail.update.mockResolvedValue({
        ...mockStaffDetail,
        name: 'Jane Doe',
      } as any);

      const result = await service.update('staff-1', 'user-1', { name: 'Jane Doe' });

      expect(prisma.staffDetail.update).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
        data: { name: 'Jane Doe' },
      });
      expect(result.name).toBe('Jane Doe');
    });

    it('should throw NotFoundException when staff detail does not exist', async () => {
      prisma.staffDetail.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.staffDetail.findUnique.mockResolvedValue({
        ...mockStaffDetail,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.update('staff-1', 'user-1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe('delete', () => {
    it('should delete the staff detail', async () => {
      prisma.staffDetail.findUnique.mockResolvedValue({
        ...mockStaffDetail,
        application: mockApplication,
      } as any);
      prisma.staffDetail.delete.mockResolvedValue(mockStaffDetail as any);

      const result = await service.delete('staff-1', 'user-1');

      expect(prisma.staffDetail.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
      expect(result).toEqual(mockStaffDetail);
    });

    it('should throw NotFoundException when staff detail does not exist', async () => {
      prisma.staffDetail.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.staffDetail.findUnique.mockResolvedValue({
        ...mockStaffDetail,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.delete('staff-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // bulkCreate()
  // =========================================================================

  describe('bulkCreate', () => {
    it('should delete existing staff and create new ones with correct sortOrder', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.staffDetail.deleteMany.mockResolvedValue({ count: 1 } as any);
      prisma.staffDetail.createMany.mockResolvedValue({ count: 2 } as any);

      const staffList = [mockStaffDto, { ...mockStaffDto, name: 'Jane Doe' }];
      await service.bulkCreate('app-1', 'user-1', staffList);

      expect(prisma.staffDetail.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
      });
      expect(prisma.staffDetail.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ applicationId: 'app-1', sortOrder: 1, name: 'John Doe' }),
          expect.objectContaining({ applicationId: 'app-1', sortOrder: 2, name: 'Jane Doe' }),
        ]),
      });
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
  });

  // =========================================================================
  // reorder()
  // =========================================================================

  describe('reorder', () => {
    it('should update sortOrder for each staff detail in a transaction', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.staffDetail.update.mockResolvedValue(mockStaffDetail as any);
      prisma.staffDetail.findMany.mockResolvedValue([
        { ...mockStaffDetail, sortOrder: 1 },
        { ...mockStaffDetail, id: 'staff-2', sortOrder: 2 },
      ] as any);

      const result = await service.reorder('app-1', 'user-1', ['staff-2', 'staff-1']);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.reorder('bad-id', 'user-1', [])).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.reorder('app-1', 'other-user', [])).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
