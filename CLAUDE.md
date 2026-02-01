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

## E2E Test Writing Rules (Learned from Production Failures)

These rules were derived from real test failures during the E2E stabilization effort. Follow them strictly when writing or modifying Playwright tests.

### Selector Priority (most stable → least stable)

| Priority | Type             | Example                                    | When to Use                                   |
| -------- | ---------------- | ------------------------------------------ | --------------------------------------------- |
| 1        | `data-testid`    | `[data-testid="submit-btn"]`               | Always preferred for key interactive elements |
| 2        | ARIA role + name | `getByRole('button', { name: /submit/i })` | Standard UI elements                          |
| 3        | Text content     | `getByText(/evaluation scoring/i)`         | Headings, labels, status text                 |
| 4        | Compound class   | `.rounded-lg.border`                       | Last resort for structural queries            |

### NEVER Do These

1. **Never use `[class*="..."]` substring selectors** — Tailwind class order in the HTML attribute is unpredictable. `[class*="rounded-lg border"]` breaks when classes appear as `border p-4 rounded-lg`.

2. **Never target Tailwind pseudo-class prefixes** — `.hover\:shadow-md`, `.md\:hidden`, `.focus\:ring` are invalid CSS selectors in `querySelectorAll`. The colon cannot be reliably escaped.

3. **Never use generic utility classes as selectors** — `.font-medium`, `.text-sm`, `.flex` match dozens of elements including hidden mobile nav buttons. A `.font-medium` selector once resolved to an invisible hamburger menu button (`md:hidden`) instead of page content.

4. **Never assume a text locator matches exactly once** — Toast notifications render duplicate text (visible + screen reader span). Mobile nav duplicates page headings. Always add `.first()` when multiple matches are possible:
   ```ts
   // BAD — strict mode fails on 2+ matches
   await expect(page.getByText(/manufacturing facility/i)).toBeVisible();
   // GOOD
   await expect(page.getByText(/manufacturing facility/i).first()).toBeVisible();
   ```

### ALWAYS Do These

1. **Add `data-testid` to key UI elements when building components** — Every card, list item, form section, action button, and empty state message should have a `data-testid`. This is the single most impactful thing for test stability.

2. **Handle empty state in every test** — Tests must pass regardless of database state:

   ```ts
   const items = page.getByRole('link', { name: /evaluate/i });
   const empty = page.getByText(/no applications pending/i);
   if ((await items.count()) > 0) {
     await expect(items.first()).toBeVisible();
   } else {
     await expect(empty).toBeVisible();
   }
   ```

3. **Use `test.skip()` guards for data-dependent tests** — If a test requires specific data (pending applications, responded queries), skip gracefully:

   ```ts
   if ((await evaluateLinks.count()) === 0) {
     test.skip(true, 'No applications pending committee evaluation');
     return;
   }
   ```

4. **Use `Promise.race` for post-action assertions** — After form submissions, the app might redirect OR show a toast. Don't assume which:

   ```ts
   await Promise.race([
     page.waitForURL(/\/committee/, { timeout: 30000 }),
     expect(page.getByText(/submitted successfully/i).first()).toBeVisible({ timeout: 15000 }),
   ]);
   ```

5. **Add server error skip guards** — Next.js dev mode crashes under load. Detect and skip:

   ```ts
   if (await hasServerError(page)) {
     test.skip(true, 'Server error on evaluation page');
     return;
   }
   ```

6. **Run E2E tests against production build, never dev mode** — Next.js dev server crashes after ~35 sequential navigations (Jest worker memory exhaustion). Always use `next build` + `next start`. Tests run 10-20x faster too.

### Timeout Configuration

Use consistent generous timeouts — don't vary between local/remote:

```ts
// playwright.config.ts
timeout: 60_000,
expect: { timeout: 15_000 },
use: {
  navigationTimeout: 30_000,
  actionTimeout: 15_000,
}
```

### Test File Organization

Organize by user role journey, not by page:

```
e2e/
  oem-journey.spec.ts           # OEM: register → apply → track
  officer-journey.spec.ts       # Officer: review → query → forward
  committee-journey.spec.ts     # Committee: evaluate → score → submit
  field-verifier-journey.spec.ts
  dealing-hand-journey.spec.ts
  admin-journey.spec.ts
  certificate-verification.spec.ts
  helpers/auth.ts               # loginAs, waitForLoad, hasServerError
```

### Reusable Test Helpers (in e2e/helpers/auth.ts)

- `loginAs(page, role)` — Login with seeded test user + wait for dashboard
- `waitForLoad(page)` — Wait for `.animate-spin` spinners to disappear
- `hasServerError(page)` — Detect Next.js error overlay (returns boolean)
- `getCredentials(role)` — Get raw email/password for a test role

### Component Design Rules for Testability

When building new UI components, ensure:

- **Cards**: Add `data-testid="application-card-{id}"` or similar unique identifier
- **Empty states**: Render consistent text like "No applications found" (not just blank space)
- **Forms**: Use `aria-label`, `placeholder`, and proper `<label htmlFor>` associations
- **Buttons**: Use descriptive text (`Submit Evaluation`, not just `Submit`)
- **Status badges**: Include unique, regex-matchable status text
- **Tables vs Cards**: Pick one pattern per page and stick with it — tests break when layout switches between table rows and cards
- **Mobile nav**: Ensure mobile-only elements don't share generic classes with page content

### Windows Development Notes

- `output: 'standalone'` in `next.config.js` causes EPERM symlink errors during `next build` on Windows without Developer Mode enabled. The build still produces a valid `.next` directory — `next start` works fine with the partial build.
- For local E2E: use `next build && next start -p 3000` (not `next dev`)

## Code Style

- ESLint + Prettier enforced via lint-staged
- Conventional commits enforced via commitlint
- Import order: external -> internal (enforced by ESLint)
- Use `bcryptjs` (not native `bcrypt`) for Docker Alpine compatibility
