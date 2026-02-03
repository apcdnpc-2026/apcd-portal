import { ApplicationStatus, Role } from '@apcd/database';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { WorkflowAccessGuard } from './workflow-access.guard';

describe('WorkflowAccessGuard', () => {
  let guard: WorkflowAccessGuard;
  let reflector: Reflector;
  let prisma: { application: { findUnique: jest.Mock } };

  const mockHandler = jest.fn();
  const mockClass = jest.fn();

  interface MockUser {
    id: string;
    role: Role;
  }

  interface MockRequestOptions {
    user?: MockUser | null;
    params?: Record<string, string>;
    body?: Record<string, string>;
  }

  const createMockExecutionContext = (options: MockRequestOptions = {}): ExecutionContext => {
    const { user, params = {}, body = {} } = options;
    return {
      getHandler: () => mockHandler,
      getClass: () => mockClass,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          body,
        }),
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
      getType: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    prisma = {
      application: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowAccessGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    guard = module.get<WorkflowAccessGuard>(WorkflowAccessGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ── No decorator (should pass) ──────────────────────────────────────

  describe('no @RequiresWorkflowAccess decorator', () => {
    it('should return true when no workflow access metadata is set', async () => {
      const context = createMockExecutionContext();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(prisma.application.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── Authentication required ─────────────────────────────────────────

  describe('authentication required', () => {
    it('should throw ForbiddenException when no user on request', async () => {
      const context = createMockExecutionContext({
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Authentication required');
    });
  });

  // ── Missing application ID ──────────────────────────────────────────

  describe('missing application ID', () => {
    it('should throw ForbiddenException when no applicationId is provided', async () => {
      const context = createMockExecutionContext({
        user: { id: 'user-1', role: Role.OEM },
        params: {},
        body: {},
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Application ID is required');
    });
  });

  // ── Application not found ──────────────────────────────────────────

  describe('application not found', () => {
    it('should throw NotFoundException when application does not exist', async () => {
      const context = createMockExecutionContext({
        user: { id: 'user-1', role: Role.OEM },
        params: { applicationId: 'nonexistent' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    });
  });

  // ── OEM can view own DRAFT application ──────────────────────────────

  describe('OEM viewing own DRAFT application', () => {
    it('should allow OEM to view their own DRAFT application', async () => {
      const context = createMockExecutionContext({
        user: { id: 'oem-1', role: Role.OEM },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── OEM cannot view another OEM's application ──────────────────────

  describe("OEM cannot view another OEM's application", () => {
    it("should throw ForbiddenException when OEM tries to view another OEM's application", async () => {
      const context = createMockExecutionContext({
        user: { id: 'oem-1', role: Role.OEM },
        params: { applicationId: 'app-2' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-2',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-2',
        assignedOfficerId: null,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'OEM users can only access their own applications',
      );
    });
  });

  // ── OFFICER can edit UNDER_REVIEW application assigned to them ──────

  describe('OFFICER editing assigned UNDER_REVIEW application', () => {
    it('should allow OFFICER to edit an UNDER_REVIEW application assigned to them', async () => {
      const context = createMockExecutionContext({
        user: { id: 'officer-1', role: Role.OFFICER },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('EDIT');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.UNDER_REVIEW,
        applicantId: 'oem-1',
        assignedOfficerId: 'officer-1',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── OFFICER cannot edit application assigned to another officer ─────

  describe('OFFICER cannot edit application assigned to another officer', () => {
    it('should throw ForbiddenException when OFFICER tries to access application assigned to another officer', async () => {
      const context = createMockExecutionContext({
        user: { id: 'officer-1', role: Role.OFFICER },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('EDIT');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.UNDER_REVIEW,
        applicantId: 'oem-1',
        assignedOfficerId: 'officer-2',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Officers can only access applications assigned to them',
      );
    });
  });

  // ── OFFICER cannot edit DRAFT application ──────────────────────────

  describe('OFFICER cannot edit DRAFT application', () => {
    it('should throw ForbiddenException when OFFICER tries to edit a DRAFT application', async () => {
      const context = createMockExecutionContext({
        user: { id: 'officer-1', role: Role.OFFICER },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('EDIT');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Role OFFICER cannot edit applications in DRAFT status',
      );
    });
  });

  // ── COMMITTEE can edit during COMMITTEE_REVIEW ─────────────────────

  describe('COMMITTEE editing during COMMITTEE_REVIEW', () => {
    it('should allow COMMITTEE to edit application in COMMITTEE_REVIEW status', async () => {
      const context = createMockExecutionContext({
        user: { id: 'committee-1', role: Role.COMMITTEE },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('EDIT');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.COMMITTEE_REVIEW,
        applicantId: 'oem-1',
        assignedOfficerId: 'officer-1',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── FIELD_VERIFIER can transition FIELD_VERIFICATION ───────────────

  describe('FIELD_VERIFIER transitioning from FIELD_VERIFICATION', () => {
    it('should allow FIELD_VERIFIER to transition FIELD_VERIFICATION to LAB_TESTING', async () => {
      const context = createMockExecutionContext({
        user: { id: 'verifier-1', role: Role.FIELD_VERIFIER },
        params: { applicationId: 'app-1' },
        body: { targetStatus: ApplicationStatus.LAB_TESTING },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TRANSITION');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.FIELD_VERIFICATION,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow FIELD_VERIFIER to transition FIELD_VERIFICATION to FINAL_REVIEW', async () => {
      const context = createMockExecutionContext({
        user: { id: 'verifier-1', role: Role.FIELD_VERIFIER },
        params: { applicationId: 'app-1' },
        body: { targetStatus: ApplicationStatus.FINAL_REVIEW },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TRANSITION');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.FIELD_VERIFICATION,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── OEM cannot transition SUBMITTED ────────────────────────────────

  describe('OEM cannot transition SUBMITTED', () => {
    it('should throw ForbiddenException when OEM tries to transition SUBMITTED application', async () => {
      const context = createMockExecutionContext({
        user: { id: 'oem-1', role: Role.OEM },
        params: { applicationId: 'app-1' },
        body: { targetStatus: ApplicationStatus.UNDER_REVIEW },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TRANSITION');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.SUBMITTED,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Role OEM cannot transition applications from SUBMITTED status',
      );
    });
  });

  // ── ADMIN can view all statuses ────────────────────────────────────

  describe('ADMIN can view all statuses', () => {
    const allStatuses = Object.values(ApplicationStatus);

    it.each(allStatuses)('should allow ADMIN to view application in %s status', async (status) => {
      const context = createMockExecutionContext({
        user: { id: 'admin-1', role: Role.ADMIN },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── ForbiddenException has descriptive message ─────────────────────

  describe('descriptive error messages', () => {
    it('should include role and status in the error message for view denial', async () => {
      const context = createMockExecutionContext({
        user: { id: 'verifier-1', role: Role.FIELD_VERIFIER },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const message = (error as ForbiddenException).message;
        expect(message).toContain('FIELD_VERIFIER');
        expect(message).toContain('DRAFT');
      }
    });

    it('should include role, from-status, and to-status in transition denial message', async () => {
      const context = createMockExecutionContext({
        user: { id: 'officer-1', role: Role.OFFICER },
        params: { applicationId: 'app-1' },
        body: { targetStatus: ApplicationStatus.APPROVED },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TRANSITION');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.UNDER_REVIEW,
        applicantId: 'oem-1',
        assignedOfficerId: 'officer-1',
      });

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const message = (error as ForbiddenException).message;
        expect(message).toContain('OFFICER');
        expect(message).toContain('UNDER_REVIEW');
        expect(message).toContain('APPROVED');
      }
    });
  });

  // ── Application ID from different sources ──────────────────────────

  describe('application ID extraction', () => {
    it('should read applicationId from params.applicationId', async () => {
      const context = createMockExecutionContext({
        user: { id: 'admin-1', role: Role.ADMIN },
        params: { applicationId: 'app-from-params' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-from-params',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      await guard.canActivate(context);

      expect(prisma.application.findUnique).toHaveBeenCalledWith({
        where: { id: 'app-from-params' },
        select: {
          id: true,
          status: true,
          applicantId: true,
          assignedOfficerId: true,
        },
      });
    });

    it('should read applicationId from params.id as fallback', async () => {
      const context = createMockExecutionContext({
        user: { id: 'admin-1', role: Role.ADMIN },
        params: { id: 'app-from-id' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-from-id',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      await guard.canActivate(context);

      expect(prisma.application.findUnique).toHaveBeenCalledWith({
        where: { id: 'app-from-id' },
        select: {
          id: true,
          status: true,
          applicantId: true,
          assignedOfficerId: true,
        },
      });
    });

    it('should read applicationId from body as last fallback', async () => {
      const context = createMockExecutionContext({
        user: { id: 'admin-1', role: Role.ADMIN },
        params: {},
        body: { applicationId: 'app-from-body' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-from-body',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      await guard.canActivate(context);

      expect(prisma.application.findUnique).toHaveBeenCalledWith({
        where: { id: 'app-from-body' },
        select: {
          id: true,
          status: true,
          applicantId: true,
          assignedOfficerId: true,
        },
      });
    });
  });

  // ── ADMIN and SUPER_ADMIN bypass ownership ─────────────────────────

  describe('ADMIN and SUPER_ADMIN bypass ownership', () => {
    it('should allow ADMIN to view any application regardless of ownership', async () => {
      const context = createMockExecutionContext({
        user: { id: 'admin-1', role: Role.ADMIN },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: 'officer-1',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow SUPER_ADMIN to view any application regardless of ownership', async () => {
      const context = createMockExecutionContext({
        user: { id: 'super-1', role: Role.SUPER_ADMIN },
        params: { applicationId: 'app-1' },
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: 'officer-1',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── Transition without target status ───────────────────────────────

  describe('transition without target status', () => {
    it('should allow transition check when role has transition rights and no targetStatus given', async () => {
      const context = createMockExecutionContext({
        user: { id: 'oem-1', role: Role.OEM },
        params: { applicationId: 'app-1' },
        body: {},
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TRANSITION');
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // ── Attaches application to request ────────────────────────────────

  describe('attaches application to request', () => {
    it('should attach the fetched application to the request object', async () => {
      const mockRequest: Record<string, unknown> = {
        user: { id: 'admin-1', role: Role.ADMIN },
        params: { applicationId: 'app-1' },
        body: {},
      };

      const context = {
        getHandler: () => mockHandler,
        getClass: () => mockClass,
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        }),
        getType: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('VIEW');
      const mockApplication = {
        id: 'app-1',
        status: ApplicationStatus.DRAFT,
        applicantId: 'oem-1',
        assignedOfficerId: null,
      };
      prisma.application.findUnique.mockResolvedValue(mockApplication);

      await guard.canActivate(context);

      expect(mockRequest.application).toEqual(mockApplication);
    });
  });
});
