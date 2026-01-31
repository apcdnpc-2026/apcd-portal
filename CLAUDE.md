# CLAUDE.md -- AI-Assisted Development Guidelines

## Project Overview

APCD OEM Empanelment Portal -- a Turborepo monorepo for managing air pollution control device manufacturer empanelment for the National Productivity Council (NPC).

**Architecture**: NestJS API + Next.js 14 frontend + PostgreSQL + MinIO + Redis

## Before Making Any Change

1. Read `docs/HLD.md` for system architecture and component relationships
2. Read `docs/LLD.md` for module-level details, function signatures, and business rules
3. Understand the module you're changing and its dependencies

## Monorepo Structure

```
apps/api/          -- NestJS backend (port 4000)
apps/web/          -- Next.js 14 frontend (port 3000)
packages/database/ -- Prisma schema, migrations, seed
packages/shared/   -- Types, constants, Zod validators (shared between API and web)
packages/eslint-config/ -- Shared ESLint rules
```

## Key Commands

```bash
pnpm dev                  # Start all apps
pnpm build                # Build all
pnpm lint                 # Lint all
pnpm type-check           # TypeScript check all
pnpm test                 # Run all unit tests
pnpm --filter @apcd/api test        # API unit tests only
pnpm --filter @apcd/web test        # Web unit tests only
pnpm --filter @apcd/api test:e2e    # API integration tests
pnpm test:e2e             # Playwright E2E tests
pnpm test:roles           # Role-based integration tests (against running API)
pnpm db:generate          # Generate Prisma client
pnpm db:seed              # Seed database
```

## Development Workflow

### For any new feature or refactor:

1. **Update/add tests first** (test-driven development preferred):
   - Unit tests in `apps/api/src/modules/<module>/<service>.spec.ts`
   - Integration tests in `apps/api/test/integration/<module>.e2e-spec.ts`
   - E2E tests in `e2e/<journey>.spec.ts` for user-visible flows

2. **Then modify code** to satisfy the tests

3. **After code changes, run the full test suite**:
   ```bash
   pnpm lint && pnpm type-check && pnpm test
   ```

4. **If any test fails**, fix code/tests until green

5. **If architecture or behavior changes**, update `docs/HLD.md` and `docs/LLD.md`

## Module Patterns

### Adding a new API module

Create under `apps/api/src/modules/<name>/`:
- `<name>.module.ts` -- NestJS module
- `<name>.service.ts` -- Business logic
- `<name>.service.spec.ts` -- Unit tests
- `<name>.controller.ts` -- REST endpoints
- `dto/` -- Request validation DTOs (class-validator)

Register in `app.module.ts`.

### Adding a new frontend page

Create `apps/web/src/app/<route>/page.tsx` using the App Router pattern.
Use the existing `DashboardLayout` for authenticated pages.

### Changing the database schema

1. Edit `packages/database/prisma/schema.prisma`
2. Run `pnpm db:generate` to update Prisma client
3. Run `pnpm --filter @apcd/database db:migrate -- --name <description>` for migration
4. Update seed if new required data is needed
5. Run ALL tests -- schema changes cascade everywhere

## Testing Conventions

### Unit Tests (Jest)
- Pattern: `mockDeep<PrismaClient>()` from `jest-mock-extended`
- NestJS `Test.createTestingModule()` for DI setup
- Mock external services (MinIO, Razorpay, Nodemailer)
- Test file co-located with source: `<service>.spec.ts`

### Integration Tests (Jest + Supertest)
- Located in `apps/api/test/integration/`
- Use real NestJS app instance with test database
- Config: `apps/api/test/jest-e2e.json`

### E2E Tests (Playwright)
- Located in `e2e/`
- Config: `playwright.config.ts`
- Run headless by default, screenshots on failure

### Shared Package Tests
- Located next to source files in `packages/shared/src/`
- Plain Jest (no NestJS module needed)
- Test Zod validators with `.safeParse()`

## Critical Business Rules

These are enforced in code and must be preserved:

1. **Application Submission Validation** (`application-validator.service.ts`): 11 rules must pass before DRAFT -> SUBMITTED
2. **Status Transitions** (`STATUS_TRANSITIONS` in shared package): Only valid transitions are allowed
3. **Fee Calculation**: Application Rs 25K + Empanelment Rs 65K/APCD + 18% GST - 15% MSE discount
4. **Committee Evaluation**: 8 criteria, max 100 points, pass threshold 60
5. **Geo-Tag Validation**: Factory photos must have valid GPS EXIF within India bounds
6. **Password Policy**: 8+ chars, uppercase, lowercase, number, special char, bcryptjs salt=12

## Dangerous Changes (Require Full Test Suite)

- `application-validator.service.ts` -- affects all submissions
- `STATUS_TRANSITIONS` in shared package -- affects entire workflow
- Fee calculation logic -- financial impact
- Prisma schema changes -- cascading breakage
- JWT/guard logic -- security impact
- `TransformInterceptor` -- breaks all API response shapes
- `HttpExceptionFilter` -- breaks error handling contract

## Safe Changes

- New optional DTO fields
- New dashboard widgets (read-only)
- New notification types
- Email template updates
- UI-only changes in `apps/web/src/components/`

## Environment Variables

See `.env.example` for all variables. Critical ones:
- `DATABASE_URL` -- PostgreSQL connection
- `JWT_SECRET` -- JWT signing (never commit real values)
- `MINIO_*` -- Object storage
- `RAZORPAY_*` -- Payment gateway

## Code Style

- ESLint + Prettier enforced via lint-staged
- Conventional commits enforced via commitlint
- Import order: external -> internal (enforced by ESLint)
- Use `bcryptjs` (not native `bcrypt`) for Docker Alpine compatibility
