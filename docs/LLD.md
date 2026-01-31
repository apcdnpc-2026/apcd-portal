# APCD OEM Empanelment Portal -- Low-Level Design (LLD)

## Module and File Breakdown

### Backend (`apps/api/src/`)

#### Core Bootstrap
| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `main.ts` | Application bootstrap: Helmet, CORS, ValidationPipe, Swagger, global filters/interceptors | `bootstrap()` |
| `app.module.ts` | Root module: imports all feature modules, configures global guards (JwtAuth, Roles, Throttler) | `AppModule` |

#### Common Layer (`common/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `decorators/current-user.decorator.ts` | Extracts JWT payload from request context | `CurrentUser` decorator, `JwtPayload` interface |
| `decorators/public.decorator.ts` | Marks routes as publicly accessible (bypasses JWT guard) | `Public` decorator, `IS_PUBLIC_KEY` |
| `decorators/roles.decorator.ts` | Specifies required roles for endpoints | `Roles` decorator, `ROLES_KEY` |
| `guards/jwt-auth.guard.ts` | Extends Passport `AuthGuard('jwt')`, checks `@Public()` metadata | `JwtAuthGuard` |
| `guards/roles.guard.ts` | Checks user role against `@Roles()` metadata | `RolesGuard` |
| `filters/http-exception.filter.ts` | Global exception filter, standardises error response format | `HttpExceptionFilter` |
| `interceptors/transform.interceptor.ts` | Wraps all responses in `{ success, data, timestamp }` | `TransformInterceptor` |
| `interceptors/audit-log.interceptor.ts` | Logs all requests to audit trail | `AuditLogInterceptor` |
| `dto/pagination.dto.ts` | Pagination query parameters | `PaginationDto`, `PaginatedResult<T>` |

#### Infrastructure (`infrastructure/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `database/prisma.service.ts` | Global Prisma client with `onModuleInit` connection | `PrismaService` |
| `database/prisma.module.ts` | Global module providing `PrismaService` | `PrismaModule` |
| `storage/minio.service.ts` | MinIO S3-compatible client for file operations | `MinioService` |
| `storage/minio.module.ts` | Configures MinIO connection from env vars | `MinioModule` |
| `storage/storage.module.ts` | Aggregates storage providers | `StorageModule` |

#### Auth Module (`modules/auth/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `auth.service.ts` | Authentication business logic | `AuthService` |
| `auth.controller.ts` | REST endpoints for auth flows | `AuthController` |
| `auth.module.ts` | Module wiring (JWT, Passport, Prisma) | `AuthModule` |
| `strategies/jwt.strategy.ts` | Passport JWT extraction from Bearer header | `JwtStrategy` |
| `strategies/jwt-refresh.strategy.ts` | Passport strategy for refresh tokens | `JwtRefreshStrategy` |
| `dto/login.dto.ts` | Login request validation | `LoginDto` |
| `dto/register.dto.ts` | Registration request validation (password strength regex) | `RegisterDto` |
| `dto/token-response.dto.ts` | Token response shape for Swagger | `TokenResponseDto` |

#### Applications Module (`modules/applications/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `applications.service.ts` | Full application lifecycle management | `ApplicationsService` |
| `applications.controller.ts` | REST endpoints for application CRUD + status transitions | `ApplicationsController` |
| `applications.module.ts` | Module wiring | `ApplicationsModule` |
| `application-validator.service.ts` | 11-rule validation before submission | `ApplicationValidatorService` |
| `fee-calculator.service.ts` | Fee calculation with GST + MSE discount | `FeeCalculatorService` |
| `dto/create-application.dto.ts` | Multi-step form DTOs | `CreateApplicationDto`, `UpdateApplicationDto`, `ContactPersonDto`, `ApcdSelectionDto` |
| `dto/application-filter.dto.ts` | List filtering/pagination | `ApplicationFilterDto` |

