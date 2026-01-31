import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, ApplicationStatus, Role } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { ApplicationValidatorService } from './application-validator.service';
import { ApplicationsService } from './applications.service';
import { UpdateApplicationDto } from './dto/create-application.dto';
import { ApplicationFilterDto } from './dto/application-filter.dto';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const OTHER_USER_ID = 'other-user';
const OFFICER_ID = 'officer-1';
const ADMIN_ID = 'admin-1';
const APP_ID = 'app-1';
const PROFILE_ID = 'profile-1';

const mockProfile = {
  id: PROFILE_ID,
  userId: USER_ID,
  companyName: 'Test Corp',
};

function makeApplication(overrides: Record<string, any> = {}) {
  return {
    id: APP_ID,
    applicationNumber: 'APCD-2026-0001',
    applicantId: USER_ID,
    oemProfileId: PROFILE_ID,
    status: ApplicationStatus.DRAFT,
    currentStep: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    lastQueriedAt: null,
    turnoverYear1: null,
    turnoverYear2: null,
    turnoverYear3: null,
    turnoverYear1Label: '2023-24',
    turnoverYear2Label: '2024-25',
    turnoverYear3Label: '2025-26',
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
    ...overrides,
  };
}

function makeApplicationWithIncludes(overrides: Record<string, any> = {}) {
  return {
    ...makeApplication(overrides),
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
}

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

    // Default $transaction implementation: resolve the array of lazy Prisma queries
    prisma.$transaction.mockImplementation(async (args: any) => {
      if (Array.isArray(args)) return Promise.all(args);
      return args(prisma);
    });
  });

  // =========================================================================
  // create(userId)
  // =========================================================================

  describe('create', () => {
    it('should throw BadRequestException when OEM profile does not exist', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(null);

      await expect(service.create(USER_ID)).rejects.toThrow(BadRequestException);
      await expect(service.create(USER_ID)).rejects.toThrow(
        'Create your company profile first before starting an application',
      );
    });

    it('should return existing DRAFT application instead of creating a new one', async () => {
      const existingDraft = makeApplication();
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(existingDraft as any);

      const result = await service.create(USER_ID);

      expect(result).toEqual(existingDraft);
      expect(prisma.application.create).not.toHaveBeenCalled();
    });

    it('should look for the most recent DRAFT ordered by createdAt desc', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(makeApplication() as any);

      await service.create(USER_ID);

      expect(prisma.application.findFirst).toHaveBeenCalledWith({
        where: {
          applicantId: USER_ID,
          status: ApplicationStatus.DRAFT,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should create a new DRAFT application with APCD-YYYY-NNNN format', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(null);
      prisma.application.count.mockResolvedValue(3);

      const year = new Date().getFullYear();
      const expectedNumber = `APCD-${year}-0004`;
      const createdApp = makeApplication({ applicationNumber: expectedNumber });

      prisma.application.create.mockResolvedValue(createdApp as any);

      const result = await service.create(USER_ID);

      expect(prisma.application.create).toHaveBeenCalledWith({
        data: {
          applicationNumber: expectedNumber,
          applicantId: USER_ID,
          oemProfileId: PROFILE_ID,
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
      prisma.application.create.mockResolvedValue(
        makeApplication({ applicationNumber: `APCD-${year}-0001` }) as any,
      );

      await service.create(USER_ID);

      expect(prisma.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationNumber: `APCD-${year}-0001`,
          }),
        }),
      );
    });

    it('should count applications by year prefix to determine sequence number', async () => {
      prisma.oemProfile.findUnique.mockResolvedValue(mockProfile as any);
      prisma.application.findFirst.mockResolvedValue(null);
      prisma.application.count.mockResolvedValue(99);
      prisma.application.create.mockResolvedValue(makeApplication() as any);

      const year = new Date().getFullYear();

      await service.create(USER_ID);

      expect(prisma.application.count).toHaveBeenCalledWith({
        where: {
          applicationNumber: { startsWith: `APCD-${year}` },
        },
      });
      expect(prisma.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationNumber: `APCD-${year}-0100`,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // findById(id, userId, userRole)
  // =========================================================================

  describe('findById', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.findById(APP_ID, USER_ID, Role.OEM)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when OEM accesses another user\'s application', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplicationWithIncludes({ applicantId: OTHER_USER_ID }) as any,
      );

      await expect(service.findById(APP_ID, USER_ID, Role.OEM)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow OEM to view their own application', async () => {
      const app = makeApplicationWithIncludes();
      prisma.application.findUnique.mockResolvedValue(app as any);

      const result = await service.findById(APP_ID, USER_ID, Role.OEM);

      expect(result).toEqual(app);
    });

    it('should allow OFFICER to access any application', async () => {
      const app = makeApplicationWithIncludes({ applicantId: OTHER_USER_ID });
      prisma.application.findUnique.mockResolvedValue(app as any);

      const result = await service.findById(APP_ID, OFFICER_ID, Role.OFFICER);

      expect(result).toBeDefined();
      expect(result.applicantId).toBe(OTHER_USER_ID);
    });

    it('should allow ADMIN to access any application', async () => {
      const app = makeApplicationWithIncludes({ applicantId: OTHER_USER_ID });
      prisma.application.findUnique.mockResolvedValue(app as any);

      const result = await service.findById(APP_ID, ADMIN_ID, Role.ADMIN);

      expect(result).toBeDefined();
      expect(result.applicantId).toBe(OTHER_USER_ID);
    });

    it('should query attachments with select (excluding fileData)', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplicationWithIncludes() as any);

      await service.findById(APP_ID, USER_ID, Role.OEM);

      const findCall = prisma.application.findUnique.mock.calls[0][0];
      expect(findCall.include.attachments).toEqual({
        select: {
          id: true,
          documentType: true,
          originalName: true,
          fileSizeBytes: true,
          hasValidGeoTag: true,
          isVerified: true,
          createdAt: true,
        },
      });
    });

    it('should include all expected relations in the query', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplicationWithIncludes() as any);

      await service.findById(APP_ID, USER_ID, Role.OEM);

      const findCall = prisma.application.findUnique.mock.calls[0][0];
      const include = findCall.include;

      expect(include.oemProfile).toBe(true);
      expect(include.contactPersons).toBe(true);
      expect(include.applicationApcds).toEqual({ include: { apcdType: true } });
      expect(include.installationExperiences).toEqual({ orderBy: { sortOrder: 'asc' } });
      expect(include.fieldVerificationSites).toEqual({ orderBy: { slNo: 'asc' } });
      expect(include.staffDetails).toEqual({ orderBy: { sortOrder: 'asc' } });
      expect(include.payments).toBe(true);
      expect(include.queries).toEqual({
        include: {
          responses: true,
          raisedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(include.evaluations).toEqual({
        include: {
          scores: true,
          evaluator: { select: { firstName: true, lastName: true } },
        },
      });
      expect(include.fieldReports).toBe(true);
      expect(include.certificates).toBe(true);
      expect(include.statusHistory).toEqual({ orderBy: { createdAt: 'desc' } });
    });
  });

  // =========================================================================
  // findAll(filter, userId, userRole)
  // =========================================================================

  describe('findAll', () => {
    function makeFilter(overrides: Partial<ApplicationFilterDto> = {}): ApplicationFilterDto {
      const filter = new ApplicationFilterDto();
      filter.page = 1;
      filter.limit = 20;
      filter.sortBy = 'createdAt';
      filter.sortOrder = 'desc';
      Object.assign(filter, overrides);
      return filter;
    }

    beforeEach(() => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(0);
    });

    it('should filter OEM to see only their own applications', async () => {
      await service.findAll(makeFilter(), USER_ID, Role.OEM);

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ applicantId: USER_ID }),
        }),
      );
    });

    it('should exclude DRAFT status for OFFICER role when no status filter is set', async () => {
      await service.findAll(makeFilter(), OFFICER_ID, Role.OFFICER);

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: ApplicationStatus.DRAFT },
          }),
        }),
      );
    });

    it('should honor explicit status filter for OFFICER without overriding', async () => {
      await service.findAll(
        makeFilter({ status: ApplicationStatus.SUBMITTED }),
        OFFICER_ID,
        Role.OFFICER,
      );

      const whereArg = prisma.application.findMany.mock.calls[0][0].where;
      // When an explicit status is provided it is set before the OFFICER check,
      // so the fallback (|| { not: DRAFT }) does not trigger.
      expect(whereArg.status).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should apply search filter on applicationNumber and companyName', async () => {
      const filterWithSearch = makeFilter({ search: 'APCD-2026' });

      await service.findAll(filterWithSearch, USER_ID, Role.OEM);

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { applicationNumber: { contains: 'APCD-2026', mode: 'insensitive' } },
              {
                oemProfile: {
                  companyName: { contains: 'APCD-2026', mode: 'insensitive' },
                },
              },
            ],
          }),
        }),
      );
    });

    it('should return paginated result with correct meta', async () => {
      const apps = [makeApplication()] as any[];
      prisma.application.findMany.mockResolvedValue(apps);
      prisma.application.count.mockResolvedValue(1);

      const result = await service.findAll(makeFilter(), USER_ID, Role.OEM);

      expect(result).toEqual({
        data: apps,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('should calculate totalPages correctly (ceiling division)', async () => {
      prisma.application.findMany.mockResolvedValue([]);
      prisma.application.count.mockResolvedValue(45);

      const result = await service.findAll(makeFilter({ limit: 20 }), USER_ID, Role.OEM);

      expect(result.meta.totalPages).toBe(3); // ceil(45/20) = 3
    });

    it('should pass skip and take from filter for pagination', async () => {
      const filter = makeFilter({ page: 3, limit: 10 });

      await service.findAll(filter, USER_ID, Role.OEM);

      const findManyArg = prisma.application.findMany.mock.calls[0][0];
      expect(findManyArg.skip).toBe(filter.skip); // (3-1)*10 = 20
      expect(findManyArg.take).toBe(10);
    });

    it('should allow non-OEM roles to filter by applicantId', async () => {
      await service.findAll(
        makeFilter({ applicantId: OTHER_USER_ID }),
        ADMIN_ID,
        Role.ADMIN,
      );

      const whereArg = prisma.application.findMany.mock.calls[0][0].where;
      expect(whereArg.applicantId).toBe(OTHER_USER_ID);
    });

    it('should use default sortBy and sortOrder', async () => {
      await service.findAll(makeFilter(), USER_ID, Role.OEM);

      const findManyArg = prisma.application.findMany.mock.calls[0][0];
      expect(findManyArg.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should include oemProfile select in findMany', async () => {
      await service.findAll(makeFilter(), USER_ID, Role.OEM);

      const findManyArg = prisma.application.findMany.mock.calls[0][0];
      expect(findManyArg.include).toEqual({
        oemProfile: { select: { companyName: true, firmSize: true, isMSE: true } },
      });
    });
  });

  // =========================================================================
  // update(id, userId, dto)
  // =========================================================================

  describe('update', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.update(APP_ID, USER_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);

      await expect(service.update(APP_ID, OTHER_USER_ID, {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when status is SUBMITTED (not editable)', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );

      await expect(service.update(APP_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
      await expect(service.update(APP_ID, USER_ID, {})).rejects.toThrow(
        'Application can only be edited in DRAFT or QUERIED status',
      );
    });

    it('should throw BadRequestException when status is UNDER_REVIEW', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }) as any,
      );

      await expect(service.update(APP_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when status is APPROVED', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.APPROVED }) as any,
      );

      await expect(service.update(APP_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
    });

    it('should allow update when status is DRAFT', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(
        makeApplication({ currentStep: 3 }) as any,
      );

      const result = await service.update(APP_ID, USER_ID, { currentStep: 3 });

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: { currentStep: 3 },
      });
      expect(result.currentStep).toBe(3);
    });

    it('should allow update when status is QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED, currentStep: 5 }) as any,
      );

      const result = await service.update(APP_ID, USER_ID, { currentStep: 5 });

      expect(result).toBeDefined();
      expect(result.currentStep).toBe(5);
    });

    it('should replace contact persons (delete + create) when contactPersons is provided', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);
      prisma.contactPerson.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.contactPerson.createMany.mockResolvedValue({ count: 2 } as any);

      const contactPersons = [
        { type: 'COMMERCIAL', name: 'Alice', mobileNo: '9876543210', email: 'alice@test.com' },
        { type: 'TECHNICAL', name: 'Bob', mobileNo: '9876543211', email: 'bob@test.com' },
      ];

      await service.update(APP_ID, USER_ID, { contactPersons } as any);

      expect(prisma.contactPerson.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: APP_ID },
      });
      expect(prisma.contactPerson.createMany).toHaveBeenCalledWith({
        data: [
          { ...contactPersons[0], applicationId: APP_ID },
          { ...contactPersons[1], applicationId: APP_ID },
        ],
      });
    });

    it('should NOT call contactPerson methods when contactPersons is not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);

      await service.update(APP_ID, USER_ID, { currentStep: 3 });

      expect(prisma.contactPerson.deleteMany).not.toHaveBeenCalled();
      expect(prisma.contactPerson.createMany).not.toHaveBeenCalled();
    });

    it('should replace APCD selections (delete + create) when apcdSelections is provided', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);
      prisma.applicationApcd.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.applicationApcd.createMany.mockResolvedValue({ count: 1 } as any);

      const apcdSelections = [
        {
          apcdTypeId: 'type-1',
          isManufactured: true,
          seekingEmpanelment: true,
          installationCategory: 'BOILER_FURNACE_TFH',
          designCapacityRange: '10-50 TPH',
        },
      ];

      await service.update(APP_ID, USER_ID, { apcdSelections } as any);

      expect(prisma.applicationApcd.deleteMany).toHaveBeenCalledWith({
        where: { applicationId: APP_ID },
      });
      expect(prisma.applicationApcd.createMany).toHaveBeenCalledWith({
        data: [
          {
            applicationId: APP_ID,
            apcdTypeId: 'type-1',
            isManufactured: true,
            seekingEmpanelment: true,
            installationCategory: 'BOILER_FURNACE_TFH',
            designCapacityRange: '10-50 TPH',
          },
        ],
      });
    });

    it('should NOT call applicationApcd methods when apcdSelections is not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);

      await service.update(APP_ID, USER_ID, { currentStep: 3 });

      expect(prisma.applicationApcd.deleteMany).not.toHaveBeenCalled();
      expect(prisma.applicationApcd.createMany).not.toHaveBeenCalled();
    });

    it('should correctly handle each valid APCDInstallationCategory value', async () => {
      const categories = ['BOILER_FURNACE_TFH', 'NON_BOILER_NON_FURNACE', 'BOTH'] as const;

      for (const category of categories) {
        jest.clearAllMocks();

        // Re-setup default $transaction
        prisma.$transaction.mockImplementation(async (args: any) => {
          if (Array.isArray(args)) return Promise.all(args);
          return args(prisma);
        });

        prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
        prisma.application.update.mockResolvedValue(makeApplication() as any);
        prisma.applicationApcd.deleteMany.mockResolvedValue({ count: 0 } as any);
        prisma.applicationApcd.createMany.mockResolvedValue({ count: 1 } as any);

        await service.update(APP_ID, USER_ID, {
          apcdSelections: [{ apcdTypeId: 'type-1', installationCategory: category }],
        } as any);

        const createManyCall = prisma.applicationApcd.createMany.mock.calls[0][0];
        expect(createManyCall.data[0].installationCategory).toBe(category);
      }
    });

    // THE BUG: empty string for installationCategory passes through to Prisma
    // because the service casts it as `APCDInstallationCategory | undefined`
    // but does not guard against empty strings, which Prisma rejects as invalid enum.
    it('should pass empty string installationCategory through without conversion (known bug)', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);
      prisma.applicationApcd.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.applicationApcd.createMany.mockResolvedValue({ count: 1 } as any);

      const dto: UpdateApplicationDto = {
        apcdSelections: [
          {
            apcdTypeId: 'type-1',
            installationCategory: '', // empty string -- THE BUG
          },
        ],
      } as any;

      await service.update(APP_ID, USER_ID, dto);

      // The service does NOT strip or convert empty strings to undefined.
      // In production, Prisma will reject '' as an invalid enum value.
      const createManyCall = prisma.applicationApcd.createMany.mock.calls[0][0];
      expect(createManyCall.data[0].installationCategory).toBe('');
    });

    it('should strip contactPersons and apcdSelections from the application update data', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);
      prisma.contactPerson.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.contactPerson.createMany.mockResolvedValue({ count: 1 } as any);
      prisma.applicationApcd.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.applicationApcd.createMany.mockResolvedValue({ count: 1 } as any);

      await service.update(APP_ID, USER_ID, {
        currentStep: 5,
        hasISO9001: true,
        contactPersons: [{ type: 'COMMERCIAL', name: 'Alice', mobileNo: '123', email: 'a@b.c' }],
        apcdSelections: [{ apcdTypeId: 'type-1' }],
      } as any);

      const updateCall = prisma.application.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ currentStep: 5, hasISO9001: true });
      expect(updateCall.data).not.toHaveProperty('contactPersons');
      expect(updateCall.data).not.toHaveProperty('apcdSelections');
    });

    it('should handle undefined installationCategory without error', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(makeApplication() as any);
      prisma.applicationApcd.deleteMany.mockResolvedValue({ count: 0 } as any);
      prisma.applicationApcd.createMany.mockResolvedValue({ count: 1 } as any);

      await service.update(APP_ID, USER_ID, {
        apcdSelections: [
          {
            apcdTypeId: 'type-1',
            isManufactured: true,
            // installationCategory intentionally omitted (undefined)
          },
        ],
      } as any);

      const createManyCall = prisma.applicationApcd.createMany.mock.calls[0][0];
      expect(createManyCall.data[0].installationCategory).toBeUndefined();
    });
  });

  // =========================================================================
  // submit(id, userId)
  // =========================================================================

  describe('submit', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.submit(APP_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);

      await expect(service.submit(APP_ID, OTHER_USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when application is not DRAFT', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );

      await expect(service.submit(APP_ID, USER_ID)).rejects.toThrow(BadRequestException);
      await expect(service.submit(APP_ID, USER_ID)).rejects.toThrow(
        'Only draft applications can be submitted',
      );
    });

    it('should throw BadRequestException when validation fails with errors', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      validator.validateForSubmission.mockResolvedValue([
        'At least one contact person is required',
        'Missing mandatory document: Company PAN Card',
      ]);

      await expect(service.submit(APP_ID, USER_ID)).rejects.toThrow(BadRequestException);

      expect(validator.validateForSubmission).toHaveBeenCalledWith(APP_ID);
    });

    it('should transition to SUBMITTED when validation passes', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      validator.validateForSubmission.mockResolvedValue([]);

      const submittedApp = makeApplication({
        status: ApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
      });
      prisma.application.update.mockResolvedValue(submittedApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.submit(APP_ID, USER_ID);

      expect(validator.validateForSubmission).toHaveBeenCalledWith(APP_ID);
      expect(result.status).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should set submittedAt timestamp on submission', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      validator.validateForSubmission.mockResolvedValue([]);
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.submit(APP_ID, USER_ID);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: expect.objectContaining({
          status: ApplicationStatus.SUBMITTED,
          submittedAt: expect.any(Date),
        }),
      });
    });

    it('should create status history with DRAFT -> SUBMITTED transition', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      validator.validateForSubmission.mockResolvedValue([]);
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.submit(APP_ID, USER_ID);

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: APP_ID,
          fromStatus: ApplicationStatus.DRAFT,
          toStatus: ApplicationStatus.SUBMITTED,
          changedBy: USER_ID,
          remarks: 'Application submitted by OEM',
        },
      });
    });

    it('should wrap update and history create in $transaction', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      validator.validateForSubmission.mockResolvedValue([]);
      prisma.application.update.mockReturnValue('update-result' as any);
      prisma.applicationStatusHistory.create.mockReturnValue('history-result' as any);

      await service.submit(APP_ID, USER_ID);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        'update-result',
        'history-result',
      ]);
    });
  });

  // =========================================================================
  // resubmit(id, userId)
  // =========================================================================

  describe('resubmit', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.resubmit(APP_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );

      await expect(service.resubmit(APP_ID, OTHER_USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should transition from QUERIED to RESUBMITTED', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );

      const resubmittedApp = makeApplication({ status: ApplicationStatus.RESUBMITTED });
      prisma.application.update.mockResolvedValue(resubmittedApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.resubmit(APP_ID, USER_ID);

      expect(result.status).toBe(ApplicationStatus.RESUBMITTED);
    });

    it('should create status history entry with correct transition and remarks', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.RESUBMITTED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.resubmit(APP_ID, USER_ID);

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: APP_ID,
          fromStatus: ApplicationStatus.QUERIED,
          toStatus: ApplicationStatus.RESUBMITTED,
          changedBy: USER_ID,
          remarks: 'Application resubmitted after query response',
        },
      });
    });

    it('should hardcode QUERIED as fromStatus regardless of actual current status', async () => {
      // The service always passes ApplicationStatus.QUERIED as the expected fromStatus
      // to transitionStatus. If the app is actually in DRAFT, the status history
      // will still record QUERIED -> RESUBMITTED (the service does not double-check).
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.DRAFT }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.RESUBMITTED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.resubmit(APP_ID, USER_ID);

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: ApplicationStatus.QUERIED,
        }),
      });
    });
  });

  // =========================================================================
  // withdraw(id, userId, reason?)
  // =========================================================================

  describe('withdraw', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.withdraw(APP_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);

      await expect(service.withdraw(APP_ID, OTHER_USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should allow withdrawal from DRAFT status', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);

      const withdrawnApp = makeApplication({ status: ApplicationStatus.WITHDRAWN });
      prisma.application.update.mockResolvedValue(withdrawnApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.withdraw(APP_ID, USER_ID);

      expect(result.status).toBe(ApplicationStatus.WITHDRAWN);
    });

    it('should allow withdrawal from QUERIED status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );

      const withdrawnApp = makeApplication({ status: ApplicationStatus.WITHDRAWN });
      prisma.application.update.mockResolvedValue(withdrawnApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.withdraw(APP_ID, USER_ID);

      expect(result.status).toBe(ApplicationStatus.WITHDRAWN);
    });

    it('should throw BadRequestException when withdrawing from SUBMITTED status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );

      await expect(service.withdraw(APP_ID, USER_ID)).rejects.toThrow(BadRequestException);
      await expect(service.withdraw(APP_ID, USER_ID)).rejects.toThrow(
        'Application cannot be withdrawn at this stage',
      );
    });

    it('should throw BadRequestException when withdrawing from UNDER_REVIEW status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }) as any,
      );

      await expect(service.withdraw(APP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when withdrawing from APPROVED status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.APPROVED }) as any,
      );

      await expect(service.withdraw(APP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when withdrawing from REJECTED status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.REJECTED }) as any,
      );

      await expect(service.withdraw(APP_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should use custom reason when provided', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.WITHDRAWN }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.withdraw(APP_ID, USER_ID, 'No longer interested');

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          remarks: 'No longer interested',
        }),
      });
    });

    it('should use default reason when none provided', async () => {
      prisma.application.findUnique.mockResolvedValue(makeApplication() as any);
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.WITHDRAWN }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.withdraw(APP_ID, USER_ID);

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          remarks: 'Application withdrawn by OEM',
        }),
      });
    });

    it('should create status history with correct fromStatus and toStatus', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.WITHDRAWN }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.withdraw(APP_ID, USER_ID, 'Changed plans');

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: APP_ID,
          fromStatus: ApplicationStatus.QUERIED,
          toStatus: ApplicationStatus.WITHDRAWN,
          changedBy: USER_ID,
          remarks: 'Changed plans',
        },
      });
    });
  });

  // =========================================================================
  // changeStatus(id, newStatus, changedBy, remarks?)
  // =========================================================================

  describe('changeStatus', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus(APP_ID, ApplicationStatus.UNDER_REVIEW, OFFICER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when new status equals current status', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );

      await expect(
        service.changeStatus(APP_ID, ApplicationStatus.SUBMITTED, OFFICER_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changeStatus(APP_ID, ApplicationStatus.SUBMITTED, OFFICER_ID),
      ).rejects.toThrow('Status is already set to this value');
    });

    it('should transition from SUBMITTED to UNDER_REVIEW with audit trail', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );

      const updatedApp = makeApplication({ status: ApplicationStatus.UNDER_REVIEW });
      prisma.application.update.mockResolvedValue(updatedApp as any);
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      const result = await service.changeStatus(
        APP_ID,
        ApplicationStatus.UNDER_REVIEW,
        OFFICER_ID,
        'Starting document review',
      );

      expect(result.status).toBe(ApplicationStatus.UNDER_REVIEW);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should set approvedAt when transitioning to APPROVED', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.FINAL_REVIEW }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.APPROVED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.changeStatus(APP_ID, ApplicationStatus.APPROVED, OFFICER_ID);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: expect.objectContaining({
          status: ApplicationStatus.APPROVED,
          approvedAt: expect.any(Date),
        }),
      });
    });

    it('should set rejectedAt and rejectionReason when transitioning to REJECTED', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.REJECTED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.changeStatus(APP_ID, ApplicationStatus.REJECTED, OFFICER_ID, 'Incomplete docs');

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: expect.objectContaining({
          status: ApplicationStatus.REJECTED,
          rejectedAt: expect.any(Date),
          rejectionReason: 'Incomplete docs',
        }),
      });
    });

    it('should set lastQueriedAt when transitioning to QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.QUERIED }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.changeStatus(APP_ID, ApplicationStatus.QUERIED, OFFICER_ID, 'Need more info');

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: expect.objectContaining({
          status: ApplicationStatus.QUERIED,
          lastQueriedAt: expect.any(Date),
        }),
      });
    });

    it('should NOT set extra timestamp fields for generic status transitions', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.COMMITTEE_REVIEW }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.changeStatus(APP_ID, ApplicationStatus.COMMITTEE_REVIEW, OFFICER_ID);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: { status: ApplicationStatus.COMMITTEE_REVIEW },
      });
    });

    it('should wrap update and history create in $transaction', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );
      prisma.application.update.mockReturnValue('app-update' as any);
      prisma.applicationStatusHistory.create.mockReturnValue('history-create' as any);

      await service.changeStatus(APP_ID, ApplicationStatus.UNDER_REVIEW, OFFICER_ID);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        'app-update',
        'history-create',
      ]);
    });

    it('should record correct fromStatus and toStatus in history', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.changeStatus(
        APP_ID,
        ApplicationStatus.UNDER_REVIEW,
        OFFICER_ID,
        'Beginning review',
      );

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: APP_ID,
          fromStatus: ApplicationStatus.SUBMITTED,
          toStatus: ApplicationStatus.UNDER_REVIEW,
          changedBy: OFFICER_ID,
          remarks: 'Beginning review',
        },
      });
    });

    it('should pass undefined remarks when not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.SUBMITTED }) as any,
      );
      prisma.application.update.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }) as any,
      );
      prisma.applicationStatusHistory.create.mockResolvedValue({} as any);

      await service.changeStatus(APP_ID, ApplicationStatus.UNDER_REVIEW, OFFICER_ID);

      expect(prisma.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          remarks: undefined,
        }),
      });
    });
  });
});
