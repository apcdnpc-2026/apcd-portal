import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Field Verifier Journey - End-to-End Tests
 *
 * Covers:
 *   1. Login -> field verifier dashboard
 *   2. View assignments list (/field-verification/assignments)
 *   3. Open a field verification form
 *   4. Fill observation, scores, recommendation, checkboxes and submit report
 *   5. View completed reports (/field-verification/completed)
 */

test.describe('Field Verifier Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('field verifier dashboard loads with assignments summary', async ({ page }) => {
    await loginAs(page, 'field-verifier');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await waitForLoad(page);

    await expect(
      page.getByText(/assigned|assignments|pending verification|field verification/i),
    ).toBeVisible({ timeout: 5000 });
  });

  // ── Assignments List ───────────────────────────────────────────────────

  test('assignments page lists pending field verifications', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/assignments');

    await expect(
      page.getByRole('heading', { name: /assignments|field verification|my assignments/i }),
    ).toBeVisible();
    await waitForLoad(page);

    const assignmentCards = page.locator(
      '[class*="hover:shadow-md"], [class*="rounded-lg border"]',
    );
    const emptyMessage = page.getByText(/no assignments|no pending verifications/i);
    const cardCount = await assignmentCards.count();

    if (cardCount > 0) {
      const firstCard = assignmentCards.first();
      await expect(firstCard.locator('.font-medium').first()).toBeVisible();
      await expect(
        page
          .getByRole('link', { name: /start verification|verify|view|inspect/i })
          .first(),
      ).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  // ── Open Field Report Form ─────────────────────────────────────────────

  test('open field report form shows application summary and form fields', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/assignments');
    await waitForLoad(page);

    const verifyLinks = page.getByRole('link', {
      name: /start verification|verify|view|inspect/i,
    });
    if ((await verifyLinks.count()) === 0) {
      test.skip(true, 'No assignments available for field verification');
      return;
    }

    await verifyLinks.first().click();
    await page.waitForURL(/\/field-verification\//, { timeout: 10000 });

    await expect(
      page.getByRole('heading', {
        name: /field verification|inspection report|field report/i,
      }),
    ).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/application|company|applicant/i)).toBeVisible();
    await expect(
      page.getByText(/manufacturing facility|factory premises|site observation/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /submit report|submit verification|submit/i }),
    ).toBeVisible();
  });

  // ── Fill and Submit Report ─────────────────────────────────────────────

  test('fill field verification report and submit', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/assignments');
    await waitForLoad(page);

    const verifyLinks = page.getByRole('link', {
      name: /start verification|verify|view|inspect/i,
    });
    if ((await verifyLinks.count()) === 0) {
      test.skip(true, 'No assignments available for field verification');
      return;
    }

    await verifyLinks.first().click();
    await page.waitForURL(/\/field-verification\//, { timeout: 10000 });

    await expect(
      page.getByRole('heading', {
        name: /field verification|inspection report|field report/i,
      }),
    ).toBeVisible({ timeout: 10000 });

    // Fill observation/remarks
    const observationField = page.getByPlaceholder(/observation|remarks|findings|describe/i);
    if ((await observationField.count()) > 0) {
      await observationField.first().fill(
        'E2E Test: Manufacturing facility inspected. Infrastructure meets requirements. Production line operational with adequate safety measures.',
      );
    }

    // Fill score inputs
    const scoreInputs = page.locator('input[type="number"]');
    const scoreCount = await scoreInputs.count();
    for (let i = 0; i < scoreCount; i++) {
      await scoreInputs.nth(i).fill('8');
    }

    // Select recommendation if available
    const recommendTrigger = page
      .locator('button')
      .filter({ hasText: /select.*recommendation|select.*result|select.*status/i });
    if (await recommendTrigger.isVisible().catch(() => false)) {
      await recommendTrigger.click();
      await page.getByRole('option', { name: /satisfactory|approved|pass/i }).click();
    }

    // Check all confirmation checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      await checkboxes.nth(i).check();
    }

    // Submit
    await page
      .getByRole('button', { name: /submit report|submit verification|submit/i })
      .click();

    await Promise.race([
      page.waitForURL(/\/field-verification/, { timeout: 15000 }),
      expect(
        page.getByText(/report submitted|verification submitted|submitted successfully/i),
      ).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Completed Reports ──────────────────────────────────────────────────

  test('completed reports page shows history or empty state', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await page.goto('/field-verification/completed');
    await waitForLoad(page);

    await expect(
      page.getByRole('heading', {
        name: /completed|submitted reports|verification history/i,
      }),
    ).toBeVisible();

    const reportCards = page.locator('[class*="rounded-lg border"]');
    const emptyMessage = page.getByText(/no completed|no reports|no verifications/i);
    const reportCount = await reportCards.count();

    if (reportCount > 0) {
      await expect(
        page.getByText(/(completed|submitted|verified)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });
});