#### Attachments Module (`modules/attachments/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `attachments.service.ts` | File upload/download/verify with MinIO | `AttachmentsService` |
| `attachments.controller.ts` | Multipart upload + download endpoints | `AttachmentsController` |
| `geo-tag-validator.service.ts` | EXIF GPS extraction and India-bounds check | `GeoTagValidatorService` |
| `attachments.module.ts` | Module wiring (imports StorageModule) | `AttachmentsModule` |

#### Verification Module (`modules/verification/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `verification.service.ts` | Officer review workflow: queries, forwarding | `VerificationService` |
| `verification.controller.ts` | REST endpoints for document verification | `VerificationController` |
| `verification.module.ts` | Module wiring | `VerificationModule` |

#### Committee Module (`modules/committee/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `committee.service.ts` | 8-criterion evaluation logic | `CommitteeService` |
| `committee.controller.ts` | Evaluation endpoints | `CommitteeController` |
| `committee.module.ts` | Module wiring | `CommitteeModule` |

#### Payments Module (`modules/payments/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `payments.service.ts` | Razorpay + NEFT payment management | `PaymentsService` |
| `payments.controller.ts` | Payment endpoints | `PaymentsController` |
| `payments.module.ts` | Module wiring | `PaymentsModule` |

#### Certificates Module (`modules/certificates/`)

| File | Responsibility | Main Exports |
|------|---------------|--------------|
| `certificates.service.ts` | PDF generation, QR codes, certificate lifecycle | `CertificatesService` |
| `certificates.controller.ts` | Certificate endpoints (including public verify) | `CertificatesController` |
| `certificates.module.ts` | Module wiring | `CertificatesModule` |

#### Additional Modules

| Module | Files | Responsibility |
|--------|-------|---------------|
| `dashboard/` | controller, service, module | Role-specific KPI aggregation |
| `admin/` | controller, service, module | User management, fees, APCD types, stats, MIS reports |
| `notifications/` | controller, service, module, `channels/email.service.ts` | In-app + email notifications |
| `audit-log/` | controller, service, module | System audit trail |
| `oem-profile/` | controller, service, module, `dto/create-oem-profile.dto.ts` | OEM company profile CRUD |
| `staff-details/` | controller, service, module | Technical staff management (Annexure 7) |
| `installation-experience/` | controller, service, module | Past installation records (Annexure 6a) |
| `field-verification/` | controller, service, module | Site inspection management |
| `apcd-types/` | controller, service, module | APCD master data CRUD |
| `users/` | controller, service, module | Internal user management |

### Frontend (`apps/web/src/`)

| Directory | Key Files | Responsibility |
|-----------|-----------|---------------|
| `app/` | 30+ `page.tsx` files | Next.js App Router pages |
| `components/application/` | `step1-company-profile.tsx` through `step7-field-verification-sites.tsx` | Multi-step application form components |
| `components/layout/` | `dashboard-layout.tsx`, `header.tsx`, `sidebar.tsx` | Layout shell with role-based sidebar |
| `components/ui/` | 15+ shadcn/ui components | Reusable UI primitives |
| `lib/api.ts` | Axios instance with JWT interceptor | `api` instance, request/response interceptors |
| `lib/utils.ts` | Tailwind `cn()` helper | `cn()` |
| `store/auth-store.ts` | Zustand store with localStorage persistence | `useAuthStore` |
| `providers/auth-provider.tsx` | JWT refresh logic, redirect on 401 | `AuthProvider` |
| `providers/query-provider.tsx` | React Query client config | `QueryProvider` |

### Shared Package (`packages/shared/src/`)

