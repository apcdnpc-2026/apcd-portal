import { ApplicationStatus, Role } from '@apcd/database';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { WORKFLOW_ACCESS_KEY, WorkflowAccessType } from '../decorators/workflow-access.decorator';

/**
 * Defines which roles can VIEW, EDIT, or TRANSITION an application
 * at each status in the workflow.
 */
const WORKFLOW_ACCESS: Record<
  ApplicationStatus,
  {
    VIEW: Role[];
    EDIT: Role[];
    TRANSITION: Array<{ role: Role; toStatuses: ApplicationStatus[] }>;
  }
> = {
  [ApplicationStatus.DRAFT]: {
    VIEW: [Role.OEM, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.OEM],
    TRANSITION: [{ role: Role.OEM, toStatuses: [ApplicationStatus.SUBMITTED] }],
  },
  [ApplicationStatus.SUBMITTED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.UNDER_REVIEW],
      },
      {
        role: Role.SUPER_ADMIN,
        toStatuses: [ApplicationStatus.UNDER_REVIEW],
      },
    ],
  },
  [ApplicationStatus.UNDER_REVIEW]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.OFFICER],
    TRANSITION: [
      {
        role: Role.OFFICER,
        toStatuses: [ApplicationStatus.QUERIED, ApplicationStatus.COMMITTEE_REVIEW],
      },
      {
        role: Role.ADMIN,
        toStatuses: [
          ApplicationStatus.QUERIED,
          ApplicationStatus.COMMITTEE_REVIEW,
          ApplicationStatus.REJECTED,
        ],
      },
    ],
  },
  [ApplicationStatus.QUERIED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.OEM],
    TRANSITION: [
      {
        role: Role.OEM,
        toStatuses: [ApplicationStatus.RESUBMITTED],
      },
      {
        role: Role.OFFICER,
        toStatuses: [ApplicationStatus.UNDER_REVIEW],
      },
    ],
  },
  [ApplicationStatus.RESUBMITTED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.OFFICER,
        toStatuses: [ApplicationStatus.UNDER_REVIEW],
      },
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.UNDER_REVIEW],
      },
    ],
  },
  [ApplicationStatus.COMMITTEE_REVIEW]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.COMMITTEE, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.COMMITTEE],
    TRANSITION: [
      {
        role: Role.COMMITTEE,
        toStatuses: [ApplicationStatus.FIELD_VERIFICATION, ApplicationStatus.REJECTED],
      },
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.FIELD_VERIFICATION, ApplicationStatus.REJECTED],
      },
    ],
  },
  [ApplicationStatus.COMMITTEE_QUERIED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.COMMITTEE, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.OEM],
    TRANSITION: [
      {
        role: Role.OEM,
        toStatuses: [ApplicationStatus.COMMITTEE_REVIEW],
      },
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.COMMITTEE_REVIEW],
      },
    ],
  },
  [ApplicationStatus.FIELD_VERIFICATION]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.FIELD_VERIFIER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.FIELD_VERIFIER],
    TRANSITION: [
      {
        role: Role.FIELD_VERIFIER,
        toStatuses: [ApplicationStatus.LAB_TESTING, ApplicationStatus.FINAL_REVIEW],
      },
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.LAB_TESTING, ApplicationStatus.FINAL_REVIEW],
      },
    ],
  },
  [ApplicationStatus.LAB_TESTING]: {
    VIEW: [Role.ADMIN, Role.SUPER_ADMIN, Role.FIELD_VERIFIER, Role.OFFICER],
    EDIT: [Role.FIELD_VERIFIER],
    TRANSITION: [
      {
        role: Role.FIELD_VERIFIER,
        toStatuses: [ApplicationStatus.FINAL_REVIEW],
      },
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.FINAL_REVIEW],
      },
    ],
  },
  [ApplicationStatus.FINAL_REVIEW]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [Role.ADMIN],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [
          ApplicationStatus.APPROVED,
          ApplicationStatus.PROVISIONALLY_APPROVED,
          ApplicationStatus.REJECTED,
        ],
      },
      {
        role: Role.SUPER_ADMIN,
        toStatuses: [
          ApplicationStatus.APPROVED,
          ApplicationStatus.PROVISIONALLY_APPROVED,
          ApplicationStatus.REJECTED,
        ],
      },
    ],
  },
  [ApplicationStatus.APPROVED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [
          ApplicationStatus.RENEWAL_PENDING,
          ApplicationStatus.EXPIRED,
          ApplicationStatus.SUSPENDED,
          ApplicationStatus.BLACKLISTED,
        ],
      },
    ],
  },
  [ApplicationStatus.PROVISIONALLY_APPROVED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [
          ApplicationStatus.APPROVED,
          ApplicationStatus.REJECTED,
          ApplicationStatus.SUSPENDED,
        ],
      },
    ],
  },
  [ApplicationStatus.REJECTED]: {
    VIEW: [Role.OEM, Role.OFFICER, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [],
  },
  [ApplicationStatus.WITHDRAWN]: {
    VIEW: [Role.OEM, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [],
  },
  [ApplicationStatus.RENEWAL_PENDING]: {
    VIEW: [Role.OEM, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.APPROVED, ApplicationStatus.EXPIRED],
      },
    ],
  },
  [ApplicationStatus.EXPIRED]: {
    VIEW: [Role.OEM, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.RENEWAL_PENDING],
      },
    ],
  },
  [ApplicationStatus.SUSPENDED]: {
    VIEW: [Role.OEM, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [
      {
        role: Role.ADMIN,
        toStatuses: [ApplicationStatus.APPROVED, ApplicationStatus.BLACKLISTED],
      },
    ],
  },
  [ApplicationStatus.BLACKLISTED]: {
    VIEW: [Role.OEM, Role.ADMIN, Role.SUPER_ADMIN],
    EDIT: [],
    TRANSITION: [],
  },
};

