# APCD OEM Empanelment Portal -- Comprehensive Technical Specification

**Version**: 2.0
**Date**: 2026-02-03
**Organization**: National Productivity Council (NPC) / Central Pollution Control Board (CPCB)
**Classification**: Internal Technical Document
**Reference Portals**: PMAY (Pradhan Mantri Awas Yojana), NPC Sites, CPCB/SPCB Online Systems, PARIVESH

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Part I -- Current System Analysis](#part-i--current-system-analysis)
- [Part II -- EXIF & Geo-Tag Validation](#part-ii--exif--geo-tag-validation)
- [Part III -- Role-Based Access Control (RBAC)](#part-iii--role-based-access-control-rbac)
- [Part IV -- Payment Workflows](#part-iv--payment-workflows)
- [Part V -- PWA & Offline Capabilities](#part-v--pwa--offline-capabilities)
- [Part VI -- Audit Trails & Compliance](#part-vi--audit-trails--compliance)
- [Part VII -- Implementation Roadmap](#part-vii--implementation-roadmap)

---

## Executive Summary

The APCD OEM Empanelment Portal is a full-stack application managing the regulatory process of empaneling Air Pollution Control Device manufacturers in India. Built as a **Turborepo monorepo** with a **Next.js 14** frontend, **NestJS 10** backend, **PostgreSQL 15** database (via **Prisma 6** ORM), and **MinIO** object storage, the system already handles the complete empanelment lifecycle across 18 application statuses, 7 user roles, 26 document types, 8 evaluation criteria, and integrated Razorpay payments.

This specification defines enhancements across five critical domains, informed by patterns from Indian government portals (PMAY geo-tagging, NPC digital workflows, CPCB/SPCB compliance systems, PARIVESH environmental clearance):

| Domain              | Current State                             | Target State                                                                   |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| **EXIF Validation** | Basic GPS extraction + India bounds check | Full pipeline: proximity, freshness, anti-spoofing, trust scoring              |
| **RBAC**            | 7-role flat model with decorator guards   | Workflow-based access, delegation, digital signatures, GIGW compliance         |
| **Payments**        | Razorpay + manual NEFT                    | Multi-gateway, reconciliation, refunds, split payments, GST, challans          |
| **PWA Offline**     | Partial (auto-save to localStorage)       | Full service worker, IndexedDB queues, offline photo capture, background sync  |
| **Audit Trails**    | Basic action logging via interceptor      | Immutable hash-chained logs, event sourcing, RTI/CAG reports, SIEM integration |

---

## Part I -- Current System Analysis

### 1.1 Architecture Overview

```
Turborepo Monorepo
  apps/
    web/        Next.js 14 (App Router) -- Tailwind + shadcn/ui + Zustand
    api/        NestJS 10 -- Prisma + Passport JWT + Swagger
  packages/
    database/   Prisma schema (32 models) + migrations + seed
    shared/     Zod validators, TypeScript types, constants
    ui/         Shared UI components
    config/     ESLint/TS configs
  e2e/          Playwright (11 test files)
  docker/       Dockerfiles for API + Web
```

### 1.2 Technology Stack

| Layer            | Technology                             | Version                 |
| ---------------- | -------------------------------------- | ----------------------- |
| Frontend         | Next.js (App Router)                   | 14.1.3                  |
| UI Components    | Radix UI + shadcn/ui + Tailwind CSS    | 3.4.1                   |
| State Management | Zustand + React Query                  | 4.5.2 / 5.28.0          |
| Forms            | React Hook Form + Zod                  | 7.51.0 / 3.22.4         |
| Backend          | NestJS                                 | 10.4.0                  |
| ORM              | Prisma                                 | 6.1.0                   |
| Database         | PostgreSQL                             | 15                      |
| Object Storage   | MinIO (S3-compatible)                  | 8.0.2                   |
| Cache/Rate Limit | Redis (via Throttler)                  | --                      |
| Auth             | Passport JWT (15m access / 7d refresh) | 10.0.3                  |
| Payments         | Razorpay                               | 2.9.4                   |
| Image Processing | sharp + exifr                          | 0.33.0 / 7.1.3          |
| PDF Generation   | PDFKit + QRCode                        | 0.17.2 / 1.5.4          |
| Email            | Nodemailer                             | 7.0.13                  |
| Testing          | Jest + Vitest + Playwright             | 29.7.0 / 1.6.0 / 1.58.0 |

### 1.3 Existing Feature Matrix

| Feature                              | Status   | Key Files                                      |
| ------------------------------------ | -------- | ---------------------------------------------- |
| 9-step application form              | Complete | `apps/api/src/modules/applications/`           |
| 26 document types with upload        | Complete | `apps/api/src/modules/attachments/`            |
| Geo-tagged photo validation          | Basic    | `attachments/geo-tag-validator.service.ts`     |
| 7-role RBAC with guards              | Complete | `apps/api/src/common/guards/`                  |
| Razorpay + NEFT payments             | Complete | `apps/api/src/modules/payments/`               |
| Fee calculation (MSE discount + GST) | Complete | `payments/fee-calculator.service.ts`           |
| 8-criterion committee evaluation     | Complete | `apps/api/src/modules/committee/`              |
| Field verification (3 sites)         | Complete | `apps/api/src/modules/field-verification/`     |
| QR-coded certificate generation      | Complete | `apps/api/src/modules/certificates/`           |
| Audit logging via interceptor        | Basic    | `common/interceptors/audit-log.interceptor.ts` |
| Email + in-app notifications         | Complete | `apps/api/src/modules/notifications/`          |
| Role-specific dashboards (6 types)   | Complete | `apps/api/src/modules/dashboard/`              |

### 1.4 Database Scale

- **32 Prisma models**, 18 application statuses, 100+ database indexes
- **7 user roles**: OEM, OFFICER, COMMITTEE, FIELD_VERIFIER, DEALING_HAND, ADMIN, SUPER_ADMIN
- **7 APCD categories**: ESP, Bag Filter, Cyclone Separator, Scrubber, Condenser, Mist Eliminator, Other

---

## Part II -- EXIF & Geo-Tag Validation

_Reference portals: PMAY AwaasApp geo-tagging, CPCB OCEMS photo compliance, MNREGA worksite attendance_

### 2.1 Current Implementation

The portal currently uses `exifr` to extract GPS coordinates and `DateTimeOriginal` from uploaded photos in `geo-tag-validator.service.ts`. Validation is limited to:

- GPS presence check
- India bounding box (Lat 6.5-35.5, Lng 68.0-97.5)
- Timestamp presence

### 2.2 Enhanced EXIF Extraction

Extract the full metadata set for forensic validation:

| Category       | Tags                                                                                                                   | Purpose                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **GPS**        | `GPSLatitude/Ref`, `GPSLongitude/Ref`, `GPSAltitude`, `GPSHPositioningError`, `GPSDOP`, `GPSDateStamp`, `GPSTimeStamp` | Location verification   |
| **Timestamps** | `DateTimeOriginal`, `DateTimeDigitized`, `DateTime`, `OffsetTimeOriginal`                                              | Freshness + consistency |
| **Device**     | `Make`, `Model`, `Software`, `LensMake`, `LensModel`                                                                   | Anti-spoofing           |
| **Image**      | `ImageWidth`, `ImageLength`, `Orientation`, `ColorSpace`                                                               | Integrity checks        |

### 2.3 Multi-Level Geo-Validation

| Level  | Check                           | Threshold                                    | Implementation                                                           |
| ------ | ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| **L1** | India bounding box              | Lat 6.5-35.5, Lng 68.0-97.5                  | Existing -- rectangle check                                              |
| **L2** | Proximity to registered factory | 500m (OEM upload), 200m (field verification) | **New** -- Haversine distance against `OemProfile.gpsLatitude/Longitude` |
| **L3** | State/district polygon          | Point-in-polygon with GeoJSON boundaries     | **New** -- for SPCB-specific deployments                                 |
| **L4** | Multi-photo cluster consistency | 1000m max spread across 6 factory photos     | **New** -- centroid + outlier detection                                  |

**Proximity thresholds across Indian govt portals (reference):**

| Portal                    | Threshold | Rationale                           |
| ------------------------- | --------- | ----------------------------------- |
| APCD factory photos (OEM) | 500m      | Large industrial campuses           |
| APCD field verification   | 200m      | Verifier must be physically on-site |
| PMAY urban housing        | 100m      | Residential plot is small           |
| PMAY rural housing        | 200m      | Less precise addressing             |
| MNREGA worksite           | 50m       | Precise geofence                    |
| CPCB stack monitoring     | 50m       | Equipment at registered stack       |

### 2.4 Timestamp Validation

| Rule                     | Threshold                                                           | Action                                       |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------------- |
| Future timestamp         | > 5 min ahead of server                                             | **Reject** -- possible clock manipulation    |
| Stale photo              | > 30 days (APCD), > 48h (field verification)                        | **Warn** -- require re-capture               |
| Internal inconsistency   | `DateTime` differs from `DateTimeOriginal` by > 1 min               | **Flag** -- possible editing                 |
| GPS/camera time mismatch | GPS UTC vs camera IST differ by > 5 min (after timezone adjustment) | **Flag** -- possible GPS spoofing            |
| Temporal cluster         | 6 factory photos span > 48 hours                                    | **Warn** -- photos should be from same visit |

### 2.5 Anti-Spoofing Pipeline

| Threat                    | Detection Method                                                              | Trust Score Impact |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| No EXIF data at all       | Reject outright                                                               | Score = 0          |
| GPS spoofing app          | Check `Software` tag against pattern list (exiftool, fake GPS, mock location) | -20                |
| EXIF injection            | No `Make`/`Model`, non-standard aspect ratio, suspiciously high compression   | -10 to -20         |
| Metadata stripping        | Missing GPS + timestamp                                                       | -40                |
| Photo editing             | `DateTime` vs `DateTimeOriginal` discrepancy                                  | -10                |
| Stock photo reuse         | Web-standard dimensions, no camera metadata                                   | -10                |
| GPS spoofing (dual check) | Browser Geolocation API coords vs EXIF GPS differ by > 2km                    | -15                |

### 2.6 Trust Score System

**Scoring**: Start at 100, deduct per validation failure. Officers see a badge:

| Score  | Badge          | Officer Action                                |
| ------ | -------------- | --------------------------------------------- |
| 80-100 | **Trusted**    | Auto-accept; batch verify                     |
| 60-79  | **Acceptable** | Review warnings before accepting              |
| 40-59  | **Suspicious** | Detailed manual review; may request re-upload |
| 0-39   | **Rejected**   | OEM must re-capture with guidance             |

### 2.7 Enhanced Database Schema

New `ExifMetadata` model (separate from `Attachment` to avoid query bloat):

```prisma
model ExifMetadata {
  id                    String    @id @default(uuid())
  attachmentId          String    @unique @map("attachment_id")

  // GPS
  gpsLatitude           Decimal?  @db.Decimal(10, 7)
  gpsLongitude          Decimal?  @db.Decimal(10, 7)
  gpsAltitude           Decimal?  @db.Decimal(8, 2)
  gpsAccuracyM          Decimal?  @db.Decimal(8, 2)

  // Timestamps
  dateTimeOriginal      DateTime?
  dateTimeDigitized     DateTime?
  dateTimeModified      DateTime?

  // Device
  cameraMake            String?
  cameraModel           String?
  software              String?

  // Validation Results
  distanceFromFactoryM  Int?
  isWithinProximity     Boolean?
  gpsAccuracyGrade      String?   // HIGH | MEDIUM | LOW | UNKNOWN
  timestampAgeHours     Decimal?  @db.Decimal(10, 2)
  softwareRiskLevel     String?   // NONE | LOW | MEDIUM | HIGH
  overallTrustScore     Int?      // 0-100
  spoofingFlags         Json?     // String array of detected issues

  // Client-side GPS (dual verification)
  clientLatitude        Decimal?  @db.Decimal(10, 7)
  clientLongitude       Decimal?  @db.Decimal(10, 7)
  clientExifDistM       Int?

  createdAt             DateTime  @default(now())
  attachment            Attachment @relation(fields: [attachmentId], references: [id], onDelete: Cascade)

  @@index([overallTrustScore])
  @@map("exif_metadata")
}
```

### 2.8 Mobile Camera Integration

Frontend component flow: **GPS lock first, then camera open**.

```
User taps "Capture Photo"
  -> Geolocation API: enableHighAccuracy: true, timeout: 30s
  -> GPS acquired (shown to user)
  -> <input type="file" accept="image/jpeg" capture="environment"> triggers rear camera
  -> OS writes EXIF with GPS + timestamp into JPEG
  -> Upload with both EXIF GPS and client GPS for dual verification
```

Key: `capture="environment"` forces rear camera and prevents gallery selection, ensuring fresh photos with valid EXIF.

---

## Part III -- Role-Based Access Control (RBAC)

_Reference portals: CPCB Online System, PARIVESH, SPCB Consent Management, NPC e-Governance_

### 3.1 Current Role Hierarchy

```
SUPER_ADMIN (IT Administrator)
  |
  ADMIN (Head of Section / NPC Director)
    |
    +-- OFFICER (Reviewing Officer)
    +-- COMMITTEE (Expert Committee Member)
    +-- FIELD_VERIFIER (Field Verification Officer)
    +-- DEALING_HAND (Payment/Support Staff)
    |
    OEM (Applicant -- external)
```

### 3.2 Permission Matrix (Resource-Level)

| Resource           | OEM               | OFFICER                | COMMITTEE       | FIELD_VERIFIER      | DEALING_HAND | ADMIN             | SUPER_ADMIN |
| ------------------ | ----------------- | ---------------------- | --------------- | ------------------- | ------------ | ----------------- | ----------- |
| Applications       | CRUD (own)        | Read/Update (assigned) | Read (assigned) | Read (assigned)     | Read all     | CRUD all          | CRUD all    |
| Documents          | Upload/View (own) | View/Verify            | View            | View/Upload (field) | View         | View all          | View all    |
| Queries            | Respond (own)     | Raise/Resolve          | --              | --                  | --           | Raise/Resolve     | Full        |
| Evaluation         | --                | --                     | Score/Submit    | --                  | --           | View              | View        |
| Field Verification | --                | --                     | --              | Submit reports      | --           | View              | View        |
| Payments           | Pay (own)         | --                     | --              | --                  | Verify NEFT  | Configure fees    | Full        |
| Certificates       | View (own)        | Generate               | --              | --                  | --           | Suspend/Revoke    | Full        |
| Users              | View profile      | --                     | --              | --                  | --           | CRUD (below rank) | CRUD all    |
| Audit Logs         | --                | --                     | --              | --                  | --           | Read              | Full        |
| Dashboard          | OEM view          | Officer view           | Committee view  | Verifier view       | Dealing view | Admin view        | Admin view  |

### 3.3 Workflow-Based Access Control

Access permissions change with application status. Key rules:

| Status               | Who Can Act                | Allowed Actions                     |
| -------------------- | -------------------------- | ----------------------------------- |
| `DRAFT`              | OEM (owner)                | Edit form, upload docs, submit      |
| `SUBMITTED`          | ADMIN                      | Assign to officer                   |
| `UNDER_REVIEW`       | OFFICER (assigned)         | Verify docs, raise queries, forward |
| `QUERIED`            | OEM (owner)                | Respond to queries, re-upload docs  |
| `COMMITTEE_REVIEW`   | COMMITTEE (assigned)       | Score 8 criteria, submit evaluation |
| `FIELD_VERIFICATION` | FIELD_VERIFIER (assigned)  | Submit 3-site reports               |
| `PAYMENT_PENDING`    | OEM (owner) + DEALING_HAND | Pay / verify NEFT                   |
| `APPROVED`           | ADMIN                      | Generate certificate                |
| `REJECTED`           | --                         | Read-only for all                   |

Implementation: `WorkflowAccessGuard` checks `application.status` + `user.role` + ownership before allowing mutations.

### 3.4 Delegation Patterns

For government operations continuity (leave, transfer, acting-in-charge):

```prisma
model Delegation {
  id              String          @id @default(uuid())
  delegationType  DelegationType  // LEAVE | TRANSFER | ACTING_CHARGE | COMMITTEE_ROTATION
  fromUserId      String
  toUserId        String
  startDate       DateTime
  endDate         DateTime?
  scope           Json?           // { applicationIds: [...] } or { all: true }
  reason          String
  approvedBy      String
  isActive        Boolean         @default(true)
  createdAt       DateTime        @default(now())

  @@map("delegations")
}
```

A `DelegationGuard` enriches the request context with delegated authority, allowing the delegate to act on behalf of the original user within the defined scope and time period.

### 3.5 Digital Signature Integration

Per the IT Act 2000 (Section 3A), certain government actions require digital signatures:

| Action                             | Signature Type               | Required Role   |
| ---------------------------------- | ---------------------------- | --------------- |
| Certificate generation             | DSC Class 3 or Aadhaar eSign | ADMIN           |
| Application final approval         | Aadhaar eSign                | ADMIN           |
| Field verification report          | Aadhaar eSign                | FIELD_VERIFIER  |
| Payment receipt                    | DSC Class 3                  | DEALING_HAND    |
| Committee evaluation               | eSign                        | COMMITTEE       |
| Application rejection with reasons | eSign                        | OFFICER / ADMIN |

Integration point: CCA (Controller of Certifying Authorities) eSign API v2.1 via `ESignService`.

### 3.6 Session Management (GIGW 3.0 Compliance)

| Requirement         | Current          | Target                                          |
| ------------------- | ---------------- | ----------------------------------------------- |
| Session timeout     | 15m access token | Role-specific: OEM 30m, Officers 20m, Admin 15m |
| Concurrent sessions | Unlimited        | Max 2 per user (configurable per role)          |
| OTP on login        | Not implemented  | OTP via SMS/email for all govt officer roles    |
| Account lockout     | Not implemented  | Lock after 5 failed attempts for 30 minutes     |
| Password expiry     | Not implemented  | 90-day policy for officers, 180-day for OEM     |
| CAPTCHA             | Not implemented  | After 3 failed login attempts                   |

### 3.7 Field-Level Access Control

Role-based response filtering via `FieldFilterInterceptor`:

| Field                    | OEM                         | OFFICER                  | COMMITTEE       | ADMIN      |
| ------------------------ | --------------------------- | ------------------------ | --------------- | ---------- |
| Committee scores         | Hidden until final decision | Visible after evaluation | Own scores only | All scores |
| Other OEM applications   | Hidden                      | Visible (assigned)       | Hidden          | All        |
| Internal remarks         | Hidden                      | Visible                  | Hidden          | Visible    |
| Payment UTR/bank details | Own only                    | Hidden                   | Hidden          | All        |
| Audit trail              | Hidden                      | Own actions              | Own actions     | Full       |

### 3.8 Extended RBAC Schema (for CPCB/SPCB Multi-Tenancy)

For future expansion where multiple state bodies use the same platform:

```prisma
model Organization {
  id          String  @id @default(uuid())
  name        String  // "CPCB", "MPPCB", "GPCB", etc.
  type        String  // CENTRAL | STATE | DISTRICT
  stateCode   String? // "MP", "GJ", "RJ"
  parentId    String? // MPPCB.parentId = CPCB.id

  parent      Organization?  @relation("OrgHierarchy", fields: [parentId], references: [id])
  children    Organization[] @relation("OrgHierarchy")
  users       User[]

  @@map("organizations")
}
```

Row-Level Security (RLS) ensures state-level data isolation: MPPCB users see only Maharashtra data; CPCB sees everything.

---

## Part IV -- Payment Workflows

_Reference portals: PARIVESH fee system, NPC payment gateway, SBI ePay, NTRP_

### 4.1 Current Payment Implementation

| Feature           | Status   | Implementation                                                                      |
| ----------------- | -------- | ----------------------------------------------------------------------------------- |
| Fee calculation   | Complete | `fee-calculator.service.ts` -- dynamic with MSE/Startup/Local Supplier 15% discount |
| Razorpay online   | Complete | Order creation, client checkout, HMAC-SHA256 verification                           |
| Manual NEFT/RTGS  | Complete | UTR submission + officer verification                                               |
| Fee configuration | Complete | Admin-managed `FeeConfiguration` model                                              |
| GST (18%)         | Complete | Applied to all fees                                                                 |

**Current fee schedule:**

| Fee Type                        | Base Amount (INR) |
| ------------------------------- | ----------------- |
| Application Fee                 | 25,000            |
| Empanelment Fee (per APCD type) | 65,000            |
| Field Verification Fee          | 57,000            |
| Renewal Fee                     | 35,000            |

**Discount**: 15% for MSE / Startup / Local Supplier (mutually exclusive, cannot stack).

### 4.2 Enhanced Payment Gateway Support

| Gateway                 | Use Case                                        | Integration Pattern             |
| ----------------------- | ----------------------------------------------- | ------------------------------- |
| **Razorpay** (existing) | Primary online payment                          | Checkout.js + webhook           |
| **BillDesk**            | Government-preferred, treasury integration      | Pipe-delimited HMAC redirect    |
| **SBI ePay**            | PSU bank, high trust factor                     | AES-128-CBC encrypted form POST |
| **NTRP**                | National Treasury Receipt Portal (central govt) | Challan-based, callback         |
| **UPI**                 | Mobile-first, low-value payments                | Razorpay UPI intent / collect   |
| **Bharat BillPay**      | Recurring/renewal payments                      | BBPS biller registration        |

Multi-gateway strategy: Implement a `PaymentGatewayAdapter` interface with gateway-specific implementations. Admin configures the active gateway per fee type.

### 4.3 Enhanced Payment Flow

```
Fee Calculation
  -> Order Creation (idempotent, prevents duplicates)
  -> Gateway Selection (online / NEFT / DD)
  -> [Online] Gateway Redirect -> Payment -> Callback -> HMAC Verification
  -> [NEFT] UTR Submission -> Officer Verification (within 3 business days)
  -> [DD] DD Details + Scan Upload -> Officer Verification
  -> Receipt Generation (sequential numbering, QR code, optional DSC)
  -> Audit Log Entry
  -> Application Status Transition
```

### 4.4 Challan & Receipt Generation

Indian government TR-6 challan format with:

- Financial-year-aware sequential receipt numbers: `NPC/2025-26/PAY/000042`
- PostgreSQL sequence for gap-free numbering
- QR code containing verification URL
- Optional digital signature (DSC/eSign)
- Bilingual template (Hindi + English)

### 4.5 Reconciliation

Three-way matching: **Portal records** vs **Gateway settlement** vs **Bank statement**

```prisma
model PaymentReconciliation {
  id                  String   @id @default(uuid())
  reconciliationDate  DateTime
  gatewayName         String
  portalAmount        Decimal  @db.Decimal(12, 2)
  gatewayAmount       Decimal  @db.Decimal(12, 2)
  bankAmount          Decimal? @db.Decimal(12, 2)
  status              String   // MATCHED | PORTAL_EXCESS | GATEWAY_EXCESS | BANK_MISMATCH
  discrepancyAmount   Decimal? @db.Decimal(12, 2)
  resolvedBy          String?
  resolvedAt          DateTime?

  @@map("payment_reconciliations")
}
```

Automated daily cron compares settlement data from gateway APIs against portal records. Mismatches generate alerts for DEALING_HAND role.

### 4.6 Refund Handling

| Scenario                   | Trigger                         | Approval                  |
| -------------------------- | ------------------------------- | ------------------------- |
| Application rejected       | Status -> REJECTED              | Auto-approved (< INR 50K) |
| Duplicate payment          | Double order detection          | Auto-approved             |
| Overpayment                | Manual identification           | Admin approval            |
| MSE discount post-approval | Final certificate issued to MSE | Admin approval            |
| Technical failure          | Gateway error + no settlement   | Auto-approved             |

Refund via Razorpay Refund API (for online payments) or manual NEFT (for offline payments).

### 4.7 Split Payments (CPCB/SPCB Distribution)

For multi-body deployments, fees split between central and state bodies:

| Fee Component      | Central (CPCB) | State (SPCB) |
| ------------------ | -------------- | ------------ |
| Application fee    | 40%            | 60%          |
| Empanelment fee    | 30%            | 70%          |
| Field verification | 20%            | 80%          |

Implementation: Razorpay Route (linked accounts) for automatic gateway-level splitting, or batch NEFT settlement for gateways without native split support.

### 4.8 GST Integration

- **CGST + SGST** (intra-state) vs **IGST** (inter-state) determination
- SAC Code: 998599 (Other professional, technical, and business services)
- GST invoice with all mandatory fields per CGST Act Section 31
- GSTR-1 monthly export service for NPC's GST filing

### 4.9 Enhanced Payment Schema

```prisma
model PaymentReceipt {
  id              String   @id @default(uuid())
  paymentId       String   @unique
  receiptNumber   String   @unique  // NPC/2025-26/PAY/000042
  financialYear   String             // 2025-26
  sequenceNumber  Int
  receiptDate     DateTime @default(now())
  qrCodeData      String?
  digitalSignature String?
  signedBy        String?
  pdfPath         String?

  payment         Payment  @relation(fields: [paymentId], references: [id])
  @@map("payment_receipts")
}

model PaymentRefund {
  id              String   @id @default(uuid())
  paymentId       String
  reason          String
  refundAmount    Decimal  @db.Decimal(12, 2)
  status          String   // REQUESTED | APPROVED | PROCESSING | COMPLETED | FAILED
  gatewayRefundId String?
  approvedBy      String?
  processedAt     DateTime?

  payment         Payment  @relation(fields: [paymentId], references: [id])
  @@map("payment_refunds")
}
```

### 4.10 Security

- **PCI-DSS SAQ-A** compliance: Card data never touches portal servers (handled entirely by gateway)
- **AES-256-GCM** encryption for sensitive payment data at rest
- **Double-payment prevention**: 3-layer check (application status, gateway deduplication key, DB partial unique index)
- **Razorpay webhook signature verification** with HMAC-SHA256
- **Audit logging** on all payment mutations

---

## Part V -- PWA & Offline Capabilities

_Reference portals: PMAY AwaasApp (offline geo-tagging), MNREGA attendance app, field inspection apps_

### 5.1 Service Worker Strategy

| Resource Type                       | Strategy                       | Cache Name          | TTL                   |
| ----------------------------------- | ------------------------------ | ------------------- | --------------------- |
| Static assets (JS, CSS, images)     | **Cache-first**                | `apcd-static-v1`    | Until SW update       |
| API responses                       | **Network-first** (5s timeout) | `apcd-api-v1`       | Fallback to cache     |
| Reference data (states, APCD types) | **Stale-while-revalidate**     | `apcd-reference-v1` | Background refresh    |
| HTML pages                          | **Network-first**              | `apcd-pages-v1`     | Offline fallback page |

The 5-second network timeout is calibrated for Indian 2G/3G connectivity in rural industrial areas. If the network responds within 5s, use the fresh response; otherwise, serve from cache.

### 5.2 Offline Form Submission

```
User fills form
  -> Try POST to server
  -> If offline (or timeout):
       -> Serialize form data + files into IndexedDB sync_queue
       -> Show "Saved offline - will sync when connected" toast
       -> Add pending sync badge (count)
  -> When online:
       -> Background Sync API triggers replay
       -> FIFO ordering, 5 retries with exponential backoff
       -> Remove from queue on success
       -> Notify user of sync completion
```

### 5.3 IndexedDB Storage Schema

Five object stores for the APCD domain:

| Store                | Key                     | Purpose                                      |
| -------------------- | ----------------------- | -------------------------------------------- |
| `sync_queue`         | `id` (UUID)             | Queued API calls (forms, status updates)     |
| `offline_photos`     | `id` (UUID)             | Captured photos with GPS metadata            |
| `draft_applications` | `id` (application UUID) | Multi-step form progress                     |
| `cached_inspections` | `id` (inspection UUID)  | Pre-fetched field verification checklists    |
| `reference_data`     | `key` (string)          | States, districts, APCD types, fee schedules |

### 5.4 Offline Photo Capture

Critical for field verifiers in remote industrial areas:

1. **EXIF extraction** via `exifr` (already a dependency) -- extract GPS from JPEG if present
2. **Geolocation API fallback** -- if EXIF GPS is missing, use browser GPS with `enableHighAccuracy: true`
3. **India bounds validation** -- same rules as server-side (Lat 6.5-35.5, Lng 68.0-97.5)
4. **Canvas-based JPEG compression** -- reduce to max 2048px dimension, quality 80%, before storing in IndexedDB
5. **Thumbnail generation** -- 200px thumbnail for offline preview
6. **Deferred upload** -- sync when connectivity restored, preserving original EXIF

### 5.5 Conflict Resolution

| Data Type                      | Strategy                                                | Rationale                             |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------- |
| Draft applications             | **Last-write-wins** (client timestamp)                  | Only one user edits their own draft   |
| Field verification reports     | **Optimistic locking** (version field, 409 on conflict) | Multiple officers may be assigned     |
| Query responses                | **Optimistic locking**                                  | OEM may respond from multiple devices |
| Application status transitions | **Server-authoritative**                                | Must respect `STATUS_TRANSITIONS` map |
| Photos                         | **Append-only**                                         | Never overwrite; add new, delete old  |

### 5.6 Network Detection

Multi-signal approach for reliable detection in Indian conditions:

1. `navigator.onLine` -- coarse boolean (unreliable on mobile)
2. **Network Information API** (`navigator.connection.effectiveType`) -- `2g`, `3g`, `4g`
3. **Active health-check ping** -- `GET /api/health` with 5s timeout, measure RTT
4. **Captive portal detection** -- check if health response was redirected to an HTML login page

Connection quality classification:

| Quality | RTT         | `effectiveType` | Behavior                                         |
| ------- | ----------- | --------------- | ------------------------------------------------ |
| Good    | < 500ms     | `4g`            | Full functionality                               |
| Fair    | 500-1500ms  | `3g`            | Reduce image quality, defer non-critical fetches |
| Poor    | 1500-3000ms | `2g`            | Offline-first mode, queue all writes             |
| Offline | Timeout     | --              | Full offline mode, sync queue only               |

### 5.7 PWA Install & Manifest

```json
{
  "name": "APCD OEM Empanelment Portal",
  "short_name": "APCD Portal",
  "description": "NPC - Air Pollution Control Device Empanelment",
  "start_url": "/dashboard",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#1e40af",
  "background_color": "#ffffff",
  "lang": "en-IN",
  "categories": ["government", "business", "utilities"],
  "icons": [
    /* 72px to 512px, including maskable */
  ]
}
```

Install prompt deferred until 2 minutes of active engagement (avoids dismissal fatigue).

### 5.8 Push Notifications

Web Push via VAPID (Voluntary Application Server Identification):

- **Status updates**: Application moved to next stage
- **Query notifications**: Officer raised a query; response deadline
- **Payment confirmations**: Payment verified, receipt available
- **Deadline reminders**: Certificate expiring in 30/15/7 days
- **Inspection schedules**: Field visit date confirmed

24-hour TTL on push messages to accommodate offline Indian users.

### 5.9 Storage Management

- Request **persistent storage** (`navigator.storage.persist()`) to prevent browser eviction
- Automatic purge: uploaded photos after 14 days, synced queue items after 7 days
- Emergency purge when quota exceeds 90%: clear oldest cached API responses first
- Storage indicator in PWA settings page

### 5.10 Security in Offline Mode

| Concern           | Solution                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| Token storage     | AES-256-GCM encryption via Web Crypto API in IndexedDB                  |
| Token refresh     | Refresh on reconnection; redirect to login if refresh token expired     |
| Tamper prevention | HMAC-SHA256 integrity signature on each sync queue item                 |
| CSP headers       | Strict Content-Security-Policy in Next.js config                        |
| Data at rest      | Encrypted storage for sensitive fields (payment details, personal data) |

### 5.11 Browser Compatibility

| Feature              | Chrome Android | Safari iOS | Firefox Android | Samsung Internet |
| -------------------- | -------------- | ---------- | --------------- | ---------------- |
| Service Worker       | 40+            | 11.3+      | 44+             | 4+               |
| Background Sync      | 49+            | N/A        | N/A             | 5+               |
| IndexedDB            | 24+            | 10+        | 16+             | 4+               |
| Push Notifications   | 50+            | 16.4+      | 44+             | 5+               |
| Web Crypto (AES-GCM) | 37+            | 11+        | 34+             | 4+               |

For Safari/Firefox (no Background Sync), `NetworkMonitor` detects reconnection and manually replays the sync queue.

---

## Part VI -- Audit Trails & Compliance

_Reference: IT Act 2000, RTI Act 2005, CVC Guidelines, CAG Audit Standards, CERT-In Directions, DPDPA 2023_

### 6.1 Current Audit Implementation

The existing `AuditLogInterceptor` (in `common/interceptors/`) logs actions via RxJS `tap()` after the response is sent. Current schema captures: `userId`, `action`, `entityType`, `entityId`, `createdAt`.

**Key gaps**: No before-state (old values), no hash chain, no IP/user-agent, no severity classification, no tamper detection.

### 6.2 Enhanced Audit Log Schema

```prisma
model AuditLog {
  id              String    @id @default(uuid())
  sequenceNumber  BigInt    @default(autoincrement()) @unique

  // Actor
  userId          String?
  userRole        String?
  sessionId       String?
  ipAddress       String?   @db.Inet
  userAgent       String?

  // Action
  action          String    // APPLICATION_SUBMITTED, PAYMENT_COMPLETED, etc.
  category        String    @default("GENERAL") // APPLICATION | DOCUMENT | PAYMENT | USER | SYSTEM
  severity        String    @default("INFO")     // INFO | WARNING | CRITICAL

  // Entity
  entityType      String
  entityId        String

  // Change Data
  oldValues       Json?     // State before mutation
  newValues       Json?     // State after mutation

  // Tamper Detection
  recordHash      String?   // SHA-256 of this record
  previousHash    String?   // Hash of the previous record (chain)

  createdAt       DateTime  @default(now())

  user            User?     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([entityType, entityId])
  @@index([action])
  @@index([category])
  @@index([severity])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 6.3 What to Log

**76 auditable events** across 10 categories:

| Category               | Events                                                                | Severity         |
| ---------------------- | --------------------------------------------------------------------- | ---------------- |
| **Authentication**     | Login, logout, failed login, password change, OTP request             | INFO/WARNING     |
| **Application**        | Create, save draft, submit, status change, assign, reassign, withdraw | INFO/CRITICAL    |
| **Document**           | Upload, download, verify, reject, delete                              | INFO/CRITICAL    |
| **Query**              | Raise, respond, resolve, escalate                                     | INFO             |
| **Evaluation**         | Start, score set, score modified, submit, override                    | WARNING/CRITICAL |
| **Field Verification** | Schedule, submit report, approve, reject                              | CRITICAL         |
| **Payment**            | Order create, complete, NEFT verify, refund, reconciliation           | CRITICAL         |
| **Certificate**        | Generate, download, suspend, revoke, renew                            | CRITICAL         |
| **User Management**    | Create, update, deactivate, role change, delegation                   | CRITICAL         |
| **System**             | Config change, data export, integrity check, archival                 | CRITICAL         |

### 6.4 Immutable Hash Chain

Each audit record contains a SHA-256 hash of its contents plus a reference to the previous record's hash, forming a tamper-evident chain:

```
Record N:
  recordHash = SHA-256(action + entityId + entityType + userId + oldValues + newValues + previousHash + timestamp)
  previousHash = Record[N-1].recordHash

Record N+1:
  previousHash = Record[N].recordHash
  ...
```

**Immutability enforcement**: PostgreSQL trigger blocks all `UPDATE` and `DELETE` operations on `audit_logs`. The table is append-only.

```sql
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. Operation % is forbidden.', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

### 6.5 Partitioning

Monthly range partitioning on `created_at` for performance:

```sql
CREATE TABLE audit_logs (
  -- columns as above
) PARTITION BY RANGE (created_at);

-- Auto-create partitions via pg_partman or manual:
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### 6.6 Event Sourcing Pattern

For critical entities (Application, Certificate), maintain a separate `DomainEvent` table enabling complete state reconstruction:

```prisma
model DomainEvent {
  id              String   @id @default(uuid())
  aggregateType   String   // Application | Certificate | Payment
  aggregateId     String
  eventType       String   // ApplicationCreated, StatusChanged, ScoreSet, etc.
  eventVersion    Int      @default(1)
  payload         Json     // Full event data
  metadata        Json?    // { userId, ip, sessionId, correlationId }
  createdAt       DateTime @default(now())

  @@index([aggregateType, aggregateId, createdAt])
  @@map("domain_events")
}
```

**State reconstruction**: Replay all events for an aggregate to reconstruct its exact state at any point in time. Critical for RTI requests and CAG audits.

### 6.7 Regulatory Compliance Reports

**RTI Report Generator**: Produces human-readable timelines for Right to Information requests. Excludes internal security metadata (IP addresses, session IDs) per Section 8(1)(g) of the RTI Act.

**CAG Audit Report Generator**: Comprehensive financial-year reports with:

- Total event counts, severity distribution
- User activity summaries
- Payment audit trail
- Role change log
- Critical event log
- **Hash chain integrity verification status**

**Internal Compliance Review** (weekly/monthly automated):

- Anomaly detection: off-hours critical actions, multi-IP access, high-volume users, rapid approvals, brute force attempts
- SLA breach tracking (applications pending beyond 15 days)
- Audit system health (chain integrity, unaudited mutations)

### 6.8 Data Retention Policy

Per Indian regulatory requirements (IT Act 67C, CAG Standards, RTI Act, CVC Guidelines):

| Tier       | Period      | Storage                           | Access Time |
| ---------- | ----------- | --------------------------------- | ----------- |
| **Hot**    | 0-12 months | Primary PostgreSQL, fully indexed | Sub-second  |
| **Warm**   | 1-3 years   | PostgreSQL, reduced indexes       | Seconds     |
| **Cold**   | 3-10 years  | Compressed CSV in MinIO           | Minutes     |
| **Frozen** | 10+ years   | Encrypted offline backup          | 24-48 hours |

**Key rule**: Audit logs are never permanently destroyed. RTI Act has no provision for records destruction without National Archives authorization.

### 6.9 Tamper Detection

Four-level defense:

| Level | Mechanism                                                    | Frequency            |
| ----- | ------------------------------------------------------------ | -------------------- |
| L1    | PostgreSQL trigger blocks UPDATE/DELETE                      | Real-time            |
| L2    | Hash chain verification                                      | Daily automated cron |
| L3    | Sequence number continuity check (gap detection)             | Daily                |
| L4    | External hash anchoring (weekly digest published externally) | Weekly               |

Automated `AuditIntegrityService` runs daily at 2:00 AM IST, checks last 48 hours, alerts SUPER_ADMIN on any compromise.

### 6.10 Performance

| Strategy                                       | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| **Async queue (BullMQ)** for INFO events       | Guaranteed delivery without blocking main request        |
| **Synchronous write** for CRITICAL events      | Written within same DB transaction as business operation |
| **Read replica** for audit queries             | Heavy reports don't impact primary write throughput      |
| **Materialized views** for dashboards          | Daily/monthly summaries, refreshed nightly               |
| **Full-text search** via PostgreSQL `tsvector` | Fast query across action, entity, values                 |

Volume estimate: ~300-1,500 events/day, ~165 MB - 1.6 GB/year. Very manageable; optimizations are for operational hygiene.

### 6.11 SIEM Integration

| Target                        | Protocol                                       | Events Forwarded                                                                                    |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **ELK Stack** (Elasticsearch) | Bulk HTTP indexing (buffered, 50 events/batch) | All events                                                                                          |
| **NIC SIEM**                  | Syslog UDP (RFC 5424)                          | WARNING + CRITICAL only                                                                             |
| **Alert Engine**              | Internal cron (every 10 minutes)               | Pattern-based: brute force, privilege escalation, off-hours payments, rapid approvals, bulk exports |

### 6.12 Alert Rules

| Rule ID                        | Trigger                                            | Severity |
| ------------------------------ | -------------------------------------------------- | -------- |
| `BRUTE_FORCE`                  | > 10 failed logins from same IP in 5 min           | CRITICAL |
| `PRIVILEGE_ESCALATION`         | Any role change to ADMIN/SUPER_ADMIN               | CRITICAL |
| `OFF_HOURS_PAYMENT`            | NEFT verification outside 9AM-6PM IST weekdays     | WARNING  |
| `BULK_EXPORT`                  | Export of > 100 records in single operation        | WARNING  |
| `CERTIFICATE_WITHOUT_APPROVAL` | Certificate generated for non-APPROVED application | CRITICAL |
| `SCORE_MODIFICATION`           | Committee score changed after initial entry        | WARNING  |
| `RAPID_APPROVAL`               | Application approved < 1 hour from start of review | WARNING  |

---

## Part VII -- Implementation Roadmap

### Phase 1: Foundation (High Priority)

| Item                                                     | Domain  | Effort | Risk   |
| -------------------------------------------------------- | ------- | ------ | ------ |
| Enhanced EXIF validation pipeline with trust scoring     | EXIF    | Medium | Low    |
| Immutable audit log schema + hash chain + partitioning   | Audit   | Medium | Low    |
| Workflow-based access guard                              | RBAC    | Medium | Medium |
| Service worker with cache-first/network-first strategies | PWA     | Medium | Low    |
| Payment reconciliation service                           | Payment | Medium | Low    |

### Phase 2: Core Enhancements

| Item                                                      | Domain  | Effort | Risk   |
| --------------------------------------------------------- | ------- | ------ | ------ |
| Offline photo capture with IndexedDB + sync queue         | PWA     | High   | Medium |
| Delegation model + guard                                  | RBAC    | Medium | Low    |
| Refund workflow                                           | Payment | Medium | Low    |
| CAG/RTI report generators                                 | Audit   | Medium | Low    |
| GIGW session management (OTP, lockout, concurrent limits) | RBAC    | Medium | Medium |

### Phase 3: Advanced Features

| Item                                       | Domain  | Effort | Risk   |
| ------------------------------------------ | ------- | ------ | ------ |
| Push notifications (VAPID)                 | PWA     | Medium | Low    |
| Digital signature integration (eSign API)  | RBAC    | High   | High   |
| Multi-gateway support (BillDesk, SBI ePay) | Payment | High   | Medium |
| ELK/SIEM integration                       | Audit   | Medium | Low    |
| Multi-tenancy for CPCB/SPCB                | RBAC    | High   | High   |

### Phase 4: Production Hardening

| Item                                          | Domain  | Effort | Risk   |
| --------------------------------------------- | ------- | ------ | ------ |
| Automated integrity verification + alerting   | Audit   | Medium | Low    |
| Split payments for central/state distribution | Payment | Medium | Medium |
| PostGIS polygon geo-fencing                   | EXIF    | Medium | Low    |
| GST invoice generation + GSTR-1 export        | Payment | Medium | Low    |
| Lighthouse CI + offline QA testing suite      | PWA     | Low    | Low    |

---

## Appendix A: Key File References

| File                                                            | Purpose                          |
| --------------------------------------------------------------- | -------------------------------- |
| `apps/api/src/modules/attachments/geo-tag-validator.service.ts` | Current EXIF extraction          |
| `apps/api/src/modules/attachments/attachments.service.ts`       | Upload pipeline                  |
| `packages/shared/src/types/attachment.types.ts`                 | Document types, photo slots      |
| `packages/database/prisma/schema.prisma`                        | Full database schema (32 models) |
| `apps/api/src/common/guards/roles.guard.ts`                     | RBAC guard                       |
| `apps/api/src/common/interceptors/audit-log.interceptor.ts`     | Current audit interceptor        |
| `apps/api/src/modules/payments/payments.service.ts`             | Payment processing               |
| `apps/api/src/modules/payments/fee-calculator.service.ts`       | Fee calculation with discounts   |
| `apps/api/src/modules/certificates/certificates.service.ts`     | Certificate generation           |
| `apps/web/src/app/`                                             | Next.js App Router pages         |
| `docs/HLD.md`                                                   | High-level design (400+ lines)   |
| `docs/LLD.md`                                                   | Low-level design (500+ lines)    |
| `docs/CLAUDE.md`                                                | Development guidelines           |

## Appendix B: Dependencies to Add

```bash
# PWA (client-side)
pnpm --filter @apcd/web add idb uuid
pnpm --filter @apcd/web add -D fake-indexeddb

# Push notifications (server-side)
pnpm --filter @apcd/api add web-push
pnpm --filter @apcd/api add -D @types/web-push

# Async audit queue
pnpm --filter @apcd/api add @nestjs/bull bull

# ELK integration (optional)
pnpm --filter @apcd/api add @elastic/elasticsearch

# Already installed (no action needed):
# exifr, sharp, razorpay, pdfkit, qrcode, nodemailer, minio
```

## Appendix C: Compliance Standards Referenced

| Standard                | Applicable Section        | Key Requirement                                      |
| ----------------------- | ------------------------- | ---------------------------------------------------- |
| IT Act 2000, S.3A       | RBAC (digital signatures) | Electronic signatures for govt actions               |
| IT Act 2000, S.43A      | Audit                     | Reasonable security practices for sensitive data     |
| IT Act 2000, S.65B      | Audit                     | Electronic records as evidence                       |
| IT Act 2000, S.67C      | Audit                     | 5-year minimum data retention                        |
| RTI Act 2005            | Audit                     | Public authority must provide information on request |
| CVC Guidelines          | Audit                     | 8-year retention for vigilance cases                 |
| CAG Audit Standards     | Audit                     | Active system life + 10 years for financial records  |
| CERT-In Directions 2022 | Audit                     | 6-month log retention, 6-hour incident reporting     |
| DPDPA 2023, S.8(7)      | Audit                     | Purpose limitation on personal data retention        |
| GIGW 3.0                | RBAC, PWA                 | Session management, accessibility, mobile-first      |
| CPCB Directions         | EXIF                      | Mandatory geo-tagged photos for compliance           |
| PCI-DSS SAQ-A           | Payment                   | Card data never touches merchant servers             |
| CGST Act S.31           | Payment                   | GST invoice requirements                             |

---

_End of Specification_

_Generated for APCD OEM Empanelment Portal (NPC/CPCB)_
_Document version: 2.0 | 2026-02-03_