| Directory | Key Files | Exports |
|-----------|-----------|---------|
| `types/` | `user.types.ts`, `application.types.ts`, `attachment.types.ts`, `payment.types.ts`, `apcd.types.ts`, `evaluation.types.ts`, `certificate.types.ts` | `Role`, `ApplicationStatus`, `STATUS_TRANSITIONS`, `STATUS_LABELS`, `APPLICATION_STEPS`, `ROLE_LABELS`, type interfaces |
| `constants/` | `fee-structure.ts`, `document-requirements.ts`, `apcd-categories.ts`, `evaluation-criteria.ts` | `FEE_AMOUNTS`, `GST_RATE`, `DISCOUNT_PERCENT`, `MANDATORY_DOCUMENTS`, `APCD_CATEGORY_LABELS`, `EVALUATION_CRITERIA` |
| `validators/` | `application.validator.ts`, `oem-profile.validator.ts`, `payment.validator.ts` | 17 Zod schemas for form validation |

### Database Package (`packages/database/`)

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | 22 models, 16 enums, full relational schema |
| `prisma/seed.ts` | Database seeding (APCD types, fee configs, test users) |
| `prisma/seed-dummy-data.ts` | Extended dummy data for development |
| `index.ts` | Re-exports `@prisma/client` types |

---

## Function and Class Specifications

### AuthService

#### `register(dto: RegisterDto): Promise<TokenResponse>`
- **Purpose**: Registers a new OEM user account
- **Inputs**: `dto.email` (string), `dto.password` (string, 8+ chars with uppercase/lowercase/number/special), `dto.firstName`, `dto.lastName`, `dto.phone`
- **Outputs**: `{ accessToken, refreshToken, expiresIn, user: { id, email, role, firstName, lastName } }`
- **Side effects**: Creates User record (role=OEM, isVerified=false), creates RefreshToken record
- **Error handling**: `ConflictException` if email exists
- **Business rules**: Email is lowercased before storage; password hashed with bcryptjs salt=12

#### `login(dto: LoginDto): Promise<TokenResponse>`
- **Purpose**: Authenticates user and issues tokens
- **Inputs**: `dto.email` (string), `dto.password` (string)
- **Outputs**: Same as register
- **Side effects**: Updates `lastLoginAt` on User
- **Error handling**: `UnauthorizedException` if email not found, password wrong, or account deactivated
- **Business rules**: Same error message for wrong email and wrong password (prevents enumeration)

#### `refreshTokens(userId: string, refreshToken: string): Promise<TokenPair>`
- **Purpose**: Rotates access + refresh tokens
- **Inputs**: User ID from JWT, refresh token string
- **Outputs**: `{ accessToken, refreshToken, expiresIn }`
- **Side effects**: Revokes old refresh token (`revokedAt = now`), creates new refresh token
- **Error handling**: `UnauthorizedException` if token not found, revoked, or expired

#### `getMe(userId: string): Promise<UserProfile>`
- **Purpose**: Returns current user profile
- **Inputs**: User ID from JWT
- **Outputs**: User object with selected fields
- **Error handling**: `UnauthorizedException` if user not found

#### `logout(userId: string): Promise<void>`
- **Purpose**: Revokes all refresh tokens for user
- **Side effects**: Sets `revokedAt` on all active RefreshToken records

#### `resetTestPasswords(secret: string): Promise<ResetResult>`
- **Purpose**: Upserts 7 test users with known passwords (CI/CD only)
- **Inputs**: Secret header value
- **Error handling**: `ForbiddenException` if secret doesn't match `SEED_SECRET`
- **Business rules**: Creates users if they don't exist; also creates OEM profile for test OEM

### ApplicationsService

#### `create(userId: string): Promise<Application>`
- **Purpose**: Creates a draft application or returns existing draft
- **Side effects**: Creates Application (status=DRAFT), generates `APCD-YYYY-NNNN` number
- **Error handling**: `BadRequestException` if user has no OEM profile
- **Business rules**: Reuses existing DRAFT application if one exists

