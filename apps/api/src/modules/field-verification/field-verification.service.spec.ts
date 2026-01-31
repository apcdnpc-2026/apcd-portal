import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, ApplicationStatus, Role } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { FieldVerificationService } from './field-verification.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockApplication = {
  id: 'app-1',
  applicantId: 'user-1',
  status: ApplicationStatus.DRAFT,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockFieldVerificationApplication = {
  ...mockApplication,
  status: ApplicationStatus.FIELD_VERIFICATION,
};

const mockSite = {
  id: 'site-1',
  applicationId: 'app-1',
  slNo: 1,
  industryName: 'Steel Plant',
  location: 'Jamshedpur',
  contactPerson: 'Mr. Sharma',
  contactNumber: '9999999999',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockFieldReport = {
  id: 'report-1',
  applicationId: 'app-1',
  verifierId: 'verifier-1',
  siteIndex: 1,
  visitDate: new Date('2025-06-15'),
  industryName: 'Steel Plant',
  location: 'Jamshedpur',
  apcdCondition: 'Good',
  apcdOperational: true,
  emissionCompliant: true,
  inletReading: '120 mg/Nm3',
  outletReading: '30 mg/Nm3',
  pressureDrop: '150 mmWC',
  observations: 'All OK',
  recommendation: 'APPROVED',
  overallResult: 'PASS',
  createdAt: new Date('2025-06-15'),
  updatedAt: new Date('2025-06-15'),
};

const makeMinimalReportDto = (overrides?: Record<string, unknown>) => ({
  siteIndex: 1,
  visitDate: '2025-06-15',
  industryName: 'Steel Plant',
  location: 'Jamshedpur',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FieldVerificationService', () => {
  let service: FieldVerificationService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FieldVerificationService>(FieldVerificationService);
    prisma = mockPrisma;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // getSitesForApplication()
  // =========================================================================

  describe('getSitesForApplication', () => {
    it('should return sites ordered by slNo', async () => {
      const sites = [mockSite, { ...mockSite, id: 'site-2', slNo: 2 }];
      prisma.fieldVerificationSite.findMany.mockResolvedValue(sites as any);

      const result = await service.getSitesForApplication('app-1');

      expect(result).toEqual(sites);
      expect(prisma.fieldVerificationSite.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
        orderBy: { slNo: 'asc' },
      });
    });

    it('should return empty array when no sites exist', async () => {
      prisma.fieldVerificationSite.findMany.mockResolvedValue([]);

      const result = await service.getSitesForApplication('app-no-sites');

      expect(result).toEqual([]);
      expect(prisma.fieldVerificationSite.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-no-sites' },
        orderBy: { slNo: 'asc' },
      });
    });

    it('should return a single site when only one exists', async () => {
      prisma.fieldVerificationSite.findMany.mockResolvedValue([mockSite] as any);

      const result = await service.getSitesForApplication('app-1');

      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // bulkCreateSites()
  // =========================================================================

  describe('bulkCreateSites', () => {
    it('should replace existing sites with new ones', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.deleteMany.mockResolvedValue({ count: 1 } as any);
      prisma.fieldVerificationSite.createMany.mockResolvedValue({ count: 2 } as any);
      prisma.fieldVerificationSite.findMany.mockResolvedValue([mockSite] as any);

      const sites = [
        { industryName: 'Plant A', location: 'Delhi' },
        { industryName: 'Plant B', location: 'Mumbai' },
      ];

      await service.bulkCreateSites('app-1', 'user-1', sites);

      expect(prisma.fieldVerificationSite.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
      });
      expect(prisma.fieldVerificationSite.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ applicationId: 'app-1', slNo: 1, industryName: 'Plant A' }),
          expect.objectContaining({ applicationId: 'app-1', slNo: 2, industryName: 'Plant B' }),
        ]),
      });
    });

    it('should assign sequential slNo starting from 1', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.fieldVerificationSite.createMany.mockResolvedValue({ count: 3 } as any);
      prisma.fieldVerificationSite.findMany.mockResolvedValue([] as any);

      const sites = [
        { industryName: 'A', location: 'X' },
        { industryName: 'B', location: 'Y' },
        { industryName: 'C', location: 'Z' },
      ];

      await service.bulkCreateSites('app-1', 'user-1', sites);

      const createManyCall = prisma.fieldVerificationSite.createMany.mock.calls[0][0];
      const data = createManyCall.data as any[];
      expect(data[0].slNo).toBe(1);
      expect(data[1].slNo).toBe(2);
      expect(data[2].slNo).toBe(3);
    });

    it('should allow exactly 3 sites (boundary)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.fieldVerificationSite.createMany.mockResolvedValue({ count: 3 } as any);
      prisma.fieldVerificationSite.findMany.mockResolvedValue([] as any);

      const sites = [
        { industryName: 'A', location: 'X' },
        { industryName: 'B', location: 'Y' },
        { industryName: 'C', location: 'Z' },
      ];

      await expect(service.bulkCreateSites('app-1', 'user-1', sites)).resolves.not.toThrow();
    });

    it('should throw BadRequestException when more than 3 sites provided', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const sites = [
        { industryName: 'A', location: 'A' },
        { industryName: 'B', location: 'B' },
        { industryName: 'C', location: 'C' },
        { industryName: 'D', location: 'D' },
      ];

      await expect(service.bulkCreateSites('app-1', 'user-1', sites)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.bulkCreateSites('app-1', 'user-1', sites)).rejects.toThrow(
        'Maximum 3 field verification sites allowed',
      );
    });

    it('should not call deleteMany or createMany when sites exceed limit', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const sites = [
        { industryName: 'A', location: 'A' },
        { industryName: 'B', location: 'B' },
        { industryName: 'C', location: 'C' },
        { industryName: 'D', location: 'D' },
      ];

      await expect(service.bulkCreateSites('app-1', 'user-1', sites)).rejects.toThrow();
      expect(prisma.fieldVerificationSite.deleteMany).not.toHaveBeenCalled();
      expect(prisma.fieldVerificationSite.createMany).not.toHaveBeenCalled();
    });

    it('should allow an empty sites array', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.deleteMany.mockResolvedValue({ count: 2 } as any);
      prisma.fieldVerificationSite.createMany.mockResolvedValue({ count: 0 } as any);
      prisma.fieldVerificationSite.findMany.mockResolvedValue([]);

      const result = await service.bulkCreateSites('app-1', 'user-1', []);

      expect(prisma.fieldVerificationSite.deleteMany).toHaveBeenCalled();
      expect(prisma.fieldVerificationSite.createMany).toHaveBeenCalledWith({
        data: [],
      });
      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.bulkCreateSites('bad-id', 'user-1', [])).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.bulkCreateSites('bad-id', 'user-1', [])).rejects.toThrow(
        'Application not found',
      );
    });

    it('should throw ForbiddenException when user is not the applicant (OEM authorization)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.bulkCreateSites('app-1', 'other-user', [])).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.bulkCreateSites('app-1', 'other-user', [])).rejects.toThrow(
        'Not authorized',
      );
    });

    it('should return the refreshed sites after creation', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.fieldVerificationSite.createMany.mockResolvedValue({ count: 1 } as any);

      const createdSites = [{ ...mockSite, industryName: 'New Plant' }];
      prisma.fieldVerificationSite.findMany.mockResolvedValue(createdSites as any);

      const result = await service.bulkCreateSites('app-1', 'user-1', [
        { industryName: 'New Plant', location: 'Delhi' },
      ]);

      expect(result).toEqual(createdSites);
    });

    it('should spread site data into createMany, preserving extra fields', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.fieldVerificationSite.createMany.mockResolvedValue({ count: 1 } as any);
      prisma.fieldVerificationSite.findMany.mockResolvedValue([] as any);

      const sites = [
        {
          industryName: 'Plant A',
          location: 'Delhi',
          contactPerson: 'Mr. Kumar',
          contactNumber: '8888888888',
        },
      ];

      await service.bulkCreateSites('app-1', 'user-1', sites);

      expect(prisma.fieldVerificationSite.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            applicationId: 'app-1',
            slNo: 1,
            industryName: 'Plant A',
            location: 'Delhi',
            contactPerson: 'Mr. Kumar',
            contactNumber: '8888888888',
          }),
        ],
      });
    });
  });

  // =========================================================================
  // addSite()
  // =========================================================================

  describe('addSite', () => {
    it('should add a new site with correct slNo', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.count.mockResolvedValue(1);
      prisma.fieldVerificationSite.create.mockResolvedValue({
        ...mockSite,
        id: 'site-new',
        slNo: 2,
      } as any);

      const result = await service.addSite('app-1', 'user-1', {
        industryName: 'Plant B',
        location: 'Mumbai',
      });

      expect(prisma.fieldVerificationSite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          slNo: 2,
          industryName: 'Plant B',
          location: 'Mumbai',
        }),
      });
      expect(result.slNo).toBe(2);
    });

    it('should assign slNo 1 when no sites exist', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.count.mockResolvedValue(0);
      prisma.fieldVerificationSite.create.mockResolvedValue({
        ...mockSite,
        slNo: 1,
      } as any);

      await service.addSite('app-1', 'user-1', {
        industryName: 'First Plant',
        location: 'Kolkata',
      });

      expect(prisma.fieldVerificationSite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slNo: 1 }),
      });
    });

    it('should allow adding when count is 2 (below limit)', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.count.mockResolvedValue(2);
      prisma.fieldVerificationSite.create.mockResolvedValue({
        ...mockSite,
        slNo: 3,
      } as any);

      await expect(
        service.addSite('app-1', 'user-1', { industryName: 'Plant C', location: 'Chennai' }),
      ).resolves.not.toThrow();

      expect(prisma.fieldVerificationSite.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slNo: 3 }),
      });
    });

    it('should throw BadRequestException when already 3 sites exist', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.count.mockResolvedValue(3);

      await expect(
        service.addSite('app-1', 'user-1', { industryName: 'Plant D' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addSite('app-1', 'user-1', { industryName: 'Plant D' }),
      ).rejects.toThrow('Maximum 3 field verification sites allowed');
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.addSite('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
      await expect(service.addSite('bad-id', 'user-1', {})).rejects.toThrow(
        'Application not found',
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.addSite('app-1', 'other-user', {})).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.addSite('app-1', 'other-user', {})).rejects.toThrow('Not authorized');
    });

    it('should not call count or create when application is not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.addSite('bad-id', 'user-1', {})).rejects.toThrow();
      expect(prisma.fieldVerificationSite.count).not.toHaveBeenCalled();
      expect(prisma.fieldVerificationSite.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateSite()
  // =========================================================================

  describe('updateSite', () => {
    it('should update site data', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: mockApplication,
      } as any);
      prisma.fieldVerificationSite.update.mockResolvedValue({
        ...mockSite,
        location: 'Pune',
      } as any);

      const result = await service.updateSite('site-1', 'user-1', { location: 'Pune' });

      expect(prisma.fieldVerificationSite.update).toHaveBeenCalledWith({
        where: { id: 'site-1' },
        data: { location: 'Pune' },
      });
      expect(result.location).toBe('Pune');
    });

    it('should update multiple fields at once', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: mockApplication,
      } as any);
      const updateData = {
        industryName: 'Updated Plant',
        location: 'Updated City',
        contactPerson: 'Mr. New Contact',
      };
      prisma.fieldVerificationSite.update.mockResolvedValue({
        ...mockSite,
        ...updateData,
      } as any);

      const result = await service.updateSite('site-1', 'user-1', updateData);

      expect(prisma.fieldVerificationSite.update).toHaveBeenCalledWith({
        where: { id: 'site-1' },
        data: updateData,
      });
    });

    it('should pass empty data object through to Prisma', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: mockApplication,
      } as any);
      prisma.fieldVerificationSite.update.mockResolvedValue(mockSite as any);

      await service.updateSite('site-1', 'user-1', {});

      expect(prisma.fieldVerificationSite.update).toHaveBeenCalledWith({
        where: { id: 'site-1' },
        data: {},
      });
    });

    it('should throw NotFoundException when site does not exist', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue(null);

      await expect(service.updateSite('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
      await expect(service.updateSite('bad-id', 'user-1', {})).rejects.toThrow('Site not found');
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.updateSite('site-1', 'user-1', {})).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.updateSite('site-1', 'user-1', {})).rejects.toThrow('Not authorized');
    });

    it('should include application in findUnique query', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: mockApplication,
      } as any);
      prisma.fieldVerificationSite.update.mockResolvedValue(mockSite as any);

      await service.updateSite('site-1', 'user-1', {});

      expect(prisma.fieldVerificationSite.findUnique).toHaveBeenCalledWith({
        where: { id: 'site-1' },
        include: { application: true },
      });
    });
  });

  // =========================================================================
  // deleteSite()
  // =========================================================================

  describe('deleteSite', () => {
    it('should delete the site', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: mockApplication,
      } as any);
      prisma.fieldVerificationSite.delete.mockResolvedValue(mockSite as any);

      const result = await service.deleteSite('site-1', 'user-1');

      expect(prisma.fieldVerificationSite.delete).toHaveBeenCalledWith({
        where: { id: 'site-1' },
      });
      expect(result).toEqual(mockSite);
    });

    it('should throw NotFoundException when site does not exist', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue(null);

      await expect(service.deleteSite('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.deleteSite('bad-id', 'user-1')).rejects.toThrow('Site not found');
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.deleteSite('site-1', 'user-1')).rejects.toThrow(ForbiddenException);
      await expect(service.deleteSite('site-1', 'user-1')).rejects.toThrow('Not authorized');
    });

    it('should not call delete when site is not found', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue(null);

      await expect(service.deleteSite('bad-id', 'user-1')).rejects.toThrow();
      expect(prisma.fieldVerificationSite.delete).not.toHaveBeenCalled();
    });

    it('should not call delete when authorization fails', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: { ...mockApplication, applicantId: 'someone-else' },
      } as any);

      await expect(service.deleteSite('site-1', 'user-1')).rejects.toThrow();
      expect(prisma.fieldVerificationSite.delete).not.toHaveBeenCalled();
    });

    it('should include application in findUnique query', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: mockApplication,
      } as any);
      prisma.fieldVerificationSite.delete.mockResolvedValue(mockSite as any);

      await service.deleteSite('site-1', 'user-1');

      expect(prisma.fieldVerificationSite.findUnique).toHaveBeenCalledWith({
        where: { id: 'site-1' },
        include: { application: true },
      });
    });
  });

  // =========================================================================
  // submitReport()
  // =========================================================================

  describe('submitReport', () => {
    const validDto = {
      siteIndex: 1,
      visitDate: '2025-06-15',
      industryName: 'Steel Plant',
      location: 'Jamshedpur',
      apcdCondition: 'Good',
      apcdOperational: true,
      emissionCompliant: true,
      inletReading: '120 mg/Nm3',
      outletReading: '30 mg/Nm3',
      pressureDrop: '150 mmWC',
      observations: 'All OK',
      recommendation: 'APPROVED',
      overallResult: 'PASS',
    };

    it('should create a field report when application is in FIELD_VERIFICATION status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      const result = await service.submitReport('app-1', 'verifier-1', validDto);

      expect(prisma.fieldReport.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          verifierId: 'verifier-1',
          siteIndex: 1,
          visitDate: new Date('2025-06-15'),
          industryName: 'Steel Plant',
          location: 'Jamshedpur',
          apcdCondition: 'Good',
          apcdOperational: true,
          emissionCompliant: true,
          inletReading: '120 mg/Nm3',
          outletReading: '30 mg/Nm3',
          pressureDrop: '150 mmWC',
          observations: 'All OK',
          recommendation: 'APPROVED',
          overallResult: 'PASS',
        },
      });
      expect(result).toEqual(mockFieldReport);
    });

    it('should handle visitDate in YYYY-MM-DD ISO format', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        visitDate: '2025-06-15',
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      const visitDate = createCall.data.visitDate as Date;
      expect(visitDate).toBeInstanceOf(Date);
      expect(visitDate.getFullYear()).toBe(2025);
      expect(visitDate.getMonth()).toBe(5); // June = month index 5
      expect(visitDate.getDate()).toBe(15);
    });

    it('should produce an incorrect date when visitDate is DD-MM-YYYY (date format bug)', async () => {
      // This test documents the existing bug: new Date('15-06-2025') produces
      // Invalid Date on most JS engines, similar to the raiseQuery deadline bug.
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        visitDate: '15-06-2025',
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      const visitDate = createCall.data.visitDate as Date;
      // new Date('15-06-2025') => Invalid Date in most JS engines
      expect(isNaN(visitDate.getTime())).toBe(true);
    });

    it('should produce an incorrect date when visitDate is DD/MM/YYYY (date format bug)', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        visitDate: '15/06/2025',
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      const visitDate = createCall.data.visitDate as Date;
      // new Date('15/06/2025') => Invalid Date
      expect(isNaN(visitDate.getTime())).toBe(true);
    });

    it('should handle ISO 8601 datetime string for visitDate', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        visitDate: '2025-06-15T10:30:00.000Z',
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      const visitDate = createCall.data.visitDate as Date;
      expect(visitDate).toBeInstanceOf(Date);
      expect(isNaN(visitDate.getTime())).toBe(false);
      expect(visitDate.toISOString()).toBe('2025-06-15T10:30:00.000Z');
    });

    it('should handle MM/DD/YYYY format (ambiguous US-style date)', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      // '06/15/2025' is parsed as June 15 by new Date()
      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        visitDate: '06/15/2025',
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      const visitDate = createCall.data.visitDate as Date;
      expect(isNaN(visitDate.getTime())).toBe(false);
      expect(visitDate.getMonth()).toBe(5); // June
      expect(visitDate.getDate()).toBe(15);
    });

    it('should submit report with only required fields (optional fields undefined)', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      const minimalDto = makeMinimalReportDto();

      await service.submitReport('app-1', 'verifier-1', minimalDto);

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.apcdCondition).toBeUndefined();
      expect(createCall.data.apcdOperational).toBeUndefined();
      expect(createCall.data.emissionCompliant).toBeUndefined();
      expect(createCall.data.inletReading).toBeUndefined();
      expect(createCall.data.outletReading).toBeUndefined();
      expect(createCall.data.pressureDrop).toBeUndefined();
      expect(createCall.data.observations).toBeUndefined();
      expect(createCall.data.recommendation).toBeUndefined();
      expect(createCall.data.overallResult).toBeUndefined();
    });

    it('should submit report with some optional fields set to null', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      const dto = makeMinimalReportDto({
        apcdCondition: null,
        observations: null,
        recommendation: 'APPROVED',
      });

      await service.submitReport('app-1', 'verifier-1', dto as any);

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.apcdCondition).toBeNull();
      expect(createCall.data.observations).toBeNull();
      expect(createCall.data.recommendation).toBe('APPROVED');
    });

    it('should submit report with empty string optional fields', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      const dto = makeMinimalReportDto({
        apcdCondition: '',
        inletReading: '',
        outletReading: '',
        pressureDrop: '',
        observations: '',
      });

      await service.submitReport('app-1', 'verifier-1', dto);

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.apcdCondition).toBe('');
      expect(createCall.data.inletReading).toBe('');
      expect(createCall.data.outletReading).toBe('');
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.submitReport('bad-id', 'verifier-1', makeMinimalReportDto()),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.submitReport('bad-id', 'verifier-1', makeMinimalReportDto()),
      ).rejects.toThrow('Application not found');
    });

    it('should throw BadRequestException when application is not in FIELD_VERIFICATION status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(
        service.submitReport('app-1', 'verifier-1', makeMinimalReportDto()),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.submitReport('app-1', 'verifier-1', makeMinimalReportDto()),
      ).rejects.toThrow('Application is not in field verification stage');
    });

    it.each([
      ApplicationStatus.DRAFT,
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.QUERIED,
      ApplicationStatus.RESUBMITTED,
      ApplicationStatus.COMMITTEE_REVIEW,
      ApplicationStatus.COMMITTEE_QUERIED,
      ApplicationStatus.LAB_TESTING,
      ApplicationStatus.FINAL_REVIEW,
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
    ])(
      'should throw BadRequestException when application status is %s',
      async (status) => {
        prisma.application.findUnique.mockResolvedValue({
          ...mockApplication,
          status,
        } as any);

        await expect(
          service.submitReport('app-1', 'verifier-1', makeMinimalReportDto()),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('should not throw when status is FIELD_VERIFICATION', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await expect(
        service.submitReport('app-1', 'verifier-1', makeMinimalReportDto()),
      ).resolves.not.toThrow();
    });

    it('should not call fieldReport.create when application is not found', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.submitReport('bad-id', 'verifier-1', makeMinimalReportDto()),
      ).rejects.toThrow();
      expect(prisma.fieldReport.create).not.toHaveBeenCalled();
    });

    it('should not call fieldReport.create when status check fails', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
      } as any);

      await expect(
        service.submitReport('app-1', 'verifier-1', makeMinimalReportDto()),
      ).rejects.toThrow();
      expect(prisma.fieldReport.create).not.toHaveBeenCalled();
    });

    it('should use verifierId parameter as-is (field verifier submits own report)', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-42', makeMinimalReportDto());

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.verifierId).toBe('verifier-42');
    });

    it('should pass apcdOperational as boolean true', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        apcdOperational: true,
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.apcdOperational).toBe(true);
    });

    it('should pass apcdOperational as boolean false', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        apcdOperational: false,
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.apcdOperational).toBe(false);
    });

    it('should pass emissionCompliant as boolean false', async () => {
      prisma.application.findUnique.mockResolvedValue(
        mockFieldVerificationApplication as any,
      );
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      await service.submitReport('app-1', 'verifier-1', makeMinimalReportDto({
        emissionCompliant: false,
      }));

      const createCall = prisma.fieldReport.create.mock.calls[0][0];
      expect(createCall.data.emissionCompliant).toBe(false);
    });
  });

  // =========================================================================
  // getReportsForApplication()
  // =========================================================================

  describe('getReportsForApplication', () => {
    it('should return reports with verifier info ordered by visitDate desc', async () => {
      const reports = [
        {
          ...mockFieldReport,
          verifier: { id: 'v-1', firstName: 'John', lastName: 'Doe' },
        },
      ];
      prisma.fieldReport.findMany.mockResolvedValue(reports as any);

      const result = await service.getReportsForApplication('app-1');

      expect(prisma.fieldReport.findMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
        include: {
          verifier: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { visitDate: 'desc' },
      });
      expect(result).toEqual(reports);
    });

    it('should return empty array when no reports exist', async () => {
      prisma.fieldReport.findMany.mockResolvedValue([]);

      const result = await service.getReportsForApplication('app-no-reports');

      expect(result).toEqual([]);
    });

    it('should return multiple reports', async () => {
      const reports = [
        { ...mockFieldReport, id: 'report-1', visitDate: new Date('2025-06-20') },
        { ...mockFieldReport, id: 'report-2', visitDate: new Date('2025-06-15') },
      ];
      prisma.fieldReport.findMany.mockResolvedValue(reports as any);

      const result = await service.getReportsForApplication('app-1');

      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // getPendingForVerifier()
  // =========================================================================

  describe('getPendingForVerifier', () => {
    it('should return applications in FIELD_VERIFICATION with reports by verifier', async () => {
      const applications = [
        {
          id: 'app-1',
          status: ApplicationStatus.FIELD_VERIFICATION,
          oemProfile: { companyName: 'Company A', fullAddress: '123 Street' },
          fieldVerificationSites: [mockSite],
        },
      ];
      prisma.application.findMany.mockResolvedValue(applications as any);

      const result = await service.getPendingForVerifier('verifier-1');

      expect(prisma.application.findMany).toHaveBeenCalledWith({
        where: {
          status: ApplicationStatus.FIELD_VERIFICATION,
          fieldReports: { some: { verifierId: 'verifier-1' } },
        },
        include: {
          oemProfile: {
            select: { companyName: true, fullAddress: true },
          },
          fieldVerificationSites: true,
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].oemProfile.companyName).toBe('Company A');
    });

    it('should return empty array when verifier has no pending work', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getPendingForVerifier('verifier-no-work');

      expect(result).toEqual([]);
    });

    it('should filter by the specific verifierId', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      await service.getPendingForVerifier('specific-verifier-id');

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fieldReports: { some: { verifierId: 'specific-verifier-id' } },
          }),
        }),
      );
    });
  });

  // =========================================================================
  // getApplicationsPendingFieldVerification()
  // =========================================================================

  describe('getApplicationsPendingFieldVerification', () => {
    it('should return applications with all related data ordered by updatedAt', async () => {
      const applications = [
        {
          id: 'app-1',
          status: ApplicationStatus.FIELD_VERIFICATION,
          oemProfile: { companyName: 'Company A', fullAddress: 'Address A' },
          fieldVerificationSites: [mockSite],
          fieldReports: [
            {
              ...mockFieldReport,
              verifier: { id: 'v-1', firstName: 'John', lastName: 'Doe' },
            },
          ],
          updatedAt: new Date('2025-01-01'),
        },
      ];
      prisma.application.findMany.mockResolvedValue(applications as any);

      const result = await service.getApplicationsPendingFieldVerification();

      expect(prisma.application.findMany).toHaveBeenCalledWith({
        where: {
          status: ApplicationStatus.FIELD_VERIFICATION,
        },
        include: {
          oemProfile: {
            select: { companyName: true, fullAddress: true },
          },
          fieldVerificationSites: true,
          fieldReports: {
            include: {
              verifier: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'asc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no applications are pending field verification', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getApplicationsPendingFieldVerification();

      expect(result).toEqual([]);
    });

    it('should return multiple applications', async () => {
      const applications = [
        {
          id: 'app-1',
          status: ApplicationStatus.FIELD_VERIFICATION,
          updatedAt: new Date('2025-01-01'),
        },
        {
          id: 'app-2',
          status: ApplicationStatus.FIELD_VERIFICATION,
          updatedAt: new Date('2025-01-02'),
        },
      ];
      prisma.application.findMany.mockResolvedValue(applications as any);

      const result = await service.getApplicationsPendingFieldVerification();

      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // getFieldVerifiers()
  // =========================================================================

  describe('getFieldVerifiers', () => {
    it('should return active field verifier users with correct select', async () => {
      const verifiers = [
        { id: 'v-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: '9999999999' },
        { id: 'v-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: '8888888888' },
      ];
      prisma.user.findMany.mockResolvedValue(verifiers as any);

      const result = await service.getFieldVerifiers();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.FIELD_VERIFIER, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      });
      expect(result).toEqual(verifiers);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no active field verifiers exist', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.getFieldVerifiers();

      expect(result).toEqual([]);
    });

    it('should filter by FIELD_VERIFIER role and isActive true', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getFieldVerifiers();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: Role.FIELD_VERIFIER, isActive: true },
        }),
      );
    });
  });
});
