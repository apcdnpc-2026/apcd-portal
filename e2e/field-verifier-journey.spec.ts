import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Field Verifier Journey - End-to-End Tests
 *
 * Tests the field verifier workflow:
 *   Login -> View Assignments -> Submit Field Report -> View Completed Reports
 */

test.describe('Field Verifier Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('should login as field verifier and see the field verifier dashboard', async ({ page }) => {
    await loginAs(page, 'field-verifier');

    // Verify field verifier dashboard loaded
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Dashboard should render without errors
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify dashboard stat cards or summary section is visible
    await expect(
      page.getByText(/assigned|assignments|pending verification|field verification/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test('should view assignments page with pending field verifications', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/assignments');

    // Verify page heading
    await expect(
      page.getByRole('heading', { name: /assignments|field verification|my assignments/i }),
    ).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should show either assignment cards or empty state
    const assignmentCards = page.locator('[class*="hover:shadow-md"], [class*="rounded-lg border"]');
    const emptyMessage = page.getByText(/no assignments|no pending verifications/i);

    const cardCount = await assignmentCards.count();

    if (cardCount > 0) {
      // Verify assignment card structure: application number, company name, action button
      const firstCard = assignmentCards.first();
      await expect(firstCard.locator('.font-medium').first()).toBeVisible();

      // Verify "Start Verification" or "View" link is available
      await expect(
        page.getByRole('link', { name: /start verification|verify|view|inspect/i }).first(),
      ).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should open a field report submission form', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/assignments');

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const verifyLinks = page.getByRole('link', {
      name: /start verification|verify|view|inspect/i,
    });

    if ((await verifyLinks.count()) === 0) {
      test.skip(true, 'No assignments available for field verification');
      return;
    }

    // Click first verification link
    await verifyLinks.first().click();
    await page.waitForURL(/\/field-verification\//, { timeout: 10000 });

    // Verify field report form is displayed
    await expect(
      page.getByRole('heading', { name: /field verification|inspection report|field report/i }),
    ).toBeVisible({ timeout: 10000 });

    // Verify application summary section
    await expect(
      page.getByText(/application|company|applicant/i),
    ).toBeVisible();

    // Verify form fields for the report
    await expect(
      page.getByText(/manufacturing facility|factory premises|site observation/i),
    ).toBeVisible();

    // Verify submit button is present
    await expect(
      page.getByRole('button', { name: /submit report|submit verification|submit/i }),
    ).toBeVisible();
  });

  test('should fill and submit a field verification report', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/assignments');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const verifyLinks = page.getByRole('link', {
      name: /start verification|verify|view|inspect/i,
    });

    if ((await verifyLinks.count()) === 0) {
      test.skip(true, 'No assignments available for field verification');
      return;
    }

    await verifyLinks.first().click();
    await page.waitForURL(/\/field-verification\//, { timeout: 10000 });

    // Wait for the report form to load
    await expect(
      page.getByRole('heading', { name: /field verification|inspection report|field report/i }),
    ).toBeVisible({ timeout: 10000 });

    // Fill the field report form fields
    // Observation / remarks textarea
    const observationField = page.getByPlaceholder(
      /observation|remarks|findings|describe/i,
    );
    if ((await observationField.count()) > 0) {
      await observationField.first().fill(
        'E2E Test: Manufacturing facility inspected. Infrastructure meets requirements. Production line operational.',
      );
    }

    // Fill any rating/score inputs if present
    const scoreInputs = page.locator('input[type="number"]');
    const scoreCount = await scoreInputs.count();
    for (let i = 0; i < scoreCount; i++) {
      await scoreInputs.nth(i).fill('8');
    }

    // Select recommendation if present (e.g., Satisfactory/Unsatisfactory)
    const recommendTrigger = page
      .locator('button')
      .filter({ hasText: /select.*recommendation|select.*result|select.*status/i });
    if (await recommendTrigger.isVisible().catch(() => false)) {
      await recommendTrigger.click();
      await page
        .getByRole('option', { name: /satisfactory|approved|pass/i })
        .click();
    }

    // Fill any checkbox confirmations
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      await checkboxes.nth(i).check();
    }

    // Submit the report
    await page
      .getByRole('button', { name: /submit report|submit verification|submit/i })
      .click();

    // Should redirect or show success
    await Promise.race([
      page.waitForURL(/\/field-verification/, { timeout: 15000 }),
      expect(page.getByText(/report submitted|verification submitted|submitted successfully/i)).toBeVisible({
        timeout: 15000,
      }),
    ]);
  });

  test('should view completed field verification reports', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/completed');

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify page heading
    await expect(
      page.getByRole('heading', { name: /completed|submitted reports|verification history/i }),
    ).toBeVisible();

    // Should show either completed reports or empty state
    const reportCards = page.locator('[class*="rounded-lg border"]');
    const emptyMessage = page.getByText(/no completed|no reports|no verifications/i);

    const reportCount = await reportCards.count();

    if (reportCount > 0) {
      // Verify completed report card has status badge
      await expect(
        page.getByText(/(completed|submitted|verified)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });
});