#### `update(id: string, userId: string, dto: UpdateApplicationDto): Promise<Application>`
- **Purpose**: Updates draft/queried application (auto-save per step)
- **Side effects**: Updates application fields, upserts contact persons, syncs APCD selections
- **Error handling**: `NotFoundException`, `ForbiddenException` (not owner), `BadRequestException` (wrong status)
- **Business rules**: Only DRAFT and QUERIED applications can be updated

#### `submit(id: string, userId: string): Promise<Application>`
- **Purpose**: Submits application (DRAFT -> SUBMITTED)
- **Side effects**: Runs `ApplicationValidatorService.validateForSubmission()`, creates StatusHistory
- **Error handling**: `BadRequestException` with array of validation errors if incomplete
- **Business rules**: 11 validation rules must pass (profile, contacts, turnover, ISO, APCDs, experiences, staff, documents, geo-photos, payment, declaration)

#### `changeStatus(id: string, newStatus: ApplicationStatus, changedBy: string, remarks?: string): Promise<Application>`
- **Purpose**: Officer/admin status transition
- **Side effects**: Creates StatusHistory, sets timestamps (submittedAt, approvedAt, rejectedAt, lastQueriedAt)
- **Error handling**: `BadRequestException` for invalid transitions
- **Business rules**: Status transitions validated against `STATUS_TRANSITIONS` map

### ApplicationValidatorService

#### `validateForSubmission(applicationId: string): Promise<string[]>`
- **Purpose**: Validates application completeness against 11 rules
- **Inputs**: Application ID
- **Outputs**: Array of error strings (empty = valid)
- **Side effects**: None (read-only)
- **Error handling**: `BadRequestException` if application not found
- **Invariants**:
  1. OEM profile must exist
  2. At least 1 contact person
  3. 3 years turnover data
  4. At least 1 ISO certification (9001/14001/45001)
  5. At least 1 APCD selected for empanelment
  6. 3 installation experiences per APCD type
  7. 2+ engineers with B.Tech/M.Tech
  8. All mandatory documents uploaded
  9. 2+ geo-tagged photos with valid GPS
  10. Application fee paid (COMPLETED or VERIFIED)
  11. Declaration accepted

### FeeCalculatorService

#### `calculateForApplication(applicationId: string, userId: string): Promise<FeeBreakdown>`
- **Purpose**: Calculates total fees based on APCD count and discount eligibility
- **Outputs**: `{ applicationFee, empanelmentFee, grandTotal, isDiscountEligible }`
- **Business rules**:
  - Application fee: Rs 25,000
  - Empanelment fee: Rs 65,000 x APCD type count
  - 15% discount if OEM is MSE, Startup, or Local Supplier
  - 18% GST on all fees

### AttachmentsService

#### `upload(applicationId: string, documentType: DocumentType, file: Multer.File, userId: string, photoSlot?: string): Promise<Attachment>`
- **Purpose**: Uploads document to MinIO and creates metadata record
- **Side effects**: Stores file in MinIO bucket, creates Attachment record
- **Error handling**: `NotFoundException` (app), `ForbiddenException` (not owner), `BadRequestException` (file too large/wrong type)
- **Business rules**: For `GEO_TAGGED_PHOTOS`, validates EXIF GPS data via `GeoTagValidatorService`; stores coordinates and validity flag

#### `verify(attachmentId: string, verifiedBy: string, isVerified: boolean, note?: string): Promise<Attachment>`
- **Purpose**: Officer marks document as verified
- **Side effects**: Updates `isVerified`, `verifiedBy`, `verifiedAt`, `verificationNote`

### GeoTagValidatorService

#### `extractAndValidate(buffer: Buffer): Promise<GeoValidationResult>`
- **Purpose**: Extracts GPS coordinates and timestamp from EXIF data
- **Outputs**: `{ hasGps, hasTimestamp, hasValidGeoTag, latitude?, longitude?, timestamp?, isWithinIndia?, error? }`
- **Business rules**: Uses exifr library; coordinates must be within India bounds (6.75-35.50 N, 68.11-97.40 E)

