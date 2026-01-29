import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, ApplicationStatus, QueryStatus } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { VerificationService } from './verification.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockApplicant = {
  id: 'user-1',
  email: 'applicant@test.com',
  firstName: 'John',
  lastName: 'Doe',
  phone: '9876543210',
};

const mockApplication = {
  id: 'app-1',
  applicationNumber: 'APCD-2025-0001',
  applicantId: 'user-1',
  oemProfileId: 'profile-1',
  status: ApplicationStatus.SUBMITTED,
  currentStep: 5,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  submittedAt: new Date('2025-01-02'),
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  lastQueriedAt: null,
  assignedOfficerId: null,
};

const mockQuery = {
  id: 'query-1',
  applicationId: 'app-1',
  raisedById: 'officer-1',
  subject: 'Missing ISO Certificate',
  description: 'Please upload your ISO 9001 certificate',
  documentType: null,
  deadline: null,
  status: QueryStatus.OPEN,
  createdAt: new Date('2025-01-10'),
  updatedAt: new Date('2025-01-10'),
};

const mockQueryWithApplication = {
  ...mockQuery,
  application: { ...mockApplication, status: ApplicationStatus.QUERIED, applicantId: 'user-1' },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('VerificationService', () => {
  let service: VerificationService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [VerificationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<VerificationService>(VerificationService);
    prisma = mockPrisma;
  });

  // =========================================================================
  // getPendingApplications()
  // =========================================================================

  describe('getPendingApplications', () => {
    it('should return applications with SUBMITTED, UNDER_REVIEW, or RESUBMITTED status', async () => {
      const pendingApps = [
        { ...mockApplication, status: ApplicationStatus.SUBMITTED },
        { ...mockApplication, id: 'app-2', status: ApplicationStatus.UNDER_REVIEW },
      ];
      prisma.application.findMany.mockResolvedValue(pendingApps as any);

      const result = await service.getPendingApplications();

      expect(result).toEqual(pendingApps);
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: [
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.RESUBMITTED,
              ],
            },
          },
          orderBy: { submittedAt: 'asc' },
        }),
      );
    });

    it('should include applicant, oemProfile, and payments in results', async () => {
      prisma.application.findMany.mockResolvedValue([] as any);

      await service.getPendingApplications();

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            applicant: expect.any(Object),
            oemProfile: expect.any(Object),
            payments: expect.any(Object),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // getApplicationForVerification()
  // =========================================================================

  describe('getApplicationForVerification', () => {
    it('should return application with full details when found', async () => {
      const fullApp = {
        ...mockApplication,
        applicant: mockApplicant,
        oemProfile: {},
        applicationApcds: [],
        attachments: [],
        installationExperiences: [],
        staffDetails: [],
        payments: [],
        queries: [],
        statusHistory: [],
      };
      prisma.application.findUnique.mockResolvedValue(fullApp as any);

      const result = await service.getApplicationForVerification('app-1');

      expect(result).toEqual(fullApp);
      expect(prisma.application.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          include: expect.objectContaining({
            applicant: expect.any(Object),
            oemProfile: true,
            applicationApcds: expect.any(Object),
            attachments: true,
            queries: expect.any(Object),
            statusHistory: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.getApplicationForVerification('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getApplicationForVerification('nonexistent')).rejects.toThrow(
        'Application not found',
      );
    });
  });

  // =========================================================================
  // raiseQuery()
  // =========================================================================

  describe('raiseQuery', () => {
    const dto = {
      subject: 'Missing ISO Certificate',
      description: 'Please upload your ISO 9001 certificate',
      documentType: 'ISO_CERTIFICATE' as any,
      deadline: new Date('2025-02-01'),
    };

    it('should create a query and update application status to QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.QUERIED,
      } as any);

      const result = await service.raiseQuery('app-1', 'officer-1', dto);

      expect(result).toEqual(mockQuery);
      expect(prisma.query.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          raisedById: 'officer-1',
          subject: dto.subject,
          description: dto.description,
          documentType: dto.documentType,
          deadline: dto.deadline,
          status: QueryStatus.OPEN,
        },
      });
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: expect.objectContaining({
            status: ApplicationStatus.QUERIED,
          }),
        }),
      );
    });

    it('should not update application status if already QUERIED', async () => {
      const queriedApp = { ...mockApplication, status: ApplicationStatus.QUERIED };
      prisma.application.findUnique.mockResolvedValue(queriedApp as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);

      await service.raiseQuery('app-1', 'officer-1', dto);

      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.raiseQuery('nonexistent', 'officer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // respondToQuery()
  // =========================================================================

  describe('respondToQuery', () => {
    const responseDto = {
      message: 'Here is the requested document',
      attachmentPath: '/uploads/iso-cert.pdf',
    };

    it('should create response, update query status, and resubmit if no open queries remain', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);
      prisma.queryResponse.create.mockResolvedValue({} as any);
      prisma.query.update.mockResolvedValue({ ...mockQuery, status: QueryStatus.RESPONDED } as any);
      prisma.query.count.mockResolvedValue(0);
      prisma.application.update.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.RESUBMITTED,
      } as any);

      const result = await service.respondToQuery('query-1', 'user-1', responseDto);

      expect(result).toEqual({ success: true });
      expect(prisma.queryResponse.create).toHaveBeenCalledWith({
        data: {
          queryId: 'query-1',
          responderId: 'user-1',
          message: responseDto.message,
          attachmentPath: responseDto.attachmentPath,
        },
      });
      expect(prisma.query.update).toHaveBeenCalledWith({
        where: { id: 'query-1' },
        data: { status: QueryStatus.RESPONDED },
      });
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: expect.objectContaining({
            status: ApplicationStatus.RESUBMITTED,
          }),
        }),
      );
    });

    it('should not update application status if other open queries remain', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);
      prisma.queryResponse.create.mockResolvedValue({} as any);
      prisma.query.update.mockResolvedValue({ ...mockQuery, status: QueryStatus.RESPONDED } as any);
      prisma.query.count.mockResolvedValue(2);

      await service.respondToQuery('query-1', 'user-1', responseDto);

      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when query does not exist', async () => {
      prisma.query.findUnique.mockResolvedValue(null);

      await expect(service.respondToQuery('nonexistent', 'user-1', responseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not the applicant', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);

      await expect(service.respondToQuery('query-1', 'other-user', responseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when query is not OPEN', async () => {
      const closedQuery = {
        ...mockQueryWithApplication,
        status: QueryStatus.RESOLVED,
        application: { ...mockQueryWithApplication.application, applicantId: 'user-1' },
      };
      prisma.query.findUnique.mockResolvedValue(closedQuery as any);

      await expect(service.respondToQuery('query-1', 'user-1', responseDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // resolveQuery()
  // =========================================================================

  describe('resolveQuery', () => {
    it('should update query status to RESOLVED', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQuery as any);
      const resolvedQuery = { ...mockQuery, status: QueryStatus.RESOLVED };
      prisma.query.update.mockResolvedValue(resolvedQuery as any);

      const result = await service.resolveQuery('query-1', 'officer-1', 'Satisfied with response');

      expect(result).toEqual(resolvedQuery);
      expect(prisma.query.update).toHaveBeenCalledWith({
        where: { id: 'query-1' },
        data: { status: QueryStatus.RESOLVED },
      });
    });

    it('should throw NotFoundException when query does not exist', async () => {
      prisma.query.findUnique.mockResolvedValue(null);

      await expect(service.resolveQuery('nonexistent', 'officer-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getQueriesForApplication()
  // =========================================================================

  describe('getQueriesForApplication', () => {
    it('should return queries for the given application ordered by createdAt desc', async () => {
      const queries = [mockQuery];
      prisma.query.findMany.mockResolvedValue(queries as any);

      const result = await service.getQueriesForApplication('app-1');

      expect(result).toEqual(queries);
      expect(prisma.query.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { applicationId: 'app-1' },
          include: expect.objectContaining({
            raisedBy: expect.any(Object),
            responses: expect.any(Object),
          }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // =========================================================================
  // getPendingQueriesForUser()
  // =========================================================================

  describe('getPendingQueriesForUser', () => {
    it('should return open queries for the given user', async () => {
      const queries = [mockQuery];
      prisma.query.findMany.mockResolvedValue(queries as any);

      const result = await service.getPendingQueriesForUser('user-1');

      expect(result).toEqual(queries);
      expect(prisma.query.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            application: { applicantId: 'user-1' },
            status: QueryStatus.OPEN,
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // =========================================================================
  // forwardToCommittee()
  // =========================================================================

  describe('forwardToCommittee', () => {
    it('should update application status to COMMITTEE_REVIEW when in UNDER_REVIEW', async () => {
      const underReviewApp = { ...mockApplication, status: ApplicationStatus.UNDER_REVIEW };
      prisma.application.findUnique.mockResolvedValue(underReviewApp as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.COMMITTEE_REVIEW };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToCommittee('app-1', 'officer-1', 'Documents verified');

      expect(result.status).toBe(ApplicationStatus.COMMITTEE_REVIEW);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: expect.objectContaining({
            status: ApplicationStatus.COMMITTEE_REVIEW,
            statusHistory: {
              create: {
                fromStatus: ApplicationStatus.UNDER_REVIEW,
                toStatus: ApplicationStatus.COMMITTEE_REVIEW,
                changedBy: 'officer-1',
                remarks: 'Documents verified',
              },
            },
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.forwardToCommittee('nonexistent', 'officer-1', 'Verified'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when application is in an invalid status', async () => {
      const draftApp = { ...mockApplication, status: ApplicationStatus.DRAFT };
      prisma.application.findUnique.mockResolvedValue(draftApp as any);

      await expect(service.forwardToCommittee('app-1', 'officer-1', 'Verified')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // forwardToFieldVerification()
  // =========================================================================

  describe('forwardToFieldVerification', () => {
    it('should update application status to FIELD_VERIFICATION', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.FIELD_VERIFICATION };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToFieldVerification(
        'app-1',
        'officer-1',
        'Needs site inspection',
      );

      expect(result.status).toBe(ApplicationStatus.FIELD_VERIFICATION);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: expect.objectContaining({
            status: ApplicationStatus.FIELD_VERIFICATION,
            statusHistory: {
              create: {
                fromStatus: mockApplication.status,
                toStatus: ApplicationStatus.FIELD_VERIFICATION,
                changedBy: 'officer-1',
                remarks: 'Needs site inspection',
              },
            },
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.forwardToFieldVerification('nonexistent', 'officer-1', 'Inspect site'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
