import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, ApplicationStatus, Role } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { ApplicationValidatorService } from './application-validator.service';
import { ApplicationsService } from './applications.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockProfile = {
  id: 'profile-1',
  userId: 'user-1',
  companyName: 'Test Corp',
};

const baseMockApplication = {
  id: 'app-1',
  applicationNumber: 'APCD-2025-0001',
  applicantId: 'user-1',
  oemProfileId: 'profile-1',
  status: ApplicationStatus.DRAFT,
  currentStep: 1,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  submittedAt: null,
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  lastQueriedAt: null,
  turnoverYear1: null,
  turnoverYear2: null,
  turnoverYear3: null,
  turnoverYear1Label: '2022-23',
  turnoverYear2Label: '2023-24',
  turnoverYear3Label: '2024-25',
  hasISO9001: false,
  hasISO14001: false,
  hasISO45001: false,
  otherStandards: null,
  isBlacklisted: false,
  blacklistDetails: null,
  hasGrievanceSystem: false,
  declarationAccepted: false,
  declarationSignatory: null,
  assignedOfficerId: null,
};

const mockApplicationWithIncludes = {
  ...baseMockApplication,
  oemProfile: mockProfile,
  contactPersons: [],
  applicationApcds: [],
  attachments: [],
  installationExperiences: [],
  fieldVerificationSites: [],
  staffDetails: [],
  payments: [],
  queries: [],
  evaluations: [],
  fieldReports: [],
  certificates: [],
  statusHistory: [],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: DeepMockProxy<PrismaClient>;
  let validator: { validateForSubmission: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();
    const mockValidator = { validateForSubmission: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ApplicationValidatorService, useValue: mockValidator },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    prisma = mockPrisma;
    validator = mockValidator;

    // Default $transaction implementation: execute the array of promises
    prisma.$transaction.mockImplementation(async (args: any) => {
      if (Array.isArray(args)) return Promise.all(args);
      return args(prisma);
    });
  });

  // =========================================================================
  // create()
  // =========================================================================

  describe('create', () => {
    it('should throw BadRequestException when OEM profile does not exist', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      await expect(service.create('user-1')).rejects.toThrow(BadRequestException);
      await expect(service.create('user-1')).rejects.toThrow(
        'Create your company profile first before starting an application',
      );
    });

    it('should return existing DRAFT application instead of creating a new one', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(baseMockApplication as any);

      const result = await service.create('user-1');

      expect(result).toEqual(baseMockApplication);
      expect(prisma.application.create).not.toHaveBeenCalled();
    });

    it('should create a new DRAFT application with APCD-YYYY-NNNN format', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(null);
      prisma.application.count.mockResolvedValue(3);

      const year = new Date().getFullYear();
      const expectedNumber = `APCD-${year}-0004`;
      const createdApp = {
        ...baseMockApplication,
        applicationNumber: expectedNumber,
      };

      prisma.application.create.mockResolvedValue(createdApp as any);

      const result = await service.create('user-1');

      expect(prisma.application.create).toHaveBeenCalledWith({
        data: {
          applicationNumber: expectedNumber,
          applicantId: 'user-1',
          oemProfileId: 'profile-1',
          status: ApplicationStatus.DRAFT,
          currentStep: 1,
        },
      });
      expect(result.applicationNumber).toBe(expectedNumber);
    });

    it('should generate application number with padded sequence starting at 0001', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(null);
      prisma.application.count.mockResolvedValue(0);

      const year = new Date().getFullYear();
      const expectedNumber = `APCD-${year}-0001`;

      prisma.application.create.mockResolvedValue({
        ...baseMockApplication,
        applicationNumber: expectedNumber,
      } as any);

      await service.create('user-1');

      expect(prisma.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationNumber: expectedNumber,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // findById()
  // =========================================================================

  describe('findById', () => {
    it('should return application with all includes', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplicationWithIncludes as any);

      const result = await service.findById('app-1', 'user-1', Role.OEM);

      expect(result).toEqual(mockApplicationWithIncludes);
      expect(prisma.application.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          include: expect.objectContaining({
            oemProfile: true,
            contactPersons: true,
            statusHistory: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent', 'user-1', Role.OEM)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when OEM accesses another user application', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplicationWithIncludes,
        applicantId: 'other-user',
      } as any);

      await expect(service.findById('app-1', 'user-1', Role.OEM)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow OFFICER to access any application', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplicationWithIncludes,
        applicantId: 'other-user',
      } as any);

      const result = await service.findById('app-1', 'officer-1', Role.OFFICER);

      expect(result).toBeDefined();
      expect(result.applicantId).toBe('other-user');
    });
  });

  // =========================================================================
  // findAll()
  // =========================================================================

  describe('findAll', () => {
    const baseFilter = { page: 1, limit: 20, skip: 0 } as any;

    beforeEach(() => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
    });

    it('should filter by applicantId for OEM role', async () => {
      await service.findAll(baseFilter, 'user-1', Role.OEM);

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ applicantId: 'user-1' }),
        }),
      );
    });

    it('should exclude DRAFT status for OFFICER role', async () => {
      await service.findAll(baseFilter, 'officer-1', Role.OFFICER);

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: ApplicationStatus.DRAFT },
          }),
        }),
      );
    });

    it('should apply search filter on applicationNumber and companyName', async () => {
      const filterWithSearch = { ...baseFilter, search: 'APCD-2025' };

      await service.findAll(filterWithSearch, 'user-1', Role.OEM);

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { applicationNumber: { contains: 'APCD-2025', mode: 'insensitive' } },
              {
                oemProfile: {
                  companyName: { contains: 'APCD-2025', mode: 'insensitive' },
                },
              },
            ],
          }),
        }),
      );
    });

    it('should return paginated result with meta', async () => {
      const apps = [baseMockApplication] as any[];
      prisma.application.findMany.mockResolvedValue(apps);
      prisma.application.count.mockResolvedValue(1);

      const result = await service.findAll(baseFilter, 'user-1', Role.OEM);

      expect(result).toEqual({
        data: apps,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });
  });

  // =========================================================================
  // update()
  // =========================================================================

  describe('update', () => {
    it('should update application fields', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);
      prisma.application.update.mockResolvedValue({
        ...baseMockApplication,
        currentStep: 3,
      } as any);

      const result = await service.update('app-1', 'user-1', { currentStep: 3 });

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { currentStep: 3 },
      });
      expect(result.currentStep).toBe(3);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);

      await expect(service.update('app-1', 'other-user', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when status is not DRAFT or QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...baseMockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(service.update('app-1', 'user-1', {})).rejects.toThrow(BadRequestException);
      await expect(service.update('app-1', 'user-1', {})).rejects.toThrow(
        'Application can only be edited in DRAFT or QUERIED status',
      );
    });

    it('should replace contactPersons when provided', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);
      prisma.application.update.mockResolvedValue(baseMockApplication as any);
      prisma.contactPerson.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.contactPerson.createMany.mockResolvedValue({ count: 1 } as any);

      const contactPersons = [
        {
          type: 'COMMERCIAL',
          name: 'John Doe',
          mobileNo: '9999999999',
          email: 'john@test.com',
        },
      ];

      await service.update('app-1', 'user-1', { contactPersons } as any);

      expect(prisma.contactPerson.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
      });
      expect(prisma.contactPerson.createMany).toHaveBeenCalledWith({
        data: contactPersons.map((cp) => ({ ...cp, applicationId: 'app-1' })),
      });
    });

    it('should replace apcdSelections when provided', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);
      prisma.application.update.mockResolvedValue(baseMockApplication as any);
      prisma.applicationApcd.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.applicationApcd.createMany.mockResolvedValue({ count: 1 } as any);

      const apcdSelections = [
        {
          apcdTypeId: 'type-1',
          isManufactured: true,
          seekingEmpanelment: true,
          installationCategory: 'BOILER_FURNACE_TFH',
          designCapacityRange: '10-50 MW',
        },
      ];

      await service.update('app-1', 'user-1', { apcdSelections } as any);

      expect(prisma.applicationApcd.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: 'app-1' },
      });
      expect(prisma.applicationApcd.createMany).toHaveBeenCalledWith({
        data: [
          {
            applicationId: 'app-1',
            apcdTypeId: 'type-1',
            isManufactured: true,
            seekingEmpanelment: true,
            installationCategory: 'BOILER_FURNACE_TFH',
            designCapacityRange: '10-50 MW',
          },
        ],
      });
    });
  });

  // =========================================================================
  // submit()
  // =========================================================================

  describe('submit', () => {
    it('should transition from DRAFT to SUBMITTED when validation passes', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);
      validator.validateForSubmission.mockResolvedValue([]);

      const submittedApp = {
        ...baseMockApplication,
        status: ApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
      };
      prisma.application.update.mockResolvedValue(submittedApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.submit('app-1', 'user-1');

      expect(validator.validateForSubmission).toHaveBeenCalledWith('app-1');
      expect(result.status).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should throw BadRequestException when validation fails', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);
      validator.validateForSubmission.mockResolvedValue([
        'Missing mandatory document: ISO Certificate',
      ]);

      await expect(service.submit('app-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when application is not DRAFT', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...baseMockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(service.submit('app-1', 'user-1')).rejects.toThrow(BadRequestException);
      await expect(service.submit('app-1', 'user-1')).rejects.toThrow(
        'Only draft applications can be submitted',
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);

      await expect(service.submit('app-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // resubmit()
  // =========================================================================

  describe('resubmit', () => {
    it('should transition from QUERIED to RESUBMITTED', async () => {
      const queriedApp = {
        ...baseMockApplication,
        status: ApplicationStatus.QUERIED,
      };
      prisma.application.findUnique.mockResolvedValue(queriedApp as any);

      const resubmittedApp = {
        ...baseMockApplication,
        status: ApplicationStatus.RESUBMITTED,
      };
      prisma.application.update.mockResolvedValue(resubmittedApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.resubmit('app-1', 'user-1');

      expect(result.status).toBe(ApplicationStatus.RESUBMITTED);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      const queriedApp = {
        ...baseMockApplication,
        status: ApplicationStatus.QUERIED,
      };
      prisma.application.findUnique.mockResolvedValue(queriedApp as any);

      await expect(service.resubmit('app-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // withdraw()
  // =========================================================================

  describe('withdraw', () => {
    it('should withdraw a DRAFT application', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);

      const withdrawnApp = {
        ...baseMockApplication,
        status: ApplicationStatus.WITHDRAWN,
      };
      prisma.application.update.mockResolvedValue(withdrawnApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.withdraw('app-1', 'user-1', 'Changed my mind');

      expect(result.status).toBe(ApplicationStatus.WITHDRAWN);
    });

    it('should withdraw a QUERIED application', async () => {
      const queriedApp = {
        ...baseMockApplication,
        status: ApplicationStatus.QUERIED,
      };
      prisma.application.findUnique.mockResolvedValue(queriedApp as any);

      const withdrawnApp = { ...queriedApp, status: ApplicationStatus.WITHDRAWN };
      prisma.application.update.mockResolvedValue(withdrawnApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.withdraw('app-1', 'user-1');

      expect(result.status).toBe(ApplicationStatus.WITHDRAWN);
    });

    it('should throw BadRequestException for non-withdrawable status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...baseMockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(service.withdraw('app-1', 'user-1')).rejects.toThrow(BadRequestException);
      await expect(service.withdraw('app-1', 'user-1')).rejects.toThrow(
        'Application cannot be withdrawn at this stage',
      );
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(baseMockApplication as any);

      await expect(service.withdraw('app-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // changeStatus()
  // =========================================================================

  describe('changeStatus', () => {
    it('should create statusHistory audit trail on transition', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...baseMockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      const updatedApp = {
        ...baseMockApplication,
        status: ApplicationStatus.UNDER_REVIEW,
      };
      prisma.application.update.mockResolvedValue(updatedApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.changeStatus(
        'app-1',
        ApplicationStatus.UNDER_REVIEW,
        'officer-1',
        'Starting document review',
      );

      expect(result.status).toBe(ApplicationStatus.UNDER_REVIEW);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException when new status is same as current', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...baseMockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(
        service.changeStatus('app-1', ApplicationStatus.SUBMITTED, 'officer-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changeStatus('app-1', ApplicationStatus.SUBMITTED, 'officer-1'),
      ).rejects.toThrow('Status is already set to this value');
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus('bad-id', ApplicationStatus.APPROVED, 'officer-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