### VerificationService

#### `raiseQuery(applicationId: string, officerId: string, dto: RaiseQueryDto): Promise<Query>`
- **Purpose**: Officer raises a query on application
- **Side effects**: Creates Query (status=OPEN), transitions application to QUERIED, creates StatusHistory
- **Business rules**: Sets deadline; application only transitions to QUERIED once

#### `respondToQuery(queryId: string, userId: string, dto: RespondToQueryDto): Promise<Result>`
- **Purpose**: OEM responds to query
- **Side effects**: Creates QueryResponse, updates Query status to RESPONDED; auto-transitions application to RESUBMITTED if all queries have responses
- **Error handling**: `ForbiddenException` if user is not the application owner

#### `forwardToCommittee(applicationId: string, officerId: string, remarks: string): Promise<Application>`
- **Purpose**: Forwards verified application to committee review
- **Side effects**: Transitions status to COMMITTEE_REVIEW, creates StatusHistory
- **Error handling**: `BadRequestException` if application not in reviewable status

### CommitteeService

#### `submitEvaluation(applicationId: string, evaluatorId: string, dto: SubmitEvaluationDto): Promise<CommitteeEvaluation>`
- **Purpose**: Submits 8-criterion evaluation
- **Inputs**: Scores per criterion (0-10), recommendation, remarks
- **Side effects**: Creates CommitteeEvaluation + EvaluationScore records
- **Error handling**: `BadRequestException` if already evaluated by same member
- **Business rules**: 8 criteria x 10 points max each = 80 possible; pass threshold = 60

#### `finalizeDecision(applicationId: string, officerId: string, decision: string, remarks: string): Promise<Application>`
- **Purpose**: Finalizes committee outcome (APPROVED/REJECTED)
- **Side effects**: Transitions application status, sets timestamps

### PaymentsService

#### `createRazorpayOrder(userId: string, dto: RazorpayOrderDto): Promise<OrderResult>`
- **Purpose**: Creates Razorpay payment order
- **Side effects**: Creates Payment record (INITIATED), calls Razorpay API
- **Outputs**: `{ paymentId, orderId, amount, currency, keyId }`

#### `verifyRazorpayPayment(dto: VerifyRazorpayDto): Promise<Payment>`
- **Purpose**: Verifies Razorpay payment signature
- **Side effects**: Updates Payment status to COMPLETED/FAILED
- **Business rules**: HMAC-SHA256 signature verification against `RAZORPAY_KEY_SECRET`

#### `recordManualPayment(userId: string, dto: ManualPaymentDto): Promise<Payment>`
- **Purpose**: Records NEFT/RTGS payment pending officer verification
- **Side effects**: Creates Payment (VERIFICATION_PENDING) with UTR number and bank details

#### `verifyManualPayment(paymentId: string, officerId: string, isVerified: boolean, remarks?: string): Promise<Payment>`
- **Purpose**: Officer verifies manual payment
- **Side effects**: Updates Payment to VERIFIED/FAILED, may trigger application status change

### CertificatesService

#### `generateCertificate(officerId: string, dto: GenerateCertificateDto): Promise<Certificate>`
- **Purpose**: Issues empanelment certificate for approved application
- **Side effects**: Creates Certificate record, generates `NPC/APCD/YYYY/NNNNN` number
- **Business rules**: 2-year validity from issue date; QR code points to public verification URL

#### `generatePDFBuffer(certificateId: string): Promise<Buffer>`
- **Purpose**: Generates PDF document with borders, header, APCD table, QR code
- **Outputs**: PDF buffer via pdfkit

#### `verifyCertificate(certificateNumber: string): Promise<VerificationResult>`
- **Purpose**: Public certificate verification
- **Outputs**: `{ isValid, certificateNumber, status, isExpired, companyName, apcdTypes, validUntil }`

