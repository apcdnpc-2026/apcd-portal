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
};

const mockSite = {
  id: 'site-1',
  applicationId: 'app-1',
  slNo: 1,
  industryName: 'Steel Plant',
  location: 'Jamshedpur',
  contactPerson: 'Mr. Sharma',
  contactNumber: '9999999999',
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
  observations: 'All OK',
  recommendation: 'APPROVED',
  overallResult: 'PASS',
};

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

      const result = await service.bulkCreateSites('app-1', 'user-1', sites);

      expect(prisma.fieldVerificationSite.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
      });
      expect(prisma.fieldVerificationSite.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ applicationId: 'app-1', slNo: 1 }),
          expect.objectContaining({ applicationId: 'app-1', slNo: 2 }),
        ]),
      });
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

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.bulkCreateSites('bad-id', 'user-1', [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.bulkCreateSites('app-1', 'other-user', [])).rejects.toThrow(
        ForbiddenException,
      );
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
        }),
      });
    });

    it('should throw BadRequestException when already 3 sites exist', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.fieldVerificationSite.count.mockResolvedValue(3);

      await expect(
        service.addSite('app-1', 'user-1', { industryName: 'Plant D' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.addSite('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      await expect(service.addSite('app-1', 'other-user', {})).rejects.toThrow(
        ForbiddenException,
      );
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

    it('should throw NotFoundException when site does not exist', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue(null);

      await expect(service.updateSite('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.updateSite('site-1', 'user-1', {})).rejects.toThrow(
        ForbiddenException,
      );
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
    });

    it('should throw NotFoundException when site does not exist', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue(null);

      await expect(service.deleteSite('bad-id', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.fieldVerificationSite.findUnique.mockResolvedValue({
        ...mockSite,
        application: { ...mockApplication, applicantId: 'other-user' },
      } as any);

      await expect(service.deleteSite('site-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // submitReport()
  // =========================================================================

  describe('submitReport', () => {
    it('should create a field report when application is in FIELD_VERIFICATION status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.FIELD_VERIFICATION,
      } as any);
      prisma.fieldReport.create.mockResolvedValue(mockFieldReport as any);

      const dto = {
        siteIndex: 1,
        visitDate: '2025-06-15',
        industryName: 'Steel Plant',
        location: 'Jamshedpur',
        apcdCondition: 'Good',
        apcdOperational: true,
        emissionCompliant: true,
        observations: 'All OK',
        recommendation: 'APPROVED',
        overallResult: 'PASS',
      };

      const result = await service.submitReport('app-1', 'verifier-1', dto);

      expect(prisma.fieldReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          verifierId: 'verifier-1',
          siteIndex: 1,
          visitDate: new Date('2025-06-15'),
        }),
      });
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.submitReport('bad-id', 'verifier-1', {
          siteIndex: 1,
          visitDate: '2025-06-15',
          industryName: 'Plant',
          location: 'City',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when application is not in FIELD_VERIFICATION status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(
        service.submitReport('app-1', 'verifier-1', {
          siteIndex: 1,
          visitDate: '2025-06-15',
          industryName: 'Plant',
          location: 'City',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // getPendingForVerifier()
  // =========================================================================

  describe('getPendingForVerifier', () => {
    it('should return applications in FIELD_VERIFICATION with reports by verifier', async () => {
      prisma.application.findMany.mockResolvedValue([
        { id: 'app-1', oemProfile: { companyName: 'Company A' }, fieldVerificationSites: [] },
      ] as any);

      const result = await service.getPendingForVerifier('verifier-1');

      expect(prisma.application.findMany).toHaveBeenCalledWith({
        where: {
          status: ApplicationStatus.FIELD_VERIFICATION,
          fieldReports: { some: { verifierId: 'verifier-1' } },
        },
        include: expect.objectContaining({
          oemProfile: expect.any(Object),
          fieldVerificationSites: true,
        }),
      });
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getFieldVerifiers()
  // =========================================================================

  describe('getFieldVerifiers', () => {
    it('should return active field verifier users', async () => {
      const verifiers = [
        { id: 'v-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: '999' },
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
    });
  });
});