/** Default access for any status not explicitly in the map */
const DEFAULT_ACCESS = {
  VIEW: [Role.ADMIN, Role.SUPER_ADMIN] as Role[],
  EDIT: [] as Role[],
  TRANSITION: [] as Array<{ role: Role; toStatuses: ApplicationStatus[] }>,
};

/**
 * Guard that enforces workflow-based access control on application mutations.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, WorkflowAccessGuard)
 *   @RequiresWorkflowAccess('EDIT')
 *   @Patch(':applicationId')
 *   updateApplication(...) { ... }
 *
 * The guard:
 * 1. Reads the applicationId from route params or request body
 * 2. Fetches the application from the database
 * 3. Checks WORKFLOW_ACCESS rules based on application.status + user.role
 * 4. Enforces ownership: OEM can only access own apps, OFFICER only assigned ones
 * 5. ADMIN and SUPER_ADMIN bypass ownership checks
 */
@Injectable()
export class WorkflowAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const accessType = this.reflector.getAllAndOverride<WorkflowAccessType>(WORKFLOW_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @RequiresWorkflowAccess() decorator, skip this guard
    if (!accessType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Extract applicationId from route params or request body
    const applicationId =
      request.params?.applicationId || request.params?.id || request.body?.applicationId;

    if (!applicationId) {
      throw new ForbiddenException('Application ID is required for workflow access check');
    }

    // Fetch the application from the database
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        applicantId: true,
        assignedOfficerId: true,
      },
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${applicationId} not found`);
    }

    // Check ownership constraints (before checking workflow access)
    this.checkOwnership(user, application);

    // Check workflow access based on status + role + accessType
    const statusAccess = WORKFLOW_ACCESS[application.status as ApplicationStatus] || DEFAULT_ACCESS;

    if (accessType === 'VIEW') {
      this.checkViewAccess(user, application, statusAccess);
    } else if (accessType === 'EDIT') {
      this.checkEditAccess(user, application, statusAccess);
    } else if (accessType === 'TRANSITION') {
      this.checkTransitionAccess(user, application, request, statusAccess);
    }

    // Attach application to request for downstream use
    request.application = application;

    return true;
  }

  /**
   * Checks ownership constraints:
   * - OEM can only access their own applications
   * - OFFICER can only access applications assigned to them
   * - ADMIN and SUPER_ADMIN bypass ownership checks
   */
  private checkOwnership(
    user: { id: string; role: Role },
    application: { applicantId: string; assignedOfficerId: string | null },
  ): void {
    // ADMIN and SUPER_ADMIN bypass ownership checks
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      return;
    }

    if (user.role === Role.OEM) {
      if (application.applicantId !== user.id) {
        throw new ForbiddenException(
          'You do not have permission to access this application. OEM users can only access their own applications.',
        );
      }
    }

    if (user.role === Role.OFFICER) {
      if (application.assignedOfficerId && application.assignedOfficerId !== user.id) {
        throw new ForbiddenException(
          'You do not have permission to access this application. Officers can only access applications assigned to them.',
        );
      }
    }
  }

  private checkViewAccess(
    user: { id: string; role: Role },
    application: { status: string },
    statusAccess: (typeof WORKFLOW_ACCESS)[ApplicationStatus],
  ): void {
    if (!statusAccess.VIEW.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} cannot view applications in ${application.status} status`,
      );
    }
  }

  private checkEditAccess(
    user: { id: string; role: Role },
    application: { status: string },
    statusAccess: (typeof WORKFLOW_ACCESS)[ApplicationStatus],
  ): void {
    if (!statusAccess.EDIT.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} cannot edit applications in ${application.status} status`,
      );
    }
  }

  private checkTransitionAccess(
    user: { id: string; role: Role },
    application: { status: string },
    request: { body?: { targetStatus?: string } },
    statusAccess: (typeof WORKFLOW_ACCESS)[ApplicationStatus],
  ): void {
    const targetStatus = request.body?.targetStatus as ApplicationStatus | undefined;

    // Find transition rules for this user's role
    const allowedTransitions = statusAccess.TRANSITION.filter((t) => t.role === user.role);

    if (allowedTransitions.length === 0) {
      throw new ForbiddenException(
        `Role ${user.role} cannot transition applications from ${application.status} status`,
      );
    }

    // If a specific target status was provided, validate it's allowed
    if (targetStatus) {
      const allowedTargets = allowedTransitions.flatMap((t) => t.toStatuses);
      if (!allowedTargets.includes(targetStatus)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot transition application from ${application.status} to ${targetStatus}`,
        );
      }
    }
  }
}

export { WORKFLOW_ACCESS };