### DashboardService

#### `getOemDashboard(userId: string): Promise<OemDashboard>`
- Returns: application counts by status, active certificates, expiring certificates, pending queries, total payments

#### `getOfficerDashboard(): Promise<OfficerDashboard>`
- Returns: applications by status, pending payments, pending field verifications, today's stats

#### `getAdminDashboard(): Promise<AdminDashboard>`
- Returns: officer dashboard + user stats (by role), certificate stats, payment stats

### NotificationsService

#### `send(dto: SendNotificationDto): Promise<Notification>`
- Creates in-app notification + sends email if user has email address
- Email failures are logged but don't throw

#### `notifyApplicationStatusChange(applicationId: string, newStatus: string, remarks?: string): Promise<Notification>`
- Sends status-specific notification with appropriate title/message

---

## Domain Model Details

### Application Status Machine
The application progresses through 18 possible statuses. Valid transitions are enforced in `STATUS_TRANSITIONS`:

```
DRAFT → SUBMITTED → UNDER_REVIEW → QUERIED → RESUBMITTED
                                  → COMMITTEE_REVIEW → COMMITTEE_QUERIED
                                                     → FIELD_VERIFICATION → LAB_TESTING → FINAL_REVIEW
                                                                                        → APPROVED → RENEWAL_PENDING → EXPIRED
                                                                                        → PROVISIONALLY_APPROVED
                                                                                        → REJECTED
                                  → WITHDRAWN (from DRAFT or QUERIED)
APPROVED → SUSPENDED → BLACKLISTED
```

### Fee Calculation Business Rules
| Fee Type | Base Amount (INR) | Calculation |
|----------|-------------------|-------------|
| Application Fee | 25,000 | Fixed, one-time |
| Empanelment Fee | 65,000 | Per APCD type seeking empanelment |
| Field Verification | 57,000 | Per application |
| Emission Testing | TBD | Per APCD type |
| Annual Renewal | 35,000 | Per year |
| Surveillance Visit | 25,000 | Per visit |

- **GST**: 18% applied to all fees
- **Discount**: 15% off base amount for MSE/Startup/Local Supplier
- **Discount eligibility**: Checked via `OemProfile.isMSE`, `isStartup`, or `isLocalSupplier`

### Document Requirements
26 document types defined in `DocumentType` enum. Mandatory documents (from `MANDATORY_DOCUMENTS` constant):
- Company Registration, GST Certificate, PAN Card
- Service Support Undertaking, Non-Blacklisting Declaration
- Turnover Certificate, ISO Certification, Product Datasheet
- Test Certificate, GA Drawing, Geo-Tagged Photos (min 2)

### Evaluation Criteria (Committee)
8 criteria, each scored 0-10:
1. Experience & Scope of Supply
2. Technical Specification of APCDs
3. Technical Team & Capability
4. Financial Standing
5. Legal & Quality Compliance
6. Customer Complaint Handling
7. Client Feedback
8. Global Supply (Optional)

**Pass threshold**: 60 out of 100 maximum

### Permission Model
| Action | Allowed Roles |
|--------|--------------|
| Register | Public (OEM only) |
| Create/Update/Submit application | OEM |
| View own applications | OEM |
| View all applications | OFFICER, ADMIN, SUPER_ADMIN |
| Verify documents | OFFICER |
| Raise/resolve queries | OFFICER |
| Forward to committee | OFFICER |
| Evaluate application | COMMITTEE |
| Conduct field verification | FIELD_VERIFIER |
| Verify manual payments | OFFICER, DEALING_HAND |
| Manage users | ADMIN, SUPER_ADMIN |
| Manage fees/APCD types | ADMIN, SUPER_ADMIN |
| Issue/revoke certificates | ADMIN, OFFICER |
| View admin dashboard | ADMIN |

---

## Internal Flows

### Flow: Create and Submit Application

