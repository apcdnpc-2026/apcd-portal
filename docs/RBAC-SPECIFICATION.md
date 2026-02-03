# Role-Based Access Control (RBAC) Technical Specification

## APCD OEM Empanelment Portal -- NPC / CPCB

**Version**: 2.0
**Last Updated**: 2026-02-03
**Applicable Standards**: GIGW 3.0, MeitY Cybersecurity Guidelines, IT Act 2000 (Section 43A), CERT-In Directives

---

## Table of Contents

1. [Indian Government Portal Hierarchy](#1-indian-government-portal-hierarchy)
2. [Role Definitions](#2-role-definitions)
3. [Permission Matrix](#3-permission-matrix)
4. [Multi-tenancy and Data Isolation](#4-multi-tenancy-and-data-isolation)
5. [Delegation Patterns](#5-delegation-patterns)
6. [Digital Signature Integration](#6-digital-signature-integration)
7. [Workflow-based Access Control](#7-workflow-based-access-control)
8. [Session Management](#8-session-management)
9. [API Authorization Middleware](#9-api-authorization-middleware)
10. [Database Schema](#10-database-schema)
11. [Audit Requirements](#11-audit-requirements)

---

## 1. Indian Government Portal Hierarchy

### 1.1 General Indian Environmental / Pollution Control Portal Hierarchy

Indian government environmental portals (CPCB, SPCB, APCD Empanelment, PMAY, PARIVESH) follow a consistent hierarchical governance model derived from the constitutional division of Central, State, and Local bodies:

```
Level 0: PLATFORM_OWNER (MeitY / NIC)
  |
Level 1: CENTRAL_AUTHORITY (CPCB / NPC / MoEFCC)
  |--- Central Board Chairman
  |--- Member Secretary
  |--- Director (Technical)
  |--- Joint Director
  |
Level 2: STATE_AUTHORITY (SPCB / State NPC Cell)
  |--- SPCB Chairman
  |--- Member Secretary
  |--- Regional Officer
  |
Level 3: DISTRICT / REGIONAL_OFFICE
  |--- District Environmental Officer
  |--- Sub-Divisional Officer
  |
Level 4: FUNCTIONAL_ROLES (Cut across levels)
  |--- Committee Members (evaluation bodies)
  |--- Field Verifiers / Inspectors
  |--- Dealing Hands / Clerks
  |--- Lab Analysts / Third-party Agencies
  |
Level 5: EXTERNAL_STAKEHOLDERS
  |--- Industry / OEM (applicant)
  |--- Authorized Agents (CA, Consultant)
  |--- Citizens (public view)
```

### 1.2 APCD Portal Specific Hierarchy

The APCD OEM Empanelment Portal is operated by NPC on behalf of CPCB. Its hierarchy maps to the general model as follows:

```
SUPER_ADMIN (System Administrator / IT Admin)
  |--- Platform infrastructure, user account management, system config
  |
ADMIN (Head Officer / NPC Director)
  |--- Full workflow oversight, task assignment, MIS reports, certificate issuance
  |--- Controls: all applications, all assignments, all approvals
  |
OFFICER (NPC Document Verification Officer)
  |--- Document review, query lifecycle, forwarding to committee
  |--- Scope: assigned applications only
  |
COMMITTEE (Expert Evaluation Committee Member)
  |--- 8-criterion scoring, recommendation (approve/reject/field verify)
  |--- Scope: assigned applications in COMMITTEE_REVIEW status
  |
FIELD_VERIFIER (NPC Field Inspection Officer)
  |--- On-site inspection at 3 installation sites per application
  |--- Scope: assigned sites only
  |
DEALING_HAND (Accounts / Payment Support)
  |--- Lab bill upload, manual NEFT/RTGS payment verification
  |--- Scope: payment records linked to applications
  |
OEM (Original Equipment Manufacturer / Applicant)
  |--- Self-service: register, apply, upload documents, pay, respond to queries
  |--- Scope: own applications only
  |
PUBLIC (Unauthenticated)
  |--- View notifications, verify certificates (QR code), view empaneled list
```

### 1.3 Key Workflow Summary from Role Mapping Matrix

From the project's Role Mapping Matrix (source document), the sequential workflow is:

```
Doc Verifier --> Committee --> Field Officer --> Final Review (Committee) --> Head (Approve)
```

- **Head** = Super Admin for functional purposes (All MIS + Task Assignment)
- **System Admin** = IT Only (User accounts, system configuration)
- **OEM** = Self-Service (Own applications lifecycle)
- **Dealing Hand** = Payment support only
- **Public** = Read-only notifications + empaneled list

---

## 2. Role Definitions

### 2.1 Current Roles (Prisma Schema)

The system defines 7 roles in the `Role` enum. Note that the original schema labels `ADMIN` as "Head" and `SUPER_ADMIN` as "IT Admin" -- this reflects the Indian government convention where the Head Officer is the functional super-administrator while the IT admin handles infrastructure.

| Role Enum        | Display Label               | Mapping to Role Matrix | Self-Registration                  |
| ---------------- | --------------------------- | ---------------------- | ---------------------------------- |
| `SUPER_ADMIN`    | System Administrator        | Sys Admin (IT Admin)   | No -- created by platform deployer |
| `ADMIN`          | Head Officer / NPC Director | Head                   | No -- created by SUPER_ADMIN       |
| `OFFICER`        | NPC Verification Officer    | Doc Verifier           | No -- created by ADMIN/SUPER_ADMIN |
| `COMMITTEE`      | Committee Member            | Committee Officer      | No -- created by ADMIN             |
| `FIELD_VERIFIER` | Field Inspection Officer    | Field Officer          | No -- created by ADMIN             |
| `DEALING_HAND`   | Dealing Hand (Accounts)     | Dealing Hand           | No -- created by ADMIN             |
| `OEM`            | OEM Applicant               | OEM Registered         | Yes -- public registration         |

### 2.2 Extended Roles for Multi-level Portal (Future CPCB/SPCB Integration)

When this portal scales to a multi-body deployment (CPCB overseeing multiple SPCBs), the following additional roles would be introduced:

| Extended Role      | Purpose                                         | Jurisdiction         |
| ------------------ | ----------------------------------------------- | -------------------- |
| `CPCB_ADMIN`       | Central board oversight, policy, national MIS   | All states           |
| `SPCB_ADMIN`       | State board head, state-level workflow control  | Single state         |
| `DISTRICT_OFFICER` | District-level field coordination               | Single district      |
| `AUTHORIZED_AGENT` | CA/Consultant filing on behalf of OEM           | Linked OEMs          |
| `INSPECTOR`        | Third-party inspection agency staff             | Assigned inspections |
| `AUDITOR`          | CAG / Internal audit read-only access           | Organization-scoped  |
| `PUBLIC_VIEWER`    | Unauthenticated certificate/notification access | Public data only     |

### 2.3 Role Properties

```typescript
// packages/shared/src/types/role-definitions.ts

export interface RoleDefinition {
  role: Role;
  displayLabel: string;
  description: string;
  level: number; // Hierarchy level (0 = highest)
  canSelfRegister: boolean;
  requiresDigitalSignature: boolean; // For approval actions
  maxSessionDurationMinutes: number; // GIGW compliance
  requiresOTP: boolean; // For sensitive operations
  dataScope: 'GLOBAL' | 'ORGANIZATION' | 'STATE' | 'ASSIGNED' | 'OWN';
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  SUPER_ADMIN: {
    role: Role.SUPER_ADMIN,
    displayLabel: 'System Administrator',
    description: 'IT infrastructure, user account management, system configuration, audit logs',
    level: 0,
    canSelfRegister: false,
    requiresDigitalSignature: false,
    maxSessionDurationMinutes: 30,
    requiresOTP: true,
    dataScope: 'GLOBAL',
  },
  ADMIN: {
    role: Role.ADMIN,
    displayLabel: 'Head Officer',
    description:
      'Full workflow control, task assignment, MIS reports, certificate issuance, final approvals',
    level: 1,
    canSelfRegister: false,
    requiresDigitalSignature: true,
    maxSessionDurationMinutes: 30,
    requiresOTP: true,
    dataScope: 'GLOBAL',
  },
  OFFICER: {
    role: Role.OFFICER,
    displayLabel: 'Verification Officer',
    description: 'Document verification, query management, forwarding to committee',
    level: 2,
    canSelfRegister: false,
    requiresDigitalSignature: false,
    maxSessionDurationMinutes: 30,
    requiresOTP: false,
    dataScope: 'ASSIGNED',
  },
  COMMITTEE: {
    role: Role.COMMITTEE,
    displayLabel: 'Committee Member',
    description: 'Expert evaluation on 8 criteria, scoring, recommendation',
    level: 2,
    canSelfRegister: false,
    requiresDigitalSignature: true,
    maxSessionDurationMinutes: 30,
    requiresOTP: false,
    dataScope: 'ASSIGNED',
  },
  FIELD_VERIFIER: {
    role: Role.FIELD_VERIFIER,
    displayLabel: 'Field Verifier',
    description: 'On-site inspection at installation sites, field report submission',
    level: 3,
    canSelfRegister: false,
    requiresDigitalSignature: false,
    maxSessionDurationMinutes: 60, // Longer for field use
    requiresOTP: false,
    dataScope: 'ASSIGNED',
  },
  DEALING_HAND: {
    role: Role.DEALING_HAND,
    displayLabel: 'Dealing Hand',
    description: 'Lab bill upload, manual payment verification, payment support',
    level: 3,
    canSelfRegister: false,
    requiresDigitalSignature: false,
    maxSessionDurationMinutes: 30,
    requiresOTP: false,
    dataScope: 'ORGANIZATION',
  },
  OEM: {
    role: Role.OEM,
    displayLabel: 'OEM Applicant',
    description: 'Self-service application submission, document upload, payment, query response',
    level: 4,
    canSelfRegister: true,
    requiresDigitalSignature: true, // For declaration signing
    maxSessionDurationMinutes: 30,
    requiresOTP: false,
    dataScope: 'OWN',
  },
};
```

---

## 3. Permission Matrix

### 3.1 Resource-Level Permission Matrix

Based on the Role Mapping Matrix document and the existing codebase endpoint analysis:

#### 3.1.1 Core Operations Matrix

| Resource / Operation     | SUPER_ADMIN | ADMIN          | OFFICER       | COMMITTEE    | FIELD_VERIFIER | DEALING_HAND | OEM        | PUBLIC      |
| ------------------------ | ----------- | -------------- | ------------- | ------------ | -------------- | ------------ | ---------- | ----------- |
| **Applications**         |             |                |               |              |                |              |            |             |
| View All Applications    | No          | Yes            | Assigned      | Assigned     | Assigned       | No           | Own        | No          |
| Create Application       | No          | No             | No            | No           | No             | No           | Yes        | No          |
| Update Draft Application | No          | No             | No            | No           | No             | No           | Own        | No          |
| Submit Application       | No          | No             | No            | No           | No             | No           | Own        | No          |
| Withdraw Application     | No          | No             | No            | No           | No             | No           | Own        | No          |
| Change Status            | No          | Yes            | Forward/Query | Evaluate     | No             | No           | Resubmit   | No          |
| **Documents**            |             |                |               |              |                |              |            |             |
| Upload Documents         | No          | No             | No            | No           | Field Photos   | Lab Bills    | Own App    | No          |
| Download Documents       | No          | Yes            | Assigned App  | Assigned App | Assigned App   | No           | Own App    | No          |
| Verify Documents         | No          | View           | Yes           | No           | No             | No           | No         | No          |
| **Queries**              |             |                |               |              |                |              |            |             |
| Raise Query              | No          | View           | Yes           | Yes          | No             | No           | No         | No          |
| Respond to Query         | No          | No             | No            | No           | No             | No           | Own Query  | No          |
| Resolve Query            | No          | View           | Yes           | Yes          | No             | No           | No         | No          |
| **Committee Evaluation** |             |                |               |              |                |              |            |             |
| View Pending Evaluations | No          | View Recos     | No            | Assigned     | No             | No           | No         | No          |
| Submit Evaluation Score  | No          | No             | No            | Yes          | No             | No           | No         | No          |
| Forward to Committee     | No          | Assign         | Yes           | No           | No             | No           | No         | No          |
| **Field Verification**   |             |                |               |              |                |              |            |             |
| View Assignments         | No          | Assign         | No            | No           | Own            | No           | Coordinate | No          |
| Submit Field Report      | No          | View Report    | No            | No           | Yes            | No           | No         | No          |
| Assign Field Verifier    | No          | Yes            | No            | No           | No             | No           | No         | No          |
| **Payments**             |             |                |               |              |                |              |            |             |
| Calculate Fees           | No          | View           | No            | No           | No             | No           | Yes        | No          |
| Make Payment (Razorpay)  | No          | No             | No            | No           | No             | No           | Yes        | No          |
| Record Manual NEFT       | No          | No             | No            | No           | No             | No           | Yes        | No          |
| Verify Manual Payment    | No          | View           | Yes           | No           | No             | Yes          | No         | No          |
| Refund Payment           | No          | Yes            | No            | No           | No             | No           | No         | No          |
| **Certificates**         |             |                |               |              |                |              |            |             |
| Issue Provisional Cert   | No          | Yes            | No            | No           | No             | No           | No         | No          |
| Issue Final Cert (QR)    | No          | Yes            | No            | No           | No             | No           | Download   | No          |
| Verify Certificate       | No          | Yes            | No            | No           | No             | No           | Yes        | Yes         |
| Revoke/Suspend Cert      | No          | Yes            | No            | No           | No             | No           | No         | No          |
| **User Management**      |             |                |               |              |                |              |            |             |
| Create User (any role)   | IT Only     | Assign/Replace | No            | No           | No             | No           | No         | No          |
| View Users               | Yes         | Yes            | No            | No           | No             | No           | No         | No          |
| Toggle User Active       | Yes         | No             | No            | No           | No             | No           | No         | No          |
| Reset Password           | Yes         | No             | No            | No           | No             | No           | No         | No          |
| **MIS & Reports**        |             |                |               |              |                |              |            |             |
| View Dashboard           | IT Logs     | Dashboard      | Own Stats     | Own Stats    | Own Stats      | No           | Own Stats  | No          |
| View MIS Reports         | IT Logs     | Yes            | No            | No           | No             | No           | No         | No          |
| Export Reports           | No          | Yes            | No            | No           | No             | No           | No         | No          |
| **Notifications**        |             |                |               |              |                |              |            |             |
| View Notifications       | System      | Yes            | Own           | Own          | Own            | Own          | Own        | Public Only |
| **Renewal**              |             |                |               |              |                |              |            |             |
| View Renewal List        | No          | View           | No            | No           | No             | No           | View       | Public      |
| Apply for Renewal        | No          | No             | No            | No           | No             | No           | Yes        | No          |

### 3.2 Event-Wise Activity Matrix (from Role Mapping Document)

This maps directly from the project's `Role Mapping Matrix.pdf`:

| #   | Event                | Public    | OEM                   | Doc Verifier (OFFICER) | Committee        | Field Officer | Dealing Hand | Head (ADMIN)   | Sys Admin |
| --- | -------------------- | --------- | --------------------- | ---------------------- | ---------------- | ------------- | ------------ | -------------- | --------- |
| 1   | Notification View    | View      | -                     | -                      | -                | -             | -            | View           | -         |
| 2   | New Application      | -         | Submit                | -                      | -                | -             | -            | View           | -         |
| 3   | Document Upload      | -         | Upload (6 geo-images) | -                      | -                | -             | -            | View           | -         |
| 4   | App Submission       | -         | Submit+Pay            | -                      | -                | -             | -            | View           | -         |
| 5   | Doc Validation       | -         | Wait                  | Validate/Query         | -                | -             | -            | View           | -         |
| 6   | Query Response       | -         | Reply                 | Review Reply           | -                | -             | -            | View           | -         |
| 7   | Committee Assignment | -         | Wait                  | Complete               | -                | -             | -            | Assign         | -         |
| 8   | Merit Review         | -         | Wait                  | -                      | Review+Recommend | -             | -            | View Recos     | -         |
| 9   | Provisional Cert     | -         | Wait                  | -                      | -                | -             | -            | Issue          | -         |
| 10  | Field Assignment     | -         | Wait                  | -                      | -                | -             | -            | Assign         | -         |
| 11  | Field Visit          | -         | Coordinate            | -                      | -                | Report Upload | -            | View Report    | -         |
| 12  | Final Review         | -         | Wait                  | -                      | Final Decision   | -             | -            | Approve        | -         |
| 13  | Final Cert           | -         | Download              | -                      | -                | -             | -            | Issue QR       | -         |
| 14  | Lab Bill Upload      | -         | -                     | -                      | -                | -             | Upload Bill  | Approve        | -         |
| 15  | Payment/Refund       | -         | Pay/Refund            | -                      | -                | -             | -            | View           | -         |
| 16  | Renewal              | View List | Apply                 | -                      | -                | -             | -            | View           | -         |
| 17  | User Management      | -         | -                     | -                      | -                | -             | -            | Assign/Replace | IT Only   |
| 18  | MIS Reports          | -         | -                     | -                      | -                | -             | -            | Dashboard      | IT Logs   |

### 3.3 Permission Encoding (Granular Action Strings)

For the codebase, permissions are encoded as fine-grained action strings to support the NestJS decorator pattern:

```typescript
// packages/shared/src/constants/permissions.ts

export enum Permission {
  // Application lifecycle
  APPLICATION_CREATE = 'application:create',
  APPLICATION_READ_OWN = 'application:read:own',
  APPLICATION_READ_ASSIGNED = 'application:read:assigned',
  APPLICATION_READ_ALL = 'application:read:all',
  APPLICATION_UPDATE_OWN = 'application:update:own',
  APPLICATION_SUBMIT = 'application:submit',
  APPLICATION_WITHDRAW = 'application:withdraw',
  APPLICATION_CHANGE_STATUS = 'application:change_status',

  // Document operations
  DOCUMENT_UPLOAD_OWN = 'document:upload:own',
  DOCUMENT_UPLOAD_FIELD = 'document:upload:field',
  DOCUMENT_UPLOAD_LAB_BILL = 'document:upload:lab_bill',
  DOCUMENT_DOWNLOAD_OWN = 'document:download:own',
  DOCUMENT_DOWNLOAD_ASSIGNED = 'document:download:assigned',
  DOCUMENT_DOWNLOAD_ALL = 'document:download:all',
  DOCUMENT_VERIFY = 'document:verify',

  // Query operations
  QUERY_RAISE = 'query:raise',
  QUERY_RESPOND_OWN = 'query:respond:own',
  QUERY_RESOLVE = 'query:resolve',
  QUERY_VIEW_ALL = 'query:view:all',

  // Evaluation
  EVALUATION_VIEW_ASSIGNED = 'evaluation:view:assigned',
  EVALUATION_VIEW_ALL = 'evaluation:view:all',
  EVALUATION_SUBMIT = 'evaluation:submit',
  EVALUATION_FINALIZE = 'evaluation:finalize',

  // Field Verification
  FIELD_ASSIGNMENT_CREATE = 'field:assignment:create',
  FIELD_ASSIGNMENT_VIEW_OWN = 'field:assignment:view:own',
  FIELD_REPORT_SUBMIT = 'field:report:submit',
  FIELD_REPORT_VIEW = 'field:report:view',

  // Payments
  PAYMENT_CREATE = 'payment:create',
  PAYMENT_VERIFY = 'payment:verify',
  PAYMENT_REFUND = 'payment:refund',
  PAYMENT_VIEW_OWN = 'payment:view:own',
  PAYMENT_VIEW_ALL = 'payment:view:all',

  // Certificates
  CERTIFICATE_ISSUE = 'certificate:issue',
  CERTIFICATE_REVOKE = 'certificate:revoke',
  CERTIFICATE_DOWNLOAD_OWN = 'certificate:download:own',
  CERTIFICATE_VERIFY_PUBLIC = 'certificate:verify:public',

  // User management
  USER_CREATE = 'user:create',
  USER_VIEW_ALL = 'user:view:all',
  USER_TOGGLE_ACTIVE = 'user:toggle_active',
  USER_RESET_PASSWORD = 'user:reset_password',
  USER_ASSIGN_ROLE = 'user:assign_role',

  // MIS & Reports
  MIS_VIEW_DASHBOARD = 'mis:view:dashboard',
  MIS_VIEW_REPORTS = 'mis:view:reports',
  MIS_EXPORT = 'mis:export',
  MIS_VIEW_AUDIT_LOGS = 'mis:view:audit_logs',

  // System
  SYSTEM_CONFIG = 'system:config',
  SYSTEM_FEE_CONFIG = 'system:fee_config',
  SYSTEM_APCD_MASTER = 'system:apcd_master',

  // Notifications
  NOTIFICATION_VIEW_OWN = 'notification:view:own',
  NOTIFICATION_VIEW_ALL = 'notification:view:all',
  NOTIFICATION_VIEW_PUBLIC = 'notification:view:public',
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    Permission.USER_CREATE,
    Permission.USER_VIEW_ALL,
    Permission.USER_TOGGLE_ACTIVE,
    Permission.USER_RESET_PASSWORD,
    Permission.MIS_VIEW_AUDIT_LOGS,
    Permission.SYSTEM_CONFIG,
    Permission.NOTIFICATION_VIEW_ALL,
  ],

  ADMIN: [
    Permission.APPLICATION_READ_ALL,
    Permission.APPLICATION_CHANGE_STATUS,
    Permission.DOCUMENT_DOWNLOAD_ALL,
    Permission.QUERY_VIEW_ALL,
    Permission.EVALUATION_VIEW_ALL,
    Permission.EVALUATION_FINALIZE,
    Permission.FIELD_ASSIGNMENT_CREATE,
    Permission.FIELD_REPORT_VIEW,
    Permission.PAYMENT_VIEW_ALL,
    Permission.PAYMENT_REFUND,
    Permission.CERTIFICATE_ISSUE,
    Permission.CERTIFICATE_REVOKE,
    Permission.USER_CREATE,
    Permission.USER_VIEW_ALL,
    Permission.USER_ASSIGN_ROLE,
    Permission.MIS_VIEW_DASHBOARD,
    Permission.MIS_VIEW_REPORTS,
    Permission.MIS_EXPORT,
    Permission.SYSTEM_FEE_CONFIG,
    Permission.SYSTEM_APCD_MASTER,
    Permission.NOTIFICATION_VIEW_ALL,
  ],

  OFFICER: [
    Permission.APPLICATION_READ_ASSIGNED,
    Permission.APPLICATION_CHANGE_STATUS,
    Permission.DOCUMENT_DOWNLOAD_ASSIGNED,
    Permission.DOCUMENT_VERIFY,
    Permission.QUERY_RAISE,
    Permission.QUERY_RESOLVE,
    Permission.PAYMENT_VERIFY,
    Permission.MIS_VIEW_DASHBOARD,
    Permission.NOTIFICATION_VIEW_OWN,
  ],

  COMMITTEE: [
    Permission.APPLICATION_READ_ASSIGNED,
    Permission.DOCUMENT_DOWNLOAD_ASSIGNED,
    Permission.QUERY_RAISE,
    Permission.QUERY_RESOLVE,
    Permission.EVALUATION_VIEW_ASSIGNED,
    Permission.EVALUATION_SUBMIT,
    Permission.MIS_VIEW_DASHBOARD,
    Permission.NOTIFICATION_VIEW_OWN,
  ],

  FIELD_VERIFIER: [
    Permission.APPLICATION_READ_ASSIGNED,
    Permission.DOCUMENT_UPLOAD_FIELD,
    Permission.DOCUMENT_DOWNLOAD_ASSIGNED,
    Permission.FIELD_ASSIGNMENT_VIEW_OWN,
    Permission.FIELD_REPORT_SUBMIT,
    Permission.MIS_VIEW_DASHBOARD,
    Permission.NOTIFICATION_VIEW_OWN,
  ],

  DEALING_HAND: [
    Permission.DOCUMENT_UPLOAD_LAB_BILL,
    Permission.PAYMENT_VERIFY,
    Permission.PAYMENT_VIEW_ALL,
    Permission.NOTIFICATION_VIEW_OWN,
  ],

  OEM: [
    Permission.APPLICATION_CREATE,
    Permission.APPLICATION_READ_OWN,
    Permission.APPLICATION_UPDATE_OWN,
    Permission.APPLICATION_SUBMIT,
    Permission.APPLICATION_WITHDRAW,
    Permission.DOCUMENT_UPLOAD_OWN,
    Permission.DOCUMENT_DOWNLOAD_OWN,
    Permission.QUERY_RESPOND_OWN,
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_VIEW_OWN,
    Permission.CERTIFICATE_DOWNLOAD_OWN,
    Permission.CERTIFICATE_VERIFY_PUBLIC,
    Permission.MIS_VIEW_DASHBOARD,
    Permission.NOTIFICATION_VIEW_OWN,
  ],
};
```

---

## 4. Multi-tenancy and Data Isolation

### 4.1 Current Architecture (Single-Tenant)

The APCD portal currently operates as a **single-tenant** system for NPC/CPCB. Data isolation is achieved through **row-level ownership** rather than tenant-level partitioning:

- **OEM data isolation**: Each OEM sees only their own applications via `applicantId` filtering
- **Officer scoping**: Officers see only `assignedOfficerId` matching their user ID
- **Committee scoping**: Committee members see only applications in `COMMITTEE_REVIEW` status (no per-member assignment at DB level currently)
- **Field Verifier scoping**: Via `FieldReport.verifierId` and assigned sites

### 4.2 Multi-tenant Architecture (CPCB/SPCB Expansion)

When expanding to support multiple SPCBs under CPCB, the following tenant model applies:

```typescript
// Proposed schema additions for multi-tenancy

model Organization {
  id            String    @id @default(uuid())
  code          String    @unique               // e.g., "CPCB", "MPSPCB", "GSPCB"
  name          String                           // "Madhya Pradesh State Pollution Control Board"
  type          OrgType                          // CENTRAL, STATE, DISTRICT, AGENCY
  parentId      String?   @map("parent_id")
  state         String?                          // ISO state code for SPCBs
  district      String?                          // For district offices
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())

  parent        Organization?  @relation("OrgHierarchy", fields: [parentId], references: [id])
  children      Organization[] @relation("OrgHierarchy")
  users         User[]

  @@map("organizations")
}

enum OrgType {
  CENTRAL       // CPCB, NPC
  STATE         // SPCB
  DISTRICT      // District Environmental Office
  AGENCY        // Third-party lab, inspection agency
  INDUSTRY      // OEM / Industry
}

// Add to User model:
//   organizationId  String?  @map("organization_id")
//   organization    Organization? @relation(fields: [organizationId], references: [id])
```

### 4.3 Data Isolation Strategy (Row-Level Security)

```typescript
// apps/api/src/common/interceptors/tenant-scope.interceptor.ts

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Injects tenant-scoping WHERE clause into all Prisma queries
 * based on the authenticated user's organization hierarchy.
 *
 * For CPCB users: no filter (national view)
 * For SPCB users: filter by state matching organization.state
 * For District: filter by district
 * For OEM: filter by applicantId = userId
 */
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return next.handle();

    // Attach scoping context that services can use
    request.tenantScope = this.buildScope(user);
    return next.handle();
  }

  private buildScope(user: { role: string; organizationId?: string; sub: string }) {
    switch (user.role) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return { type: 'GLOBAL' as const };

      case 'OFFICER':
      case 'COMMITTEE':
      case 'FIELD_VERIFIER':
        return {
          type: 'ASSIGNED' as const,
          userId: user.sub,
          // In multi-tenant: also filter by organizationId
          organizationId: user.organizationId,
        };

      case 'DEALING_HAND':
        return {
          type: 'ORGANIZATION' as const,
          organizationId: user.organizationId,
        };

      case 'OEM':
        return {
          type: 'OWN' as const,
          userId: user.sub,
        };

      default:
        return { type: 'NONE' as const };
    }
  }
}
```

### 4.4 State-Level Data Isolation (SPCB Model)

For SPCB-level partitioning, apply PostgreSQL Row-Level Security (RLS):

```sql
-- Enable RLS on applications table
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- CPCB users see all applications
CREATE POLICY cpcb_all_access ON applications
  FOR ALL
  TO cpcb_role
  USING (true);

-- SPCB users see only their state's applications
CREATE POLICY spcb_state_access ON applications
  FOR ALL
  TO spcb_role
  USING (
    EXISTS (
      SELECT 1 FROM oem_profiles op
      JOIN users u ON u.id = applications.applicant_id
      JOIN organizations o ON o.id = u.organization_id
      WHERE op.state = current_setting('app.current_state')
    )
  );

-- OEM users see only their own applications
CREATE POLICY oem_own_access ON applications
  FOR ALL
  TO oem_role
  USING (applicant_id = current_setting('app.current_user_id')::uuid);

-- Set session variables on each request (from middleware)
-- SET LOCAL app.current_user_id = '<user-uuid>';
-- SET LOCAL app.current_state = 'Madhya Pradesh';
```

---

## 5. Delegation Patterns

### 5.1 Delegation Model for Indian Government Portals

Indian government portals require delegation mechanisms for:

1. **Leave/transfer**: When an officer goes on leave, their workload must be temporarily reassigned
2. **Acting-in-charge**: Senior officer delegates authority to a junior temporarily
3. **Bulk reassignment**: When an officer transfers, all their pending work moves to a replacement
4. **Committee rotation**: Committee members may be added/removed between evaluation cycles

### 5.2 Delegation Schema

```typescript
// Proposed schema addition

model Delegation {
  id              String    @id @default(uuid())
  delegatorId     String    @map("delegator_id")        // User granting authority
  delegateId      String    @map("delegate_id")          // User receiving authority
  delegationType  DelegationType @map("delegation_type")
  reason          String                                  // "Annual Leave", "Transfer", etc.
  startDate       DateTime  @map("start_date")
  endDate         DateTime? @map("end_date")             // null = indefinite (transfer)
  scope           Json?                                   // Optional: specific application IDs
  isActive        Boolean   @default(true)
  approvedBy      String?   @map("approved_by")          // Must be ADMIN or higher
  revokedAt       DateTime? @map("revoked_at")
  createdAt       DateTime  @default(now())

  delegator  User @relation("DelegationsGiven", fields: [delegatorId], references: [id])
  delegate   User @relation("DelegationsReceived", fields: [delegateId], references: [id])
  approver   User? @relation("DelegationsApproved", fields: [approvedBy], references: [id])

  @@index([delegatorId])
  @@index([delegateId])
  @@index([startDate, endDate])
  @@map("delegations")
}

enum DelegationType {
  TEMPORARY       // Leave coverage (auto-expires on endDate)
  ACTING_CHARGE   // Temporary authority elevation
  TRANSFER        // Permanent reassignment
  COMMITTEE_ADD   // Added to evaluation committee
}
```

### 5.3 Delegation Middleware

```typescript
// apps/api/src/common/guards/delegation.guard.ts

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * After RolesGuard checks base role, DelegationGuard checks if
 * the current user has active delegated authority that grants
 * additional permissions.
 */
@Injectable()
export class DelegationGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const now = new Date();

    // Find active delegations where this user is the delegate
    const activeDelegations = await this.prisma.delegation.findMany({
      where: {
        delegateId: user.sub,
        isActive: true,
        startDate: { lte: now },
        OR: [
          { endDate: null }, // Permanent
          { endDate: { gte: now } }, // Not yet expired
        ],
        revokedAt: null,
      },
      include: {
        delegator: { select: { role: true } },
      },
    });

    if (activeDelegations.length > 0) {
      // Attach delegated roles to request for downstream use
      request.delegatedAuthority = activeDelegations.map((d) => ({
        delegationId: d.id,
        delegatorRole: d.delegator.role,
        type: d.delegationType,
        scope: d.scope,
      }));
    }

    return true; // Always passes -- it enriches context, doesn't block
  }
}
```

### 5.4 Bulk Reassignment (Head Officer Action)

The Head (ADMIN) can reassign all pending applications from one officer to another:

```typescript
// In admin.service.ts -- reassignment logic

async reassignApplications(
  fromUserId: string,
  toUserId: string,
  reason: string,
  adminUserId: string,
): Promise<{ reassignedCount: number }> {
  // Validate both users exist and have compatible roles
  const [fromUser, toUser] = await Promise.all([
    this.prisma.user.findUniqueOrThrow({ where: { id: fromUserId } }),
    this.prisma.user.findUniqueOrThrow({ where: { id: toUserId } }),
  ]);

  if (fromUser.role !== toUser.role) {
    throw new BadRequestException('Cannot reassign between different roles');
  }

  // Reassign all non-terminal applications
  const result = await this.prisma.application.updateMany({
    where: {
      assignedOfficerId: fromUserId,
      status: {
        notIn: ['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'BLACKLISTED'],
      },
    },
    data: { assignedOfficerId: toUserId },
  });

  // Create delegation record for audit
  await this.prisma.delegation.create({
    data: {
      delegatorId: fromUserId,
      delegateId: toUserId,
      delegationType: 'TRANSFER',
      reason,
      startDate: new Date(),
      approvedBy: adminUserId,
    },
  });

  // Audit log
  await this.prisma.auditLog.create({
    data: {
      userId: adminUserId,
      action: 'BULK_REASSIGNMENT',
      entityType: 'User',
      entityId: fromUserId,
      newValues: {
        fromUserId,
        toUserId,
        reason,
        reassignedCount: result.count,
      },
    },
  });

  return { reassignedCount: result.count };
}
```

---

## 6. Digital Signature Integration

### 6.1 Indian Digital Signature Framework

Indian government portals must comply with the IT Act 2000 and the Controller of Certifying Authorities (CCA) framework. Two primary mechanisms are used:

| Method                                  | Legal Basis             | Use Case                                                                                    |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| **DSC (Digital Signature Certificate)** | IT Act 2000, Section 3  | Class 3 DSC required for government filings; issued by licensed CAs (eMudhra, Sify, NIC CA) |
| **Aadhaar eSign**                       | IT Act 2000, Section 3A | OTP-based electronic signature via Aadhaar; valid for most government services              |

### 6.2 Signature Integration Points in APCD Workflow

| Action                            | Signer Role    | Signature Type       | Legal Requirement                                         |
| --------------------------------- | -------------- | -------------------- | --------------------------------------------------------- |
| OEM Declaration (Step 9)          | OEM            | Aadhaar eSign or DSC | Mandatory -- declaration of accuracy                      |
| Committee Evaluation Finalization | COMMITTEE      | DSC (Class 3)        | Recommended -- expert recommendation carries legal weight |
| Provisional Certificate Issuance  | ADMIN          | DSC (Class 3)        | Mandatory -- official government issuance                 |
| Final Certificate Issuance        | ADMIN          | DSC (Class 3)        | Mandatory -- legal empanelment document                   |
| Field Report Finalization         | FIELD_VERIFIER | Aadhaar eSign        | Mandatory -- site inspection attestation                  |
| Certificate Revocation            | ADMIN          | DSC (Class 3)        | Mandatory -- adverse action requires legal signature      |

### 6.3 eSign Integration Architecture

```typescript
// apps/api/src/modules/esign/esign.service.ts

import { Injectable } from '@nestjs/common';

/**
 * Integration with Aadhaar eSign (ESP -- eSign Service Provider)
 * Compliant with CCA eSign API Specification v2.1
 *
 * Flow:
 * 1. Create eSign request with document hash (SHA-256)
 * 2. Redirect user to ESP (e.g., NSDL, eMudhra) for Aadhaar OTP
 * 3. ESP returns signed PKCS#7 response
 * 4. Verify signature and attach to document record
 */
export interface ESignRequest {
  documentHash: string; // SHA-256 of document to sign
  signerName: string;
  signerAadhaarVid?: string; // Virtual ID (not actual Aadhaar)
  purpose: string; // Displayed on consent screen
  callbackUrl: string;
  transactionId: string; // Unique per signing attempt
}

export interface ESignResponse {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  signedDocumentHash?: string;
  pkcs7Signature?: string; // Base64-encoded PKCS#7
  certificateChain?: string;
  signerName?: string;
  signatureTimestamp?: Date;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class ESignService {
  private readonly espBaseUrl: string;
  private readonly aspId: string; // Application Service Provider ID

  constructor(private configService: ConfigService) {
    this.espBaseUrl = this.configService.getOrThrow('ESIGN_ESP_URL');
    this.aspId = this.configService.getOrThrow('ESIGN_ASP_ID');
  }

  /**
   * Initiate eSign flow for a document
   */
  async initiateESign(request: ESignRequest): Promise<{ redirectUrl: string }> {
    // Build eSign XML as per CCA API v2.1 specification
    const esignXml = this.buildESignXml(request);

    // Submit to ESP gateway
    const response = await this.submitToESP(esignXml);

    return {
      redirectUrl: `${this.espBaseUrl}/esign/consent?txn=${request.transactionId}`,
    };
  }

  /**
   * Handle ESP callback with signed response
   */
  async handleCallback(espResponse: string): Promise<ESignResponse> {
    // Parse ESP XML response
    const parsed = this.parseESPResponse(espResponse);

    if (parsed.status === 'SUCCESS') {
      // Verify PKCS#7 signature against CCA root certificate
      await this.verifyCertificateChain(parsed.pkcs7Signature, parsed.certificateChain);
    }

    return parsed;
  }

  private buildESignXml(request: ESignRequest): string {
    /* ... */
  }
  private async submitToESP(xml: string): Promise<string> {
    /* ... */
  }
  private parseESPResponse(xml: string): ESignResponse {
    /* ... */
  }
  private async verifyCertificateChain(sig: string, chain: string): Promise<void> {
    /* ... */
  }
}
```

### 6.4 Signature Verification Schema

```typescript
// Proposed schema addition

model DigitalSignature {
  id              String    @id @default(uuid())
  userId          String    @map("user_id")
  entityType      String    @map("entity_type")       // "Application", "Certificate", "FieldReport"
  entityId        String    @map("entity_id")
  action          String                               // "DECLARATION_SIGN", "CERTIFICATE_ISSUE"
  signatureType   SignatureType @map("signature_type") // DSC or ESIGN
  documentHash    String    @map("document_hash")      // SHA-256 of signed document
  pkcs7Signature  String?   @map("pkcs7_signature")    // Base64 PKCS#7
  certificateDn   String?   @map("certificate_dn")     // Signer certificate Distinguished Name
  certificateSerial String? @map("certificate_serial")
  issuingCa       String?   @map("issuing_ca")         // e.g., "NIC CA 2020"
  signedAt        DateTime  @map("signed_at")
  isValid         Boolean   @default(true) @map("is_valid")
  verificationLog Json?     @map("verification_log")
  createdAt       DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@map("digital_signatures")
}

enum SignatureType {
  DSC_CLASS_3     // Hardware-token-based Digital Signature Certificate
  AADHAAR_ESIGN   // Aadhaar OTP-based electronic signature
}
```

### 6.5 RBAC Guard for Signature-Required Actions

```typescript
// apps/api/src/common/guards/signature-required.guard.ts

import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const SIGNATURE_REQUIRED_KEY = 'signatureRequired';
export const SignatureRequired = (type: 'DSC' | 'ESIGN' | 'ANY') =>
  SetMetadata(SIGNATURE_REQUIRED_KEY, type);

@Injectable()
export class SignatureRequiredGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredType = this.reflector.getAllAndOverride<string>(SIGNATURE_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredType) return true;

    const request = context.switchToHttp().getRequest();
    const signatureProof = request.headers['x-digital-signature'];
    const signatureType = request.headers['x-signature-type'];

    if (!signatureProof) {
      throw new BadRequestException(
        'This action requires a digital signature. Please sign using DSC or Aadhaar eSign.',
      );
    }

    if (requiredType !== 'ANY' && signatureType !== requiredType) {
      throw new BadRequestException(
        `This action requires ${requiredType} signature. Received: ${signatureType}`,
      );
    }

    return true;
  }
}

// Usage in controller:
// @Post(':id/issue-certificate')
// @Roles(Role.ADMIN)
// @SignatureRequired('DSC')
// async issueCertificate(@Param('id') id: string) { ... }
```

---

## 7. Workflow-based Access Control

### 7.1 Status-Dependent Permissions

Access to application data and operations changes based on the application's current status. This is a critical pattern in Indian government portals where workflow stages gate who can act.

```typescript
// packages/shared/src/constants/workflow-access.ts

import { ApplicationStatus } from '../types/application.types';

/**
 * Maps application status to which roles can perform which actions.
 * This extends basic RBAC with state-machine-aware authorization.
 */
export const WORKFLOW_ACCESS: Record<ApplicationStatus, WorkflowStageAccess> = {
  [ApplicationStatus.DRAFT]: {
    canView: ['OEM'],
    canEdit: ['OEM'],
    canTransition: ['OEM'], // Submit or Withdraw
    allowedTransitions: {
      OEM: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN],
    },
  },

  [ApplicationStatus.SUBMITTED]: {
    canView: ['OEM', 'OFFICER', 'ADMIN'],
    canEdit: [],
    canTransition: ['OFFICER', 'ADMIN'],
    allowedTransitions: {
      OFFICER: [ApplicationStatus.UNDER_REVIEW],
      ADMIN: [ApplicationStatus.UNDER_REVIEW],
    },
  },

  [ApplicationStatus.UNDER_REVIEW]: {
    canView: ['OEM', 'OFFICER', 'ADMIN'],
    canEdit: ['OFFICER'], // Can mark documents verified
    canTransition: ['OFFICER', 'ADMIN'],
    allowedTransitions: {
      OFFICER: [
        ApplicationStatus.QUERIED,
        ApplicationStatus.COMMITTEE_REVIEW,
        ApplicationStatus.REJECTED,
      ],
      ADMIN: [
        ApplicationStatus.QUERIED,
        ApplicationStatus.COMMITTEE_REVIEW,
        ApplicationStatus.REJECTED,
      ],
    },
  },

  [ApplicationStatus.QUERIED]: {
    canView: ['OEM', 'OFFICER', 'ADMIN'],
    canEdit: ['OEM'], // Can respond to queries and upload documents
    canTransition: ['OEM'],
    allowedTransitions: {
      OEM: [ApplicationStatus.RESUBMITTED, ApplicationStatus.WITHDRAWN],
    },
  },

  [ApplicationStatus.RESUBMITTED]: {
    canView: ['OEM', 'OFFICER', 'ADMIN'],
    canEdit: [],
    canTransition: ['OFFICER', 'ADMIN'],
    allowedTransitions: {
      OFFICER: [ApplicationStatus.UNDER_REVIEW],
      ADMIN: [ApplicationStatus.UNDER_REVIEW],
    },
  },

  [ApplicationStatus.COMMITTEE_REVIEW]: {
    canView: ['OEM', 'OFFICER', 'COMMITTEE', 'ADMIN'],
    canEdit: ['COMMITTEE'], // Can submit evaluation
    canTransition: ['COMMITTEE', 'ADMIN'],
    allowedTransitions: {
      COMMITTEE: [
        ApplicationStatus.COMMITTEE_QUERIED,
        ApplicationStatus.FIELD_VERIFICATION,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
      ],
      ADMIN: [
        ApplicationStatus.FIELD_VERIFICATION,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
      ],
    },
  },

  [ApplicationStatus.COMMITTEE_QUERIED]: {
    canView: ['OEM', 'OFFICER', 'COMMITTEE', 'ADMIN'],
    canEdit: ['OEM'],
    canTransition: ['OFFICER', 'ADMIN'],
    allowedTransitions: {
      OFFICER: [ApplicationStatus.COMMITTEE_REVIEW],
      ADMIN: [ApplicationStatus.COMMITTEE_REVIEW],
    },
  },

  [ApplicationStatus.FIELD_VERIFICATION]: {
    canView: ['OEM', 'FIELD_VERIFIER', 'ADMIN'],
    canEdit: ['FIELD_VERIFIER'], // Can submit field reports
    canTransition: ['ADMIN'],
    allowedTransitions: {
      ADMIN: [ApplicationStatus.LAB_TESTING, ApplicationStatus.FINAL_REVIEW],
    },
  },

  [ApplicationStatus.LAB_TESTING]: {
    canView: ['OEM', 'DEALING_HAND', 'ADMIN'],
    canEdit: ['DEALING_HAND'], // Can upload lab bills
    canTransition: ['ADMIN'],
    allowedTransitions: {
      ADMIN: [ApplicationStatus.FINAL_REVIEW],
    },
  },

  [ApplicationStatus.FINAL_REVIEW]: {
    canView: ['OEM', 'COMMITTEE', 'ADMIN'],
    canEdit: ['COMMITTEE'],
    canTransition: ['COMMITTEE', 'ADMIN'],
    allowedTransitions: {
      COMMITTEE: [
        ApplicationStatus.APPROVED,
        ApplicationStatus.PROVISIONALLY_APPROVED,
        ApplicationStatus.REJECTED,
      ],
      ADMIN: [
        ApplicationStatus.APPROVED,
        ApplicationStatus.PROVISIONALLY_APPROVED,
        ApplicationStatus.REJECTED,
      ],
    },
  },

  [ApplicationStatus.APPROVED]: {
    canView: ['OEM', 'OFFICER', 'COMMITTEE', 'ADMIN'],
    canEdit: [],
    canTransition: ['ADMIN'],
    allowedTransitions: {
      ADMIN: [
        ApplicationStatus.RENEWAL_PENDING,
        ApplicationStatus.EXPIRED,
        ApplicationStatus.SUSPENDED,
        ApplicationStatus.BLACKLISTED,
      ],
    },
  },

  [ApplicationStatus.PROVISIONALLY_APPROVED]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: [],
    canTransition: ['ADMIN'],
    allowedTransitions: {
      ADMIN: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED, ApplicationStatus.SUSPENDED],
    },
  },

  // Terminal states
  [ApplicationStatus.REJECTED]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: [],
    canTransition: [],
    allowedTransitions: {},
  },
  [ApplicationStatus.WITHDRAWN]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: [],
    canTransition: [],
    allowedTransitions: {},
  },
  [ApplicationStatus.BLACKLISTED]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: [],
    canTransition: [],
    allowedTransitions: {},
  },

  [ApplicationStatus.RENEWAL_PENDING]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: ['OEM'],
    canTransition: ['ADMIN'],
    allowedTransitions: {
      ADMIN: [ApplicationStatus.APPROVED, ApplicationStatus.EXPIRED],
    },
  },

  [ApplicationStatus.EXPIRED]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: [],
    canTransition: ['OEM'],
    allowedTransitions: {
      OEM: [ApplicationStatus.RENEWAL_PENDING],
    },
  },

  [ApplicationStatus.SUSPENDED]: {
    canView: ['OEM', 'ADMIN'],
    canEdit: [],
    canTransition: ['ADMIN'],
    allowedTransitions: {
      ADMIN: [ApplicationStatus.APPROVED, ApplicationStatus.BLACKLISTED],
    },
  },
};

export interface WorkflowStageAccess {
  canView: string[];
  canEdit: string[];
  canTransition: string[];
  allowedTransitions: Record<string, ApplicationStatus[]>;
}
```

### 7.2 Workflow Access Guard

```typescript
// apps/api/src/common/guards/workflow-access.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { WORKFLOW_ACCESS } from '@apcd/shared';

export type WorkflowAction = 'VIEW' | 'EDIT' | 'TRANSITION';

export const WORKFLOW_ACTION_KEY = 'workflowAction';
export const RequiresWorkflowAccess = (action: WorkflowAction) =>
  SetMetadata(WORKFLOW_ACTION_KEY, action);

@Injectable()
export class WorkflowAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<WorkflowAction>(WORKFLOW_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!action) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const applicationId = request.params.id || request.params.applicationId;

    if (!applicationId) return true; // Not an application-scoped route

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { status: true, applicantId: true, assignedOfficerId: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const stageAccess = WORKFLOW_ACCESS[application.status];
    if (!stageAccess) {
      throw new ForbiddenException('Unknown application status');
    }

    const userRole = user.role;
    let hasAccess = false;

    switch (action) {
      case 'VIEW':
        hasAccess = stageAccess.canView.includes(userRole);
        break;
      case 'EDIT':
        hasAccess = stageAccess.canEdit.includes(userRole);
        break;
      case 'TRANSITION':
        hasAccess = stageAccess.canTransition.includes(userRole);
        break;
    }

    // Additional ownership check for OEM
    if (hasAccess && userRole === 'OEM' && application.applicantId !== user.sub) {
      throw new ForbiddenException('You can only access your own applications');
    }

    // Additional assignment check for OFFICER
    if (
      hasAccess &&
      userRole === 'OFFICER' &&
      application.assignedOfficerId &&
      application.assignedOfficerId !== user.sub
    ) {
      throw new ForbiddenException('This application is assigned to another officer');
    }

    if (!hasAccess) {
      throw new ForbiddenException(
        `Role ${userRole} cannot ${action} applications in ${application.status} status`,
      );
    }

    return true;
  }
}
```

---

## 8. Session Management

### 8.1 GIGW 3.0 Compliance Requirements

The **Guidelines for Indian Government Websites (GIGW) 3.0** and **MeitY Cybersecurity Framework** mandate:

| Requirement                  | Specification                                                       | Current Implementation                                  |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| Session timeout (inactivity) | 15-30 minutes for sensitive portals                                 | 15 min JWT access token                                 |
| Absolute session timeout     | Max 8 hours regardless of activity                                  | 7-day refresh token (reduce to 8h for govt compliance)  |
| Concurrent session limit     | Max 1-3 active sessions per user                                    | Not enforced (should add)                               |
| Session fixation prevention  | New session ID after login                                          | JWT rotation on refresh                                 |
| Secure cookie attributes     | `HttpOnly`, `Secure`, `SameSite=Strict`                             | JWT in response body (move to HttpOnly cookie for GIGW) |
| Logout invalidation          | Server-side session/token invalidation                              | Refresh token revocation in DB                          |
| OTP requirement              | For sensitive operations (ADMIN/SUPER_ADMIN logins, password reset) | Not yet implemented                                     |
| Password policy              | 8+ chars, mixed case, number, special                               | Enforced in RegisterDto                                 |
| Account lockout              | Lock after 5 failed attempts for 30 minutes                         | Not yet implemented                                     |
| CAPTCHA                      | On login/registration to prevent bots                               | Not yet implemented                                     |

### 8.2 OTP-Based Login for Government Officers

```typescript
// apps/api/src/modules/auth/otp.service.ts

import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class OtpService {
  private redis: Redis;
  private readonly OTP_EXPIRY_SECONDS = 300; // 5 minutes
  private readonly MAX_ATTEMPTS = 3;
  private readonly LOCKOUT_SECONDS = 1800; // 30 minutes

  constructor(private configService: ConfigService) {
    this.redis = new Redis(this.configService.get('REDIS_URL'));
  }

  /**
   * Generate and send OTP for two-factor authentication.
   * Required for ADMIN and SUPER_ADMIN roles per GIGW guidelines.
   */
  async generateOTP(userId: string, phone: string): Promise<{ expiresIn: number }> {
    const lockKey = `otp:lockout:${userId}`;
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      throw new BadRequestException(
        'Account temporarily locked due to multiple failed OTP attempts. Try after 30 minutes.',
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with expiry
    const otpKey = `otp:${userId}`;
    await this.redis.setex(otpKey, this.OTP_EXPIRY_SECONDS, otp);

    // Reset attempt counter
    const attemptKey = `otp:attempts:${userId}`;
    await this.redis.setex(attemptKey, this.OTP_EXPIRY_SECONDS, '0');

    // Send via SMS gateway (NIC SMS Gateway / CDAC)
    await this.sendSMS(
      phone,
      `Your APCD Portal OTP is: ${otp}. Valid for 5 minutes. Do not share.`,
    );

    return { expiresIn: this.OTP_EXPIRY_SECONDS };
  }

  /**
   * Verify OTP
   */
  async verifyOTP(userId: string, submittedOtp: string): Promise<boolean> {
    const lockKey = `otp:lockout:${userId}`;
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      throw new UnauthorizedException('Account locked. Try after 30 minutes.');
    }

    const otpKey = `otp:${userId}`;
    const storedOtp = await this.redis.get(otpKey);

    if (!storedOtp) {
      throw new BadRequestException('OTP expired or not generated. Request a new one.');
    }

    const attemptKey = `otp:attempts:${userId}`;
    const attempts = parseInt((await this.redis.get(attemptKey)) || '0', 10);

    if (submittedOtp !== storedOtp) {
      const newAttempts = attempts + 1;
      await this.redis.setex(attemptKey, this.OTP_EXPIRY_SECONDS, newAttempts.toString());

      if (newAttempts >= this.MAX_ATTEMPTS) {
        await this.redis.setex(lockKey, this.LOCKOUT_SECONDS, 'locked');
        await this.redis.del(otpKey);
        throw new UnauthorizedException(
          'Maximum OTP attempts exceeded. Account locked for 30 minutes.',
        );
      }

      throw new UnauthorizedException(
        `Invalid OTP. ${this.MAX_ATTEMPTS - newAttempts} attempts remaining.`,
      );
    }

    // OTP verified -- clean up
    await this.redis.del(otpKey);
    await this.redis.del(attemptKey);

    return true;
  }

  /**
   * Send SMS via NIC/CDAC SMS Gateway
   * (Production: integrate with https://smsgw.sms.gov.in API)
   */
  private async sendSMS(phone: string, message: string): Promise<void> {
    // Integration with government SMS gateway
    // Uses DLT-registered template for regulatory compliance
    console.log(`[SMS] To: ${phone}, Message: ${message}`);
  }
}
```

### 8.3 Enhanced Session Configuration

```typescript
// apps/api/src/modules/auth/session.config.ts

import { Role } from '@apcd/database';

/**
 * Session timeout configuration per GIGW 3.0 and MeitY guidelines.
 * Government portals handling sensitive data must enforce strict session management.
 */
export const SESSION_CONFIG = {
  // JWT access token expiry by role sensitivity
  accessTokenExpiry: {
    [Role.SUPER_ADMIN]: '10m', // Most sensitive -- shorter
    [Role.ADMIN]: '15m',
    [Role.OFFICER]: '15m',
    [Role.COMMITTEE]: '15m',
    [Role.FIELD_VERIFIER]: '30m', // Longer for field operations with poor connectivity
    [Role.DEALING_HAND]: '15m',
    [Role.OEM]: '15m',
  } as Record<Role, string>,

  // Refresh token validity
  refreshTokenDays: 1, // GIGW: max absolute session = 8 hours (use 1 day with activity check)

  // Concurrent session limits
  maxConcurrentSessions: {
    [Role.SUPER_ADMIN]: 1, // Single session only
    [Role.ADMIN]: 2,
    [Role.OFFICER]: 2,
    [Role.COMMITTEE]: 2,
    [Role.FIELD_VERIFIER]: 3, // May use mobile + desktop
    [Role.DEALING_HAND]: 2,
    [Role.OEM]: 3,
  } as Record<Role, number>,

  // Roles requiring OTP for login
  otpRequiredRoles: [Role.SUPER_ADMIN, Role.ADMIN],

  // Roles requiring OTP for sensitive operations (certificate issuance, user management)
  otpForSensitiveOps: [Role.SUPER_ADMIN, Role.ADMIN, Role.OFFICER],

  // Account lockout
  maxFailedLoginAttempts: 5,
  lockoutDurationMinutes: 30,

  // Password policy
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireLowercase: true,
  passwordRequireNumber: true,
  passwordRequireSpecial: true,
  passwordExpiryDays: 90, // GIGW: force password change every 90 days
  passwordHistoryCount: 5, // Cannot reuse last 5 passwords

  // CAPTCHA
  captchaOnLogin: true,
  captchaOnRegistration: true,
  captchaProvider: 'GOV_CAPTCHA', // NIC CAPTCHA service
};
```

### 8.4 Account Lockout Implementation

```typescript
// apps/api/src/modules/auth/login-attempt.service.ts

@Injectable()
export class LoginAttemptService {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis(this.configService.get('REDIS_URL'));
  }

  async recordFailedAttempt(
    email: string,
  ): Promise<{ locked: boolean; remainingAttempts: number }> {
    const key = `login:failed:${email.toLowerCase()}`;
    const lockKey = `login:locked:${email.toLowerCase()}`;

    // Check if already locked
    if (await this.redis.get(lockKey)) {
      return { locked: true, remainingAttempts: 0 };
    }

    const attempts = await this.redis.incr(key);
    await this.redis.expire(key, SESSION_CONFIG.lockoutDurationMinutes * 60);

    if (attempts >= SESSION_CONFIG.maxFailedLoginAttempts) {
      await this.redis.setex(lockKey, SESSION_CONFIG.lockoutDurationMinutes * 60, 'locked');
      await this.redis.del(key);
      return { locked: true, remainingAttempts: 0 };
    }

    return {
      locked: false,
      remainingAttempts: SESSION_CONFIG.maxFailedLoginAttempts - attempts,
    };
  }

  async clearFailedAttempts(email: string): Promise<void> {
    await this.redis.del(`login:failed:${email.toLowerCase()}`);
  }

  async isLocked(email: string): Promise<boolean> {
    return !!(await this.redis.get(`login:locked:${email.toLowerCase()}`));
  }
}
```

---

## 9. API Authorization Middleware

### 9.1 Current Guard Stack

The APCD portal uses a three-layer guard stack applied globally in `app.module.ts`:

```
Request --> JwtAuthGuard --> RolesGuard --> Controller Handler
              |                 |
              |                 +-- Checks @Roles() decorator metadata
              +-- Checks JWT validity, skips if @Public()
```

### 9.2 Enhanced Guard Stack (Recommended)

```
Request
  |
  v
[1] RateLimitGuard        -- @nestjs/throttler (100 req/60s default)
  |
  v
[2] JwtAuthGuard           -- JWT validation, @Public() bypass
  |
  v
[3] AccountStatusGuard     -- Check user.isActive, session concurrency
  |
  v
[4] RolesGuard             -- Check @Roles() metadata
  |
  v
[5] DelegationGuard        -- Check active delegations, enrich request
  |
  v
[6] WorkflowAccessGuard    -- Check @RequiresWorkflowAccess() vs application status
  |
  v
[7] SignatureRequiredGuard  -- Check @SignatureRequired() for DSC/eSign
  |
  v
[8] AuditLogInterceptor    -- Log mutating operations to audit_logs
  |
  v
Controller Handler
```

### 9.3 Route-Level Authorization Patterns

```typescript
// apps/api/src/modules/verification/verification.controller.ts
// Demonstrates the layered authorization pattern

@Controller('api/verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  /**
   * Only OFFICER and ADMIN can view pending applications.
   * Route-level RBAC via @Roles() decorator.
   */
  @Get('pending')
  @Roles(Role.OFFICER, Role.ADMIN)
  async getPending(@CurrentUser() user: JwtPayload) {
    return this.verificationService.getPendingApplications(user.sub);
  }

  /**
   * View application detail -- workflow-aware access.
   * OFFICER can view only assigned applications in reviewable statuses.
   */
  @Get('application/:id')
  @Roles(Role.OFFICER, Role.ADMIN)
  @RequiresWorkflowAccess('VIEW')
  async getApplicationDetail(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.verificationService.getApplicationDetail(id, user.sub, user.role);
  }

  /**
   * Raise a query -- requires OFFICER role AND application must be in
   * UNDER_REVIEW or RESUBMITTED status.
   */
  @Post('application/:id/query')
  @Roles(Role.OFFICER)
  @RequiresWorkflowAccess('EDIT')
  async raiseQuery(
    @Param('id') id: string,
    @Body() dto: RaiseQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verificationService.raiseQuery(id, user.sub, dto);
  }

  /**
   * Forward to committee -- requires OFFICER role, application must be in
   * UNDER_REVIEW status, all mandatory documents must be verified.
   */
  @Post('application/:id/forward-to-committee')
  @Roles(Role.OFFICER, Role.ADMIN)
  @RequiresWorkflowAccess('TRANSITION')
  async forwardToCommittee(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.verificationService.forwardToCommittee(id, user.sub);
  }
}
```

### 9.4 Field-Level Access Control

Certain fields should be hidden or read-only based on role:

```typescript
// apps/api/src/common/interceptors/field-filter.interceptor.ts

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Filters response fields based on the requesting user's role.
 * Prevents sensitive data exposure (e.g., OEMs shouldn't see
 * internal officer notes, committee scores before finalization).
 */
@Injectable()
export class FieldFilterInterceptor implements NestInterceptor {
  private static readonly FIELD_RULES: Record<string, FieldRule[]> = {
    Application: [
      // Internal remarks -- only visible to officers and above
      { field: 'rejectionReason', hiddenFromRoles: ['OEM'] },
      { field: 'assignedOfficerId', hiddenFromRoles: ['OEM'] },
      // Committee scores -- hidden from OEM until final decision
      { field: 'evaluations', hiddenFromRoles: ['OEM'], unlessStatus: ['APPROVED', 'REJECTED'] },
      // Field reports -- hidden from OEM until final review
      { field: 'fieldReports', hiddenFromRoles: ['OEM'], unlessStatus: ['APPROVED', 'REJECTED'] },
    ],
    Payment: [
      // Razorpay internal IDs
      { field: 'razorpaySignature', hiddenFromRoles: ['OEM', 'COMMITTEE', 'FIELD_VERIFIER'] },
      // Verification notes -- internal
      { field: 'verificationNote', hiddenFromRoles: ['OEM'] },
    ],
    User: [
      // Password hash never exposed
      { field: 'passwordHash', hiddenFromRoles: ['*'] },
      // Phone numbers -- only visible to self or admin
      { field: 'phone', hiddenFromRoles: ['COMMITTEE', 'FIELD_VERIFIER', 'DEALING_HAND'] },
    ],
  };

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const userRole = request.user?.role;

    if (!userRole) return next.handle();

    return next.handle().pipe(map((data) => this.filterFields(data, userRole)));
  }

  private filterFields(data: unknown, role: string): unknown {
    if (!data || typeof data !== 'object') return data;

    // Deep clone to avoid mutating cached data
    const filtered = JSON.parse(JSON.stringify(data));

    for (const [entityType, rules] of Object.entries(FieldFilterInterceptor.FIELD_RULES)) {
      for (const rule of rules) {
        if (rule.hiddenFromRoles.includes('*') || rule.hiddenFromRoles.includes(role)) {
          this.removeField(filtered, rule.field);
        }
      }
    }

    return filtered;
  }

  private removeField(obj: Record<string, unknown>, field: string): void {
    if (field in obj) {
      delete obj[field];
    }
    // Handle nested in data wrapper
    if (
      obj.data &&
      typeof obj.data === 'object' &&
      field in (obj.data as Record<string, unknown>)
    ) {
      delete (obj.data as Record<string, unknown>)[field];
    }
  }
}

interface FieldRule {
  field: string;
  hiddenFromRoles: string[];
  unlessStatus?: string[]; // Override: show if application is in these statuses
}
```

### 9.5 API Route Permission Summary

Mapping existing controllers to the guard stack:

| Module             | Route Pattern                                                 | Roles                 | Workflow Guard | Signature           |
| ------------------ | ------------------------------------------------------------- | --------------------- | -------------- | ------------------- |
| Auth               | `POST /api/auth/register`                                     | @Public               | -              | -                   |
| Auth               | `POST /api/auth/login`                                        | @Public               | -              | -                   |
| Auth               | `GET /api/auth/me`                                            | Any authenticated     | -              | -                   |
| Applications       | `POST /api/applications`                                      | OEM                   | -              | -                   |
| Applications       | `PUT /api/applications/:id`                                   | OEM                   | EDIT           | -                   |
| Applications       | `POST /api/applications/:id/submit`                           | OEM                   | TRANSITION     | eSign (declaration) |
| Verification       | `GET /api/verification/pending`                               | OFFICER, ADMIN        | -              | -                   |
| Verification       | `POST /api/verification/application/:id/query`                | OFFICER               | EDIT           | -                   |
| Verification       | `POST /api/verification/application/:id/forward-to-committee` | OFFICER, ADMIN        | TRANSITION     | -                   |
| Committee          | `POST /api/committee/application/:id/evaluate`                | COMMITTEE             | EDIT           | DSC                 |
| Field Verification | `POST /api/field-verification/application/:id/report`         | FIELD_VERIFIER        | EDIT           | eSign               |
| Payments           | `POST /api/payments/razorpay/create-order`                    | OEM                   | -              | -                   |
| Payments           | `PUT /api/payments/:id/verify`                                | OFFICER, DEALING_HAND | -              | -                   |
| Certificates       | `POST /api/certificates/:id/issue`                            | ADMIN                 | -              | DSC                 |
| Certificates       | `GET /api/certificates/verify/:number`                        | @Public               | -              | -                   |
| Admin              | `GET /api/admin/users`                                        | ADMIN, SUPER_ADMIN    | -              | -                   |
| Admin              | `POST /api/admin/users`                                       | SUPER_ADMIN           | -              | OTP                 |

---

## 10. Database Schema

### 10.1 Current RBAC Tables

The existing schema uses a **flat role column** on the `User` table:

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String   @map("password_hash")
  role          Role     // Single role per user (enum)
  isActive      Boolean  @default(true)
  isVerified    Boolean  @default(false)
  firstName     String
  lastName      String
  phone         String?
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // ... relations
}

enum Role {
  OEM
  OFFICER
  COMMITTEE
  FIELD_VERIFIER
  DEALING_HAND
  ADMIN
  SUPER_ADMIN
}
```

This is adequate for the current single-organization, single-role-per-user model.

### 10.2 Extended RBAC Schema (for Multi-role, Multi-tenant)

When the portal needs to support multiple roles per user, organizations, and fine-grained permissions:

```sql
-- ============================================================================
-- EXTENDED RBAC SCHEMA (PostgreSQL)
-- For CPCB/SPCB multi-tenant expansion
-- ============================================================================

-- Organizations (tenants)
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20) UNIQUE NOT NULL,        -- "CPCB", "MPSPCB", "UPSPCB"
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(20) NOT NULL,               -- CENTRAL, STATE, DISTRICT, AGENCY, INDUSTRY
  parent_id       UUID REFERENCES organizations(id),
  state_code      VARCHAR(5),                          -- IN-MP, IN-UP, etc.
  district_code   VARCHAR(10),
  address         TEXT,
  contact_email   VARCHAR(255),
  contact_phone   VARCHAR(20),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_parent ON organizations(parent_id);
CREATE INDEX idx_org_state ON organizations(state_code);
CREATE INDEX idx_org_type ON organizations(type);

-- Roles (configurable, not just enum)
CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) UNIQUE NOT NULL,         -- "SUPER_ADMIN", "SPCB_ADMIN", "OFFICER"
  display_name    VARCHAR(100) NOT NULL,
  description     TEXT,
  level           INT NOT NULL DEFAULT 0,              -- Hierarchy level
  is_system_role  BOOLEAN DEFAULT false,               -- Cannot be deleted
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions (fine-grained actions)
CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(100) UNIQUE NOT NULL,        -- "application:create", "certificate:issue"
  resource        VARCHAR(50) NOT NULL,                -- "application", "certificate", "user"
  action          VARCHAR(50) NOT NULL,                -- "create", "read", "update", "delete"
  scope           VARCHAR(20) DEFAULT 'ALL',           -- "OWN", "ASSIGNED", "ORGANIZATION", "ALL"
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_perm_resource ON permissions(resource);

-- Role-Permission mapping (many-to-many)
CREATE TABLE role_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_rp_role ON role_permissions(role_id);
CREATE INDEX idx_rp_permission ON role_permissions(permission_id);

-- User-Role mapping (many-to-many, organization-scoped)
CREATE TABLE user_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),  -- Scopes role to an org
  assigned_by     UUID REFERENCES users(id),
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,                         -- For temporary assignments
  is_active       BOOLEAN DEFAULT true,

  UNIQUE(user_id, role_id, organization_id)
);

CREATE INDEX idx_ur_user ON user_roles(user_id);
CREATE INDEX idx_ur_role ON user_roles(role_id);
CREATE INDEX idx_ur_org ON user_roles(organization_id);

-- Users (extended with organization)
-- Add to existing users table:
ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN last_password_hashes JSONB DEFAULT '[]';  -- For password history

CREATE INDEX idx_users_org ON users(organization_id);

-- Delegations (authority delegation between users)
CREATE TABLE delegations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id    UUID NOT NULL REFERENCES users(id),
  delegate_id     UUID NOT NULL REFERENCES users(id),
  delegation_type VARCHAR(20) NOT NULL,                -- TEMPORARY, ACTING_CHARGE, TRANSFER
  reason          TEXT NOT NULL,
  start_date      TIMESTAMPTZ NOT NULL,
  end_date        TIMESTAMPTZ,                         -- NULL for permanent
  scope           JSONB,                               -- Optional: specific application IDs
  approved_by     UUID REFERENCES users(id),
  is_active       BOOLEAN DEFAULT true,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deleg_delegator ON delegations(delegator_id);
CREATE INDEX idx_deleg_delegate ON delegations(delegate_id);
CREATE INDEX idx_deleg_active ON delegations(is_active, start_date, end_date);

-- Digital Signatures
CREATE TABLE digital_signatures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  entity_type       VARCHAR(50) NOT NULL,
  entity_id         UUID NOT NULL,
  action            VARCHAR(100) NOT NULL,
  signature_type    VARCHAR(20) NOT NULL,               -- DSC_CLASS_3, AADHAAR_ESIGN
  document_hash     VARCHAR(64) NOT NULL,               -- SHA-256
  pkcs7_signature   TEXT,
  certificate_dn    VARCHAR(500),
  certificate_serial VARCHAR(100),
  issuing_ca        VARCHAR(200),
  signed_at         TIMESTAMPTZ NOT NULL,
  is_valid          BOOLEAN DEFAULT true,
  verification_log  JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_digsig_entity ON digital_signatures(entity_type, entity_id);
CREATE INDEX idx_digsig_user ON digital_signatures(user_id);

-- Session tracking (for concurrent session limits)
CREATE TABLE active_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_id UUID REFERENCES refresh_tokens(id) ON DELETE CASCADE,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  device_info     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_activity   TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_sessions_expires ON active_sessions(expires_at);

-- Audit logs (existing, enhanced)
-- Add to existing audit_logs table:
ALTER TABLE audit_logs ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE audit_logs ADD COLUMN session_id UUID;
ALTER TABLE audit_logs ADD COLUMN request_method VARCHAR(10);
ALTER TABLE audit_logs ADD COLUMN request_path VARCHAR(500);
ALTER TABLE audit_logs ADD COLUMN response_status INT;
ALTER TABLE audit_logs ADD COLUMN duration_ms INT;

CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_session ON audit_logs(session_id);
```

### 10.3 Prisma Schema Additions

```prisma
// Additions to packages/database/prisma/schema.prisma

model Organization {
  id          String    @id @default(uuid())
  code        String    @unique
  name        String
  type        OrgType
  parentId    String?   @map("parent_id")
  stateCode   String?   @map("state_code")
  districtCode String?  @map("district_code")
  address     String?
  contactEmail String?  @map("contact_email")
  contactPhone String?  @map("contact_phone")
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  parent   Organization?  @relation("OrgHierarchy", fields: [parentId], references: [id])
  children Organization[] @relation("OrgHierarchy")
  users    User[]

  @@index([parentId])
  @@index([stateCode])
  @@map("organizations")
}

enum OrgType {
  CENTRAL
  STATE
  DISTRICT
  AGENCY
  INDUSTRY
}

model Delegation {
  id              String    @id @default(uuid())
  delegatorId     String    @map("delegator_id")
  delegateId      String    @map("delegate_id")
  delegationType  String    @map("delegation_type")
  reason          String
  startDate       DateTime  @map("start_date")
  endDate         DateTime? @map("end_date")
  scope           Json?
  approvedBy      String?   @map("approved_by")
  isActive        Boolean   @default(true) @map("is_active")
  revokedAt       DateTime? @map("revoked_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  delegator User @relation("DelegationsGiven", fields: [delegatorId], references: [id])
  delegate  User @relation("DelegationsReceived", fields: [delegateId], references: [id])

  @@index([delegatorId])
  @@index([delegateId])
  @@index([isActive, startDate, endDate])
  @@map("delegations")
}

model DigitalSignature {
  id                String   @id @default(uuid())
  userId            String   @map("user_id")
  entityType        String   @map("entity_type")
  entityId          String   @map("entity_id")
  action            String
  signatureType     String   @map("signature_type")
  documentHash      String   @map("document_hash")
  pkcs7Signature    String?  @map("pkcs7_signature")
  certificateDn     String?  @map("certificate_dn")
  certificateSerial String?  @map("certificate_serial")
  issuingCa         String?  @map("issuing_ca")
  signedAt          DateTime @map("signed_at")
  isValid           Boolean  @default(true) @map("is_valid")
  verificationLog   Json?    @map("verification_log")
  createdAt         DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@map("digital_signatures")
}

model ActiveSession {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  ipAddress       String?  @map("ip_address")
  userAgent       String?  @map("user_agent")
  deviceInfo      Json?    @map("device_info")
  createdAt       DateTime @default(now()) @map("created_at")
  lastActivity    DateTime @default(now()) @map("last_activity")
  expiresAt       DateTime @map("expires_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("active_sessions")
}
```

### 10.4 ER Diagram (Extended RBAC)

```
+----------------+     +----------------+     +------------------+
| Organization   |     |    User        |     |  ActiveSession   |
+----------------+     +----------------+     +------------------+
| id (PK)        |<----| org_id (FK)    |---->| user_id (FK)     |
| code           |     | id (PK)        |     | ip_address       |
| name           |     | email          |     | last_activity    |
| type           |     | role (enum)    |     | expires_at       |
| parent_id (FK) |     | is_active      |     +------------------+
| state_code     |     +-------+--------+
+----------------+             |
                         +-----+-----+
                         |           |
                  +------v----+ +----v-----------+
                  | user_roles | |  Delegation    |
                  +-----------+ +----------------+
                  | user_id   | | delegator_id   |
                  | role_id   | | delegate_id    |
                  | org_id    | | type           |
                  | expires_at| | start/end date |
                  +-----+-----+ | approved_by    |
                        |       +----------------+
                  +-----v-----+
                  |   roles    |
                  +-----------+
                  | id (PK)   |
                  | code      |
                  | level     |
                  +-----+-----+
                        |
                  +-----v-----------+     +---------------+
                  | role_permissions |     | permissions   |
                  +-----------------+     +---------------+
                  | role_id (FK)    |---->| id (PK)       |
                  | permission_id   |     | code          |
                  +-----------------+     | resource      |
                                          | action        |
                                          | scope         |
                                          +---------------+

+---------------------+     +--------------+
| DigitalSignature    |     |  AuditLog    |
+---------------------+     +--------------+
| user_id (FK)        |     | user_id (FK) |
| entity_type         |     | org_id (FK)  |
| entity_id           |     | action       |
| signature_type      |     | entity_type  |
| document_hash       |     | entity_id    |
| pkcs7_signature     |     | old_values   |
| signed_at           |     | new_values   |
+---------------------+     | ip_address   |
                             | created_at   |
                             +--------------+
```

---

## 11. Audit Requirements

### 11.1 Regulatory Requirements

Indian government portals must maintain audit trails per:

| Regulation                          | Requirement                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| **IT Act 2000, Section 43A**        | Reasonable security practices including access logging                                          |
| **CERT-In Directions (April 2022)** | Maintain logs for 180 days rolling; synchronize clocks via NTP; report incidents within 6 hours |
| **GIGW 3.0**                        | All user actions logged with timestamp, IP, user-agent                                          |
| **CAG Audit Standards**             | Full trail of who approved what, when, with what authority                                      |
| **RTI Act 2005**                    | Citizens may request access to decision-making records                                          |

### 11.2 Current Audit Implementation

The existing `AuditLogInterceptor` captures:

| Field        | Description                  | Current Status                    |
| ------------ | ---------------------------- | --------------------------------- |
| `userId`     | Who performed the action     | Captured from JWT                 |
| `action`     | Controller.handler name      | Captured automatically            |
| `entityType` | Derived from controller name | Captured                          |
| `entityId`   | From route params `:id`      | Captured                          |
| `oldValues`  | State before mutation        | **NOT captured** (only newValues) |
| `newValues`  | Response data                | Captured                          |
| `ipAddress`  | Request IP                   | Captured                          |
| `userAgent`  | Browser/client info          | Captured                          |
| `createdAt`  | Timestamp                    | Auto-generated                    |

### 11.3 Enhanced Audit Requirements

```typescript
// Enhanced audit log entry structure

export interface AuditLogEntry {
  // Identity
  id: string;
  userId: string | null; // null for unauthenticated actions
  userEmail: string;
  userRole: string;
  organizationId: string | null; // For multi-tenant

  // Session context
  sessionId: string | null;
  ipAddress: string;
  userAgent: string;
  geoLocation?: {
    // Optional: IP-based geolocation
    country: string;
    state: string;
    city: string;
  };

  // Action details
  action: string; // Standardized: "APPLICATION_SUBMITTED", "QUERY_RAISED"
  actionCategory: AuditCategory; // AUTH, APPLICATION, PAYMENT, CERTIFICATE, USER_MGMT, SYSTEM
  httpMethod: string; // GET, POST, PUT, DELETE
  requestPath: string; // /api/verification/application/abc-123/query

  // Entity tracking
  entityType: string; // "Application", "Payment", "Certificate", "User"
  entityId: string;

  // Change tracking (critical for govt compliance)
  oldValues: Record<string, unknown> | null; // State BEFORE the change
  newValues: Record<string, unknown> | null; // State AFTER the change
  changedFields: string[]; // ["status", "assignedOfficerId"]

  // Delegation/authority context
  actingOnBehalfOf?: string; // If action performed via delegation
  delegationId?: string;

  // Digital signature (if action was signed)
  digitalSignatureId?: string;

  // Technical
  responseStatus: number; // HTTP status code
  durationMs: number; // Processing time
  errorMessage?: string; // If action failed

  // Compliance timestamps
  createdAt: Date;
  serverTimestamp: Date; // NTP-synchronized (CERT-In requirement)
}

export enum AuditCategory {
  AUTH = 'AUTH', // Login, logout, password change, OTP
  APPLICATION = 'APPLICATION', // Application CRUD, status changes
  DOCUMENT = 'DOCUMENT', // Upload, download, verify
  QUERY = 'QUERY', // Raise, respond, resolve
  EVALUATION = 'EVALUATION', // Committee scoring, recommendation
  FIELD_VERIFICATION = 'FIELD_VERIFICATION',
  PAYMENT = 'PAYMENT', // Payment, refund, verification
  CERTIFICATE = 'CERTIFICATE', // Issue, revoke, suspend
  USER_MANAGEMENT = 'USER_MANAGEMENT', // Create, deactivate, role change
  DELEGATION = 'DELEGATION', // Authority delegation
  SYSTEM = 'SYSTEM', // Config changes, fee updates
  DATA_ACCESS = 'DATA_ACCESS', // Sensitive data views (PII, financial)
}
```

### 11.4 Enhanced Audit Interceptor with Before/After Capture

```typescript
// apps/api/src/common/interceptors/audit-log-enhanced.interceptor.ts

@Injectable()
export class EnhancedAuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const startTime = Date.now();

    // Skip GET requests unless they access sensitive data
    const isSensitiveGet = this.isSensitiveDataAccess(request);
    if (['GET', 'HEAD', 'OPTIONS'].includes(method) && !isSensitiveGet) {
      return next.handle();
    }

    const user = request.user as { sub?: string; email?: string; role?: string } | undefined;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const entityId = request.params?.id || request.params?.applicationId || 'N/A';

    // Capture BEFORE state for mutations
    const beforeStatePromise = this.captureBeforeState(controllerName, entityId);

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const oldValues = await beforeStatePromise;
          const duration = Date.now() - startTime;

          await this.prisma.auditLog.create({
            data: {
              userId: user?.sub || null,
              action: this.standardizeAction(controllerName, handlerName, method),
              entityType: controllerName.replace('Controller', ''),
              entityId,
              oldValues: oldValues || undefined,
              newValues: responseData ? JSON.parse(JSON.stringify(responseData)) : undefined,
              ipAddress: this.getClientIp(request),
              userAgent: request.headers['user-agent'] || null,
            },
          });
        } catch (error) {
          // Audit log failures must NEVER break the request
          // But they should be logged to a fallback (file/syslog)
          console.error('[AUDIT] Write failed:', error);
        }
      }),
      catchError(async (error) => {
        // Log failed operations too (attempted unauthorized access, validation failures)
        try {
          await this.prisma.auditLog.create({
            data: {
              userId: user?.sub || null,
              action: `FAILED:${this.standardizeAction(controllerName, handlerName, method)}`,
              entityType: controllerName.replace('Controller', ''),
              entityId,
              newValues: {
                error: error.message,
                statusCode: error.status || 500,
              },
              ipAddress: this.getClientIp(request),
              userAgent: request.headers['user-agent'] || null,
            },
          });
        } catch {
          console.error('[AUDIT] Failed operation log write failed');
        }
        throw error;
      }),
    );
  }

  /**
   * Capture entity state BEFORE mutation for change tracking.
   * This is critical for CAG audit compliance.
   */
  private async captureBeforeState(
    controllerName: string,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    if (entityId === 'N/A') return null;

    try {
      const entityType = controllerName.replace('Controller', '').toLowerCase();

      switch (entityType) {
        case 'applications':
          return (await this.prisma.application.findUnique({
            where: { id: entityId },
            select: { status: true, currentStep: true, assignedOfficerId: true },
          })) as Record<string, unknown> | null;

        case 'verification':
          return (await this.prisma.application.findUnique({
            where: { id: entityId },
            select: { status: true },
          })) as Record<string, unknown> | null;

        case 'payments':
          return (await this.prisma.payment.findUnique({
            where: { id: entityId },
            select: { status: true, verifiedById: true },
          })) as Record<string, unknown> | null;

        case 'certificates':
          return (await this.prisma.certificate.findUnique({
            where: { id: entityId },
            select: { status: true },
          })) as Record<string, unknown> | null;

        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Standardize action names for consistent querying.
   */
  private standardizeAction(controller: string, handler: string, method: string): string {
    const actionMap: Record<string, string> = {
      'ApplicationsController.create': 'APPLICATION_CREATED',
      'ApplicationsController.update': 'APPLICATION_UPDATED',
      'ApplicationsController.submit': 'APPLICATION_SUBMITTED',
      'ApplicationsController.withdraw': 'APPLICATION_WITHDRAWN',
      'VerificationController.raiseQuery': 'QUERY_RAISED',
      'VerificationController.forwardToCommittee': 'FORWARDED_TO_COMMITTEE',
      'CommitteeController.evaluate': 'EVALUATION_SUBMITTED',
      'PaymentsController.verifyPayment': 'PAYMENT_VERIFIED',
      'CertificatesController.issueCertificate': 'CERTIFICATE_ISSUED',
      'CertificatesController.revoke': 'CERTIFICATE_REVOKED',
      'AdminController.toggleUserStatus': 'USER_STATUS_CHANGED',
      'AuthController.login': 'USER_LOGIN',
      'AuthController.logout': 'USER_LOGOUT',
    };

    const key = `${controller}.${handler}`;
    return actionMap[key] || `${method}:${controller}.${handler}`;
  }

  /**
   * Extract real client IP accounting for proxy headers.
   */
  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.ip ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Identify GET requests that access sensitive data (PII, financial).
   * These must be logged per IT Act 43A.
   */
  private isSensitiveDataAccess(request: Request): boolean {
    const sensitivePatterns = [
      /\/api\/admin\/users/, // User PII
      /\/api\/payments/, // Financial data
      /\/api\/certificates/, // Legal documents
      /\/api\/audit-logs/, // Audit logs themselves
      /\/api\/attachments\/.*\/download/, // Document downloads
    ];
    return sensitivePatterns.some((p) => p.test(request.path));
  }
}
```

### 11.5 Audit Log Retention and Archival

```typescript
// apps/api/src/modules/audit-log/audit-retention.service.ts

/**
 * CERT-In mandates 180-day minimum log retention.
 * Government best practice: 7 years for financial/legal records (per Limitation Act).
 */
export const AUDIT_RETENTION_POLICY = {
  // Hot storage (PostgreSQL) -- fast queries
  hotRetentionDays: 180, // CERT-In minimum

  // Warm storage (compressed archive) -- queryable with delay
  warmRetentionDays: 365 * 3, // 3 years

  // Cold storage (object storage / tape) -- for compliance
  coldRetentionDays: 365 * 7, // 7 years (CAG audit cycles)

  // Categories with mandatory extended retention
  extendedRetention: [
    'CERTIFICATE_ISSUED',
    'CERTIFICATE_REVOKED',
    'APPLICATION_APPROVED',
    'APPLICATION_REJECTED',
    'PAYMENT_VERIFIED',
    'USER_STATUS_CHANGED',
    'DELEGATION',
  ],
};
```

### 11.6 Audit Query API (for CAG / Internal Auditors)

```typescript
// apps/api/src/modules/audit-log/audit-log.controller.ts

@Controller('api/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  /**
   * Query audit logs -- restricted to SUPER_ADMIN (IT) and designated AUDITOR role.
   * Supports filtering by: user, action, entity, date range, IP address.
   */
  @Get()
  @Roles(Role.SUPER_ADMIN) // Or future AUDITOR role
  async queryLogs(@Query() filter: AuditLogFilterDto) {
    return this.auditLogService.queryLogs(filter);
  }

  /**
   * Export audit logs as CSV/PDF for CAG submission.
   * Must include digital signature of the export itself.
   */
  @Get('export')
  @Roles(Role.SUPER_ADMIN)
  async exportLogs(
    @Query() filter: AuditLogFilterDto,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
  ) {
    return this.auditLogService.exportLogs(filter, format);
  }

  /**
   * Get audit trail for a specific entity (e.g., all actions on Application X).
   * Head (ADMIN) can also view this for workflow oversight.
   */
  @Get('entity/:entityType/:entityId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async getEntityTrail(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogService.getEntityTrail(entityType, entityId);
  }
}
```

---

## Appendix A: Guard Registration (app.module.ts)

```typescript
// apps/api/src/app.module.ts -- Guard registration order

@Module({
  providers: [
    // Global guards applied in this order
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Optional: enable when delegation feature is built
    // { provide: APP_GUARD, useClass: DelegationGuard },
  ],
})
export class AppModule {}

// WorkflowAccessGuard and SignatureRequiredGuard are applied
// per-route via @UseGuards() since they need route-specific metadata.
```

## Appendix B: Migration Path from Current to Extended RBAC

The current system uses a flat `role` enum column. To migrate to the extended schema:

| Phase                 | Change                                                                    | Risk                                         | Effort  |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| **Phase 1** (Current) | Flat `Role` enum on User                                                  | Working, adequate for single-org             | Done    |
| **Phase 2**           | Add `Organization` model, `organizationId` to User                        | Low -- additive, nullable FK                 | 1 week  |
| **Phase 3**           | Add `Delegation` and `DigitalSignature` models                            | Low -- new tables, no FK changes to existing | 2 weeks |
| **Phase 4**           | Add `ActiveSession` for concurrent session limits                         | Low -- new table, enhance auth service       | 1 week  |
| **Phase 5**           | Migrate from enum Role to `roles`/`permissions`/`role_permissions` tables | HIGH -- requires all guard/decorator changes | 4 weeks |
| **Phase 6**           | Multi-tenant RLS (CPCB/SPCB expansion)                                    | HIGH -- fundamental data access change       | 6 weeks |

**Recommendation**: Implement Phases 2-4 immediately (low risk, high compliance value). Defer Phase 5-6 until multi-body deployment is required.

## Appendix C: References

- **GIGW 3.0**: Guidelines for Indian Government Websites, NIC/MeitY
- **CERT-In Directions (28 April 2022)**: Mandatory incident reporting and log retention
- **IT Act 2000, Section 43A**: Compensation for failure to protect data
- **CCA eSign API v2.1**: Controller of Certifying Authorities, MeitY
- **NIC Secure Architecture Guidelines**: Network for Indian Government applications
- **APCD SOP Document**: Standard Operating Procedure for APCD Empanelment (NPC)
- **Role Mapping Matrix**: APCD Portal Role-Permission Matrix (project document)
