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
  subject: 'Missing GST Certificate',
  description: 'Please upload your GST certificate',
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // getPendingApplications()
  // =========================================================================

  describe('getPendingApplications', () => {
    it('should return applications filtered by DRAFT, SUBMITTED, UNDER_REVIEW, and RESUBMITTED', async () => {
      const pendingApps = [
        { ...mockApplication, status: ApplicationStatus.DRAFT },
        { ...mockApplication, id: 'app-2', status: ApplicationStatus.SUBMITTED },
        { ...mockApplication, id: 'app-3', status: ApplicationStatus.UNDER_REVIEW },
        { ...mockApplication, id: 'app-4', status: ApplicationStatus.RESUBMITTED },
      ];
      prisma.application.findMany.mockResolvedValue(pendingApps as any);

      const result = await service.getPendingApplications();

      expect(result).toEqual(pendingApps);
      expect(result).toHaveLength(4);
      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: [
                ApplicationStatus.DRAFT,
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.UNDER_REVIEW,
                ApplicationStatus.RESUBMITTED,
              ],
            },
          },
        }),
      );
    });

    it('should order results by status ascending then createdAt ascending', async () => {
      prisma.application.findMany.mockResolvedValue([] as any);

      await service.getPendingApplications();

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });

    it('should include applicant, oemProfile, attachments, and verified payments', async () => {
      prisma.application.findMany.mockResolvedValue([] as any);

      await service.getPendingApplications();

      expect(prisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            applicant: expect.objectContaining({
              select: { id: true, email: true, firstName: true, lastName: true, phone: true },
            }),
            oemProfile: expect.objectContaining({
              select: { companyName: true, fullAddress: true },
            }),
            attachments: expect.objectContaining({
              select: { id: true },
            }),
            payments: expect.objectContaining({
              where: { status: 'VERIFIED' },
              select: { id: true, totalAmount: true, paymentType: true },
            }),
          }),
        }),
      );
    });

    it('should return an empty array when no pending applications exist', async () => {
      prisma.application.findMany.mockResolvedValue([]);

      const result = await service.getPendingApplications();

      expect(result).toEqual([]);
      expect(prisma.application.findMany).toHaveBeenCalledTimes(1);
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
        oemProfile: { companyName: 'Acme Corp', fullAddress: '123 Industrial Area' },
        applicationApcds: [{ id: 'apc-1', apcdType: { id: 'type-1', name: 'ESP' } }],
        attachments: [{ id: 'att-1', fileName: 'gst.pdf' }],
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
            applicationApcds: expect.objectContaining({ include: { apcdType: true } }),
            attachments: expect.any(Object),
            installationExperiences: true,
            staffDetails: true,
            payments: true,
            queries: expect.objectContaining({
              include: expect.objectContaining({
                raisedBy: expect.any(Object),
                responses: true,
              }),
              orderBy: { createdAt: 'desc' },
            }),
            statusHistory: expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
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
    const baseDto = {
      subject: 'Missing GST Certificate',
      description: 'Please upload your GST certificate',
    };

    it('should create a query and update application status to QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.QUERIED,
      } as any);

      const result = await service.raiseQuery('app-1', 'officer-1', baseDto);

      expect(result).toEqual(mockQuery);
      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: 'app-1',
          raisedById: 'officer-1',
          subject: baseDto.subject,
          description: baseDto.description,
          status: QueryStatus.OPEN,
        }),
      });
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: expect.objectContaining({
            status: ApplicationStatus.QUERIED,
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: ApplicationStatus.SUBMITTED,
                toStatus: ApplicationStatus.QUERIED,
                changedBy: 'officer-1',
                remarks: `Query raised: ${baseDto.subject}`,
              }),
            },
          }),
        }),
      );
    });

    it('should not update application status if already QUERIED', async () => {
      const queriedApp = { ...mockApplication, status: ApplicationStatus.QUERIED };
      prisma.application.findUnique.mockResolvedValue(queriedApp as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);

      await service.raiseQuery('app-1', 'officer-1', baseDto);

      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.raiseQuery('nonexistent', 'officer-1', baseDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.raiseQuery('nonexistent', 'officer-1', baseDto)).rejects.toThrow(
        'Application not found',
      );
      expect(prisma.query.create).not.toHaveBeenCalled();
    });

    // --- documentType edge cases ---

    it('should pass COMPANY_REGISTRATION as documentType', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        documentType: 'COMPANY_REGISTRATION',
      });

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: 'COMPANY_REGISTRATION',
        }),
      });
    });

    it('should pass GST_CERTIFICATE as documentType', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        documentType: 'GST_CERTIFICATE',
      });

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: 'GST_CERTIFICATE',
        }),
      });
    });

    it('should pass PAN_CARD as documentType', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        documentType: 'PAN_CARD',
      });

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: 'PAN_CARD',
        }),
      });
    });

    it('should pass TECHNICAL_CATALOGUE as documentType', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        documentType: 'TECHNICAL_CATALOGUE',
      });

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: 'TECHNICAL_CATALOGUE',
        }),
      });
    });

    it('should treat empty string documentType as undefined', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        documentType: '',
      });

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: undefined,
        }),
      });
    });

    it('should treat whitespace-only documentType as undefined', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        documentType: '   ',
      });

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: undefined,
        }),
      });
    });

    it('should set documentType to undefined when not provided', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', baseDto);

      expect(prisma.query.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: undefined,
        }),
      });
    });

    // --- deadline edge cases ---

    it('should parse DD-MM-YYYY deadline string correctly', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        deadline: '15-06-2025' as unknown as Date,
      });

      const createCall = prisma.query.create.mock.calls[0][0] as any;
      const deadline = createCall.data.deadline as Date;
      expect(deadline).toBeInstanceOf(Date);
      expect(deadline.getFullYear()).toBe(2025);
      expect(deadline.getMonth()).toBe(5); // June = index 5
      expect(deadline.getDate()).toBe(15);
    });

    it('should handle a Date object deadline', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      const dateObj = new Date('2025-07-20');

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        deadline: dateObj,
      });

      const createCall = prisma.query.create.mock.calls[0][0] as any;
      const deadline = createCall.data.deadline as Date;
      expect(deadline).toBeInstanceOf(Date);
      expect(deadline.getFullYear()).toBe(2025);
      expect(deadline.getMonth()).toBe(6); // July = index 6
      expect(deadline.getDate()).toBe(20);
    });

    it('should set deadline to undefined when deadline is null', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        deadline: undefined,
      });

      const createCall = prisma.query.create.mock.calls[0][0] as any;
      expect(createCall.data.deadline).toBeUndefined();
    });

    it('should set deadline to undefined when deadline string is invalid', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', {
        ...baseDto,
        deadline: 'not-a-date' as unknown as Date,
      });

      const createCall = prisma.query.create.mock.calls[0][0] as any;
      expect(createCall.data.deadline).toBeUndefined();
    });

    // --- status transition from various states ---

    it('should transition UNDER_REVIEW app to QUERIED when raising query', async () => {
      const underReviewApp = { ...mockApplication, status: ApplicationStatus.UNDER_REVIEW };
      prisma.application.findUnique.mockResolvedValue(underReviewApp as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', baseDto);

      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.QUERIED,
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: ApplicationStatus.UNDER_REVIEW,
                toStatus: ApplicationStatus.QUERIED,
              }),
            },
          }),
        }),
      );
    });

    it('should transition RESUBMITTED app to QUERIED when raising query', async () => {
      const resubmittedApp = { ...mockApplication, status: ApplicationStatus.RESUBMITTED };
      prisma.application.findUnique.mockResolvedValue(resubmittedApp as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      await service.raiseQuery('app-1', 'officer-1', baseDto);

      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.QUERIED,
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: ApplicationStatus.RESUBMITTED,
                toStatus: ApplicationStatus.QUERIED,
              }),
            },
          }),
        }),
      );
    });

    it('should set lastQueriedAt when transitioning to QUERIED', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);
      prisma.query.create.mockResolvedValue(mockQuery as any);
      prisma.application.update.mockResolvedValue({} as any);

      const beforeCall = new Date();
      await service.raiseQuery('app-1', 'officer-1', baseDto);

      const updateCall = prisma.application.update.mock.calls[0][0] as any;
      const lastQueriedAt = updateCall.data.lastQueriedAt as Date;
      expect(lastQueriedAt).toBeInstanceOf(Date);
      expect(lastQueriedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
    });
  });

  // =========================================================================
  // respondToQuery()
  // =========================================================================

  describe('respondToQuery', () => {
    const responseDto = {
      message: 'Here is the requested document',
      attachmentPath: '/uploads/gst-cert.pdf',
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
            statusHistory: {
              create: {
                fromStatus: ApplicationStatus.QUERIED,
                toStatus: ApplicationStatus.RESUBMITTED,
                changedBy: 'user-1',
                remarks: 'All queries responded',
              },
            },
          }),
        }),
      );
    });

    it('should not update application status if other open queries remain', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);
      prisma.queryResponse.create.mockResolvedValue({} as any);
      prisma.query.update.mockResolvedValue({ ...mockQuery, status: QueryStatus.RESPONDED } as any);
      prisma.query.count.mockResolvedValue(2);

      const result = await service.respondToQuery('query-1', 'user-1', responseDto);

      expect(result).toEqual({ success: true });
      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should not update application status if exactly 1 open query remains', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);
      prisma.queryResponse.create.mockResolvedValue({} as any);
      prisma.query.update.mockResolvedValue({ ...mockQuery, status: QueryStatus.RESPONDED } as any);
      prisma.query.count.mockResolvedValue(1);

      await service.respondToQuery('query-1', 'user-1', responseDto);

      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should handle response without attachmentPath', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);
      prisma.queryResponse.create.mockResolvedValue({} as any);
      prisma.query.update.mockResolvedValue({} as any);
      prisma.query.count.mockResolvedValue(1);

      const result = await service.respondToQuery('query-1', 'user-1', {
        message: 'Updated document',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.queryResponse.create).toHaveBeenCalledWith({
        data: {
          queryId: 'query-1',
          responderId: 'user-1',
          message: 'Updated document',
          attachmentPath: undefined,
        },
      });
    });

    it('should throw NotFoundException when query does not exist', async () => {
      prisma.query.findUnique.mockResolvedValue(null);

      await expect(service.respondToQuery('nonexistent', 'user-1', responseDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.respondToQuery('nonexistent', 'user-1', responseDto)).rejects.toThrow(
        'Query not found',
      );
      expect(prisma.queryResponse.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not the applicant', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);

      await expect(
        service.respondToQuery('query-1', 'other-user', responseDto),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.respondToQuery('query-1', 'other-user', responseDto),
      ).rejects.toThrow('Not authorized to respond to this query');
      expect(prisma.queryResponse.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when query status is RESPONDED', async () => {
      const respondedQuery = {
        ...mockQueryWithApplication,
        status: QueryStatus.RESPONDED,
        application: { ...mockQueryWithApplication.application, applicantId: 'user-1' },
      };
      prisma.query.findUnique.mockResolvedValue(respondedQuery as any);

      await expect(service.respondToQuery('query-1', 'user-1', responseDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.respondToQuery('query-1', 'user-1', responseDto)).rejects.toThrow(
        'Query is not open for response',
      );
    });

    it('should throw BadRequestException when query status is RESOLVED', async () => {
      const resolvedQuery = {
        ...mockQueryWithApplication,
        status: QueryStatus.RESOLVED,
        application: { ...mockQueryWithApplication.application, applicantId: 'user-1' },
      };
      prisma.query.findUnique.mockResolvedValue(resolvedQuery as any);

      await expect(service.respondToQuery('query-1', 'user-1', responseDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.respondToQuery('query-1', 'user-1', responseDto)).rejects.toThrow(
        'Query is not open for response',
      );
    });

    it('should throw BadRequestException when query status is ESCALATED', async () => {
      const escalatedQuery = {
        ...mockQueryWithApplication,
        status: QueryStatus.ESCALATED,
        application: { ...mockQueryWithApplication.application, applicantId: 'user-1' },
      };
      prisma.query.findUnique.mockResolvedValue(escalatedQuery as any);

      await expect(service.respondToQuery('query-1', 'user-1', responseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should count open queries for the correct applicationId', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQueryWithApplication as any);
      prisma.queryResponse.create.mockResolvedValue({} as any);
      prisma.query.update.mockResolvedValue({} as any);
      prisma.query.count.mockResolvedValue(0);
      prisma.application.update.mockResolvedValue({} as any);

      await service.respondToQuery('query-1', 'user-1', responseDto);

      expect(prisma.query.count).toHaveBeenCalledWith({
        where: { applicationId: 'app-1', status: QueryStatus.OPEN },
      });
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

    it('should resolve query without remarks', async () => {
      prisma.query.findUnique.mockResolvedValue(mockQuery as any);
      const resolvedQuery = { ...mockQuery, status: QueryStatus.RESOLVED };
      prisma.query.update.mockResolvedValue(resolvedQuery as any);

      const result = await service.resolveQuery('query-1', 'officer-1');

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
      await expect(service.resolveQuery('nonexistent', 'officer-1')).rejects.toThrow(
        'Query not found',
      );
      expect(prisma.query.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getQueriesForApplication()
  // =========================================================================

  describe('getQueriesForApplication', () => {
    it('should return queries for the given application with raisedBy and responses', async () => {
      const queries = [
        {
          ...mockQuery,
          raisedBy: { id: 'officer-1', firstName: 'Admin', lastName: 'User', role: 'OFFICER' },
          responses: [
            {
              id: 'resp-1',
              message: 'Uploaded',
              responder: { id: 'user-1', firstName: 'John', lastName: 'Doe', role: 'APPLICANT' },
            },
          ],
        },
      ];
      prisma.query.findMany.mockResolvedValue(queries as any);

      const result = await service.getQueriesForApplication('app-1');

      expect(result).toEqual(queries);
      expect(prisma.query.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { applicationId: 'app-1' },
          include: expect.objectContaining({
            raisedBy: expect.objectContaining({
              select: { id: true, firstName: true, lastName: true, role: true },
            }),
            responses: expect.objectContaining({
              include: expect.objectContaining({
                responder: expect.objectContaining({
                  select: { id: true, firstName: true, lastName: true, role: true },
                }),
              }),
            }),
          }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return empty array when no queries exist for application', async () => {
      prisma.query.findMany.mockResolvedValue([]);

      const result = await service.getQueriesForApplication('app-no-queries');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getPendingQueriesForUser()
  // =========================================================================

  describe('getPendingQueriesForUser', () => {
    it('should return open queries for the given user with application and raisedBy', async () => {
      const queries = [
        {
          ...mockQuery,
          application: { id: 'app-1', applicationNumber: 'APCD-2025-0001' },
          raisedBy: { id: 'officer-1', firstName: 'Admin', lastName: 'User', role: 'OFFICER' },
        },
      ];
      prisma.query.findMany.mockResolvedValue(queries as any);

      const result = await service.getPendingQueriesForUser('user-1');

      expect(result).toEqual(queries);
      expect(prisma.query.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            application: { applicantId: 'user-1' },
            status: QueryStatus.OPEN,
          },
          include: expect.objectContaining({
            application: expect.objectContaining({
              select: { id: true, applicationNumber: true },
            }),
            raisedBy: expect.objectContaining({
              select: { id: true, firstName: true, lastName: true, role: true },
            }),
          }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return empty array when user has no pending queries', async () => {
      prisma.query.findMany.mockResolvedValue([]);

      const result = await service.getPendingQueriesForUser('user-no-queries');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // forwardToCommittee()
  // =========================================================================

  describe('forwardToCommittee', () => {
    const remarks = 'Documents verified, forwarding to committee';

    it('should forward UNDER_REVIEW application to COMMITTEE_REVIEW', async () => {
      const underReviewApp = { ...mockApplication, status: ApplicationStatus.UNDER_REVIEW };
      prisma.application.findUnique.mockResolvedValue(underReviewApp as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.COMMITTEE_REVIEW };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToCommittee('app-1', 'officer-1', remarks);

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
                remarks,
              },
            },
          }),
        }),
      );
    });

    it('should forward RESUBMITTED application to COMMITTEE_REVIEW', async () => {
      const resubmittedApp = { ...mockApplication, status: ApplicationStatus.RESUBMITTED };
      prisma.application.findUnique.mockResolvedValue(resubmittedApp as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.COMMITTEE_REVIEW };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToCommittee('app-1', 'officer-1', remarks);

      expect(result.status).toBe(ApplicationStatus.COMMITTEE_REVIEW);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: ApplicationStatus.RESUBMITTED,
                toStatus: ApplicationStatus.COMMITTEE_REVIEW,
              }),
            },
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.forwardToCommittee('nonexistent', 'officer-1', remarks),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.forwardToCommittee('nonexistent', 'officer-1', remarks),
      ).rejects.toThrow('Application not found');
      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for DRAFT status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.DRAFT,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow('Application cannot be forwarded to committee in current status');
    });

    it('should throw BadRequestException for SUBMITTED status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.SUBMITTED,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for APPROVED status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.APPROVED,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for REJECTED status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.REJECTED,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for QUERIED status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.QUERIED,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for COMMITTEE_REVIEW status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.COMMITTEE_REVIEW,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for WITHDRAWN status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.WITHDRAWN,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for FIELD_VERIFICATION status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.FIELD_VERIFICATION,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for EXPIRED status', async () => {
      prisma.application.findUnique.mockResolvedValue({
        ...mockApplication,
        status: ApplicationStatus.EXPIRED,
      } as any);

      await expect(
        service.forwardToCommittee('app-1', 'officer-1', remarks),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // forwardToFieldVerification()
  // =========================================================================

  describe('forwardToFieldVerification', () => {
    const remarks = 'Requires field inspection';

    it('should forward application to FIELD_VERIFICATION and record status history', async () => {
      const underReviewApp = { ...mockApplication, status: ApplicationStatus.UNDER_REVIEW };
      prisma.application.findUnique.mockResolvedValue(underReviewApp as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.FIELD_VERIFICATION };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToFieldVerification('app-1', 'officer-1', remarks);

      expect(result.status).toBe(ApplicationStatus.FIELD_VERIFICATION);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1' },
          data: expect.objectContaining({
            status: ApplicationStatus.FIELD_VERIFICATION,
            statusHistory: {
              create: {
                fromStatus: ApplicationStatus.UNDER_REVIEW,
                toStatus: ApplicationStatus.FIELD_VERIFICATION,
                changedBy: 'officer-1',
                remarks,
              },
            },
          }),
        }),
      );
    });

    it('should forward RESUBMITTED application to FIELD_VERIFICATION', async () => {
      const resubmittedApp = { ...mockApplication, status: ApplicationStatus.RESUBMITTED };
      prisma.application.findUnique.mockResolvedValue(resubmittedApp as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.FIELD_VERIFICATION };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToFieldVerification('app-1', 'officer-1', remarks);

      expect(result.status).toBe(ApplicationStatus.FIELD_VERIFICATION);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: ApplicationStatus.RESUBMITTED,
                toStatus: ApplicationStatus.FIELD_VERIFICATION,
              }),
            },
          }),
        }),
      );
    });

    it('should forward SUBMITTED application to FIELD_VERIFICATION', async () => {
      prisma.application.findUnique.mockResolvedValue(mockApplication as any);

      const updatedApp = { ...mockApplication, status: ApplicationStatus.FIELD_VERIFICATION };
      prisma.application.update.mockResolvedValue(updatedApp as any);

      const result = await service.forwardToFieldVerification('app-1', 'officer-1', remarks);

      expect(result.status).toBe(ApplicationStatus.FIELD_VERIFICATION);
      expect(prisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: ApplicationStatus.SUBMITTED,
                toStatus: ApplicationStatus.FIELD_VERIFICATION,
              }),
            },
          }),
        }),
      );
    });

    it('should throw NotFoundException when application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.forwardToFieldVerification('nonexistent', 'officer-1', remarks),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.forwardToFieldVerification('nonexistent', 'officer-1', remarks),
      ).rejects.toThrow('Application not found');
      expect(prisma.application.update).not.toHaveBeenCalled();
    });
  });
});