```
1. OEM calls POST /api/applications
   → ApplicationsController.create()
   → ApplicationsService.create(userId)
     → Checks OemProfile exists
     → Checks for existing DRAFT (reuses if found)
     → Generates applicationNumber: "APCD-{YYYY}-{NNNN}"
     → prisma.application.create({ status: DRAFT, currentStep: 1 })
     → Returns application

2. OEM updates steps 1-9 via PUT /api/applications/:id
   → ApplicationsService.update(id, userId, dto)
     → Validates ownership + status (DRAFT/QUERIED)
     → Updates fields per step
     → For step 2: upserts ContactPerson records
     → For step 3: syncs ApplicationApcd selections
     → Returns updated application

3. OEM uploads documents via POST /api/attachments/upload
   → AttachmentsService.upload(appId, docType, file, userId)
     → Generates storagePath: "applications/{appId}/{docType}/{uuid}.ext"
     → MinioService.putObject(bucket, path, buffer)
     → For GEO_TAGGED_PHOTOS: GeoTagValidatorService.extractAndValidate(buffer)
     → prisma.attachment.create({ ...metadata, geoLatitude, geoLongitude })

4. OEM pays fee via POST /api/payments/razorpay/create-order
   → PaymentsService.createRazorpayOrder(userId, dto)
     → Validates application ownership
     → Calculates fee via FeeCalculatorService
     → Razorpay.orders.create({ amount, currency, receipt })
     → prisma.payment.create({ status: INITIATED, razorpayOrderId })
   → [Client-side Razorpay checkout]
   → POST /api/payments/razorpay/verify
   → PaymentsService.verifyRazorpayPayment(dto)
     → HMAC-SHA256 signature verification
     → prisma.payment.update({ status: COMPLETED })

5. OEM submits via POST /api/applications/:id/submit
   → ApplicationsService.submit(id, userId)
     → ApplicationValidatorService.validateForSubmission(id)
       → 11 validation rules checked
       → Returns string[] errors (empty = valid)
     → If errors: throw BadRequestException({ errors })
     → prisma.$transaction:
       → application.update({ status: SUBMITTED, submittedAt: now })
       → statusHistory.create({ from: DRAFT, to: SUBMITTED })
```

### Flow: Officer Query and OEM Response

```
1. Officer views pending: GET /api/verification/pending
   → VerificationService.getPendingApplications()
     → prisma.application.findMany({ status: in [SUBMITTED, UNDER_REVIEW, RESUBMITTED] })

2. Officer raises query: POST /api/verification/application/:id/query
   → VerificationService.raiseQuery(appId, officerId, { subject, description })
     → prisma.query.create({ status: OPEN, deadline })
     → If app not already QUERIED:
       → transitionStatus(appId, currentStatus, QUERIED)
       → prisma.statusHistory.create()
     → NotificationsService.send() → email to OEM

3. OEM responds: POST /api/verification/query/:id/respond
   → VerificationService.respondToQuery(queryId, userId, { message })
     → Validates: query.application.applicantId === userId
     → prisma.queryResponse.create({ message })
     → prisma.query.update({ status: RESPONDED })
     → Checks: are ALL open queries now responded?
       → If yes: transitionStatus(appId, QUERIED, RESUBMITTED)

4. Officer resolves: PUT /api/verification/query/:id/resolve
   → VerificationService.resolveQuery(queryId)
     → prisma.query.update({ status: RESOLVED })
```

### Flow: Certificate Generation

```
1. Admin/Officer triggers: POST /api/certificates/generate
   → CertificatesService.generateCertificate(officerId, { applicationId, type })
     → Validates application status = APPROVED
     → generateCertificateNumber() → "NPC/APCD/2025/00001"
     → prisma.certificate.create({
         certificateNumber, type, status: ACTIVE,
         validFrom: today, validUntil: today + 2 years
       })

2. PDF generation: GET /api/certificates/:id/pdf
   → CertificatesService.generatePDFBuffer(certId)
     → new PDFDocument()
     → Draws: border, NPC header, certificate title, OEM details
     → APCD types table
     → Validity dates
     → QR code (generated via qrcode library)
     → Signature blocks
     → Returns Buffer
```

