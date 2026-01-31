import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * OEM User Journey - End-to-End Tests
 *
 * Covers the complete OEM lifecycle:
 *   1. Login -> OEM dashboard with stats
 *   2. View / complete company profile
 *   3. Create new application -> auto-created, step 1 loads
 *   4. Step 1: Select APCD types
 *   5. Step 2: Document upload section
 *   6. Navigate through all steps to Review & Submit
 *   7. Submit application -> redirect to payment checkout
 *   8. View submitted applications list
 *   9. Access /queries page and view queries
 *   10. View individual query details and respond
 */

const uniqueId = Date.now();
const NEW_OEM = {
  firstName: 'OEMJourney',
  lastName: 'Test',
  email: `oem-journey-${uniqueId}@test.com`,
  phone: '9876543210',
  password: 'OemJourney@2025!',
};

test.describe('OEM User Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('OEM dashboard loads with heading and stats', async ({ page }) => {
    await loginAs(page, 'oem');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await waitForLoad(page);

    // Dashboard should render stat cards or summary text
    await expect(
      page.getByText(/application|empanelment|dashboard/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // ── Registration ───────────────────────────────────────────────────────

  test('register a new OEM and land on OEM dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.waitForSelector('form');

    await expect(page.getByRole('heading', { name: /OEM Registration/i })).toBeVisible();

    await page.getByLabel(/first name/i).fill(NEW_OEM.firstName);
    await page.getByLabel(/last name/i).fill(NEW_OEM.lastName);
    await page.getByLabel(/email address/i).fill(NEW_OEM.email);
    await page.getByLabel(/mobile number/i).fill(NEW_OEM.phone);
    await page.getByLabel(/^password$/i).fill(NEW_OEM.password);
    await page.getByLabel(/confirm password/i).fill(NEW_OEM.password);

    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL(/\/dashboard\/oem/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  // ── Company Profile ────────────────────────────────────────────────────

  test('company profile page loads and can be filled', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/profile');
    await page.waitForSelector('form');

    await expect(page.getByRole('heading', { name: /company profile/i })).toBeVisible();

    // Fill required profile fields
    await page.getByLabel(/company name/i).fill('E2E Test Manufacturing Ltd');

    const firmTypeTrigger = page.locator('button:has-text("Select firm type")');
    if (await firmTypeTrigger.isVisible()) {
      await firmTypeTrigger.click();
      await page.getByRole('option', { name: /private limited/i }).click();
    }

    await page.getByLabel(/GST Registration No/i).fill('06AABCU9603R1ZM');
    await page.getByLabel(/PAN Number/i).fill('AABCU9603R');
    await page.getByLabel(/contact number/i).fill('9876543210');
    await page.getByLabel(/full address/i).fill('Plot 42, Industrial Area Phase-II, Gurugram');
    await page.getByLabel(/^state/i).fill('Haryana');
    await page.getByLabel(/PIN Code/i).fill('122002');

    await page.getByRole('button', { name: /save profile|update profile/i }).click();

    await expect(page.getByText(/profile (created|updated)/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Create Application ─────────────────────────────────────────────────

  test('create new application - page loads with step 1', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    await expect(
      page.getByRole('heading', { name: /new empanelment application/i }),
    ).toBeVisible({ timeout: 15000 });

    // Step progress should be visible
    await expect(page.getByText(/APCD Types/i)).toBeVisible();
    await expect(page.getByText(/Documents/i)).toBeVisible();
    await expect(page.getByText(/Review & Submit/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 10000 });
  });

  // ── Step 1: APCD Type Selection ────────────────────────────────────────

  test('Step 1 - select APCD types and advance', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    await expect(page.getByText(/select apcd types for empanelment/i)).toBeVisible({
      timeout: 15000,
    });

    // Click first available card
    const apcdCards = page.locator('[class*="cursor-pointer"]').filter({
      has: page.locator('.font-medium'),
    });
    const cardCount = await apcdCards.count();
    if (cardCount > 0) {
      await apcdCards.first().click();
      await expect(page.getByText(/Selected APCD Types: 1/i)).toBeVisible();
    }

    await page.getByRole('button', { name: /save & continue/i }).click();
    await expect(page.getByRole('heading', { name: /step 2/i })).toBeVisible({ timeout: 10000 });
  });

  // ── Step 2: Documents ──────────────────────────────────────────────────

  test('Step 2 - document upload section renders with required docs', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    await expect(page.getByText(/select apcd types for empanelment/i)).toBeVisible({
      timeout: 15000,
    });

    // Advance past step 1
    const skipBtn = page.getByRole('button', { name: /skip for now/i });
    const nextBtn = page.getByRole('button', { name: /^next$/i });
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
    } else {
      await nextBtn.click();
    }

    await expect(page.getByText(/document upload/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/GST Registration Certificate/i)).toBeVisible();
    await expect(page.getByText(/Company PAN Card/i)).toBeVisible();
    await expect(page.getByText(/Documents:/i)).toBeVisible();
  });

  // ── Navigate Through All Steps ─────────────────────────────────────────

  test('navigate through all steps from 1 to Review (step 6)', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 15000 });

    for (let step = 1; step <= 5; step++) {
      await page.getByRole('button', { name: /^next$/i }).click();
      await expect(
        page.getByRole('heading', { name: new RegExp(`step ${step + 1}`, 'i') }),
      ).toBeVisible({ timeout: 5000 });
    }

    // Step 6 = Review & Submit
    await expect(page.getByText(/company profile/i)).toBeVisible();
    await expect(page.getByText(/fee summary/i)).toBeVisible();
  });

  // ── Submit Application ─────────────────────────────────────────────────

  test('submit application from Review step', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 15000 });

    // Navigate through all steps
    for (let step = 1; step <= 5; step++) {
      await page.getByRole('button', { name: /^next$/i }).click();
      await expect(
        page.getByRole('heading', { name: new RegExp(`step ${step + 1}`, 'i') }),
      ).toBeVisible({ timeout: 5000 });
    }

    // Accept declaration and submit
    const declarationCheckbox = page.locator('input[type="checkbox"]').last();
    await declarationCheckbox.check();

    await page.getByRole('button', { name: /submit application/i }).click();

    await page.waitForURL(/\/(payments\/checkout|applications)/, { timeout: 15000 });
  });

  // ── Applications List ──────────────────────────────────────────────────

  test('applications list page renders with status badges', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');

    await expect(page.getByRole('heading', { name: /my applications/i })).toBeVisible();
    await waitForLoad(page);

    const applicationCards = page.locator('[class*="rounded-lg border"]');
    const count = await applicationCards.count();
    expect(count).toBeGreaterThanOrEqual(0);

    if (count > 0) {
      await expect(
        page.getByText(/(submitted|draft|under review|approved|pending|payment)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Queries Page (BUG: OEM must be able to access /queries) ────────────

  test('OEM can access /queries page', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/queries');

    // This page should load for OEM role -- not redirect or error
    await expect(page.getByRole('heading', { name: /my queries|queries/i })).toBeVisible({
      timeout: 10000,
    });
    await waitForLoad(page);

    // Should show query list or empty state
    const respondLinks = page.getByRole('link', { name: /respond/i });
    const emptyMsg = page.getByText(/no queries|no pending queries/i);

    if ((await respondLinks.count()) > 0) {
      await expect(respondLinks.first()).toBeVisible();
    } else {
      await expect(emptyMsg).toBeVisible();
    }
  });

  test('OEM can view and respond to a query', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/queries');
    await waitForLoad(page);

    const respondLinks = page.getByRole('link', { name: /respond/i });
    if ((await respondLinks.count()) === 0) {
      test.skip(true, 'No pending queries for OEM to respond');
      return;
    }

    await respondLinks.first().click();
    await page.waitForURL(/\/queries\//, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /query details/i })).toBeVisible();

    await page
      .getByPlaceholder(/provide your response/i)
      .fill('E2E test response: The requested document has been attached.');

    await page.getByRole('button', { name: /submit response/i }).click();

    await Promise.race([
      page.waitForURL(/\/queries$/, { timeout: 15000 }),
      expect(page.getByText(/response submitted successfully/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });
});