---

## Testing Strategy (Design Perspective)

### Auth Module
- **Unit**: Register (email uniqueness, password hashing, OEM role assignment), Login (valid/invalid credentials, inactive account), Token refresh (rotation, revocation), Logout
- **Integration**: Full register → login → refresh → logout flow against test DB
- **E2E**: Login page, registration form, session persistence

### Applications Module
- **Unit**: Application creation (draft reuse, number generation), Update validation (step-by-step), Submit validation (all 11 rules), Status transitions (valid/invalid)
- **Integration**: Create → update steps → upload docs → pay → submit flow
- **E2E**: Full 9-step form completion journey
- **Risk area**: `ApplicationValidatorService` -- 11 interacting rules with edge cases

### Attachments Module
- **Unit**: File type validation, geo-tag extraction, MinIO path generation
- **Integration**: Upload → download → verify cycle with real MinIO
- **Risk area**: Geo-tag validation edge cases (no EXIF, partial GPS, outside India)

### Verification Module
- **Unit**: Query creation, response validation, auto-resubmit logic, committee forwarding
- **Integration**: Submit → officer review → query → respond → resolve → forward
- **Risk area**: Auto-resubmit when all queries responded

### Committee Module
- **Unit**: Score calculation, pass/fail threshold, duplicate evaluation prevention
- **Integration**: Forward → evaluate → finalize decision
- **Risk area**: Average score calculation across multiple evaluators

### Payments Module
- **Unit**: Fee calculation (base, GST, discount), Razorpay signature verification, manual payment recording
- **Integration**: Fee calculate → create order → verify → status update
- **Risk area**: Razorpay signature verification, payment-to-application status coupling

### Certificates Module
- **Unit**: Certificate number generation, PDF buffer generation, validity calculations, expiry detection
- **Integration**: Approve → generate certificate → verify → renew cycle
- **Risk area**: PDF generation (visual regression), QR code data integrity

### Shared Validators
- **Unit**: All 17 Zod schemas with valid/invalid inputs
- **Risk area**: GST regex (`/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/`), PAN regex

---

## Refactoring / Change Rules

### SAFE Changes (Low Risk)
- Adding new optional fields to DTOs
- Adding new dashboard widgets (read-only aggregations)
- Adding new notification types
- Updating email templates
- Adding new optional document types
- UI-only changes in `apps/web/src/components/`
- **Required tests**: Unit tests for changed module

### DANGEROUS Changes (High Risk)
- Modifying `ApplicationValidatorService` rules -- affects all submissions
- Changing `STATUS_TRANSITIONS` map -- affects entire workflow
- Modifying fee calculation logic -- financial impact
- Changing Prisma schema (especially removing/renaming fields) -- cascading breakage
- Modifying JWT strategy or guard logic -- security impact
- Changing `TransformInterceptor` response wrapper -- breaks all API consumers
- Modifying `HttpExceptionFilter` -- breaks error handling contract
- **Required tests**: Full unit + integration + E2E suite must pass

### Critical Test Suites to Run

| Change Area | Must Run |
|-------------|----------|
| Auth changes | `auth.service.spec.ts`, `jwt-auth.guard.spec.ts`, auth integration tests |
| Application logic | `applications.service.spec.ts`, `application-validator.service.spec.ts`, application integration tests |
| Payment changes | `payments.service.spec.ts`, payment integration tests |
| Role/permission changes | `roles.guard.spec.ts`, RBAC integration tests, all E2E journeys |
| Database schema | ALL tests (schema changes cascade everywhere) |
| Shared package changes | ALL tests (both API and web consume shared types) |
