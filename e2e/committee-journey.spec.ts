import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Committee Member Journey - End-to-End Tests
 *
 * Tests the committee workflow:
 *   Login -> View Pending Evaluations -> Open Application -> Fill Scoring -> Submit
 */

test.describe('Committee Member Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('should login as committee member and see the committee dashboard', async ({ page }) => {
    await loginAs(page, 'committee');

    // Should land on committee dashboard
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Dashboard should render without errors
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});
  });

  test('should view pending evaluations list', async ({ page }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /pending committee review/i })).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should show either application cards or empty state
    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    const emptyMessage = page.getByText(/no applications pending review/i);

    const hasApplications = (await evaluateLinks.count()) > 0;

    if (hasApplications) {
      // Verify card structure: application number, company name, Evaluate button
      const firstCard = page.locator('[class*="hover:shadow-md"]').first();
      await expect(firstCard.locator('.font-medium').first()).toBeVisible();
      await expect(firstCard.getByRole('link', { name: /evaluate/i })).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should open an application for evaluation and see the scoring form', async ({ page }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    if ((await evaluateLinks.count()) === 0) {
      test.skip(true, 'No applications pending committee evaluation');
      return;
    }

    // Click first Evaluate link
    await evaluateLinks.first().click();
    await page.waitForURL(/\/committee\/evaluate\//, { timeout: 10000 });

    // Verify evaluation page header
    await expect(page.getByRole('heading', { name: /committee evaluation/i })).toBeVisible();

    // Verify Application Summary card
    await expect(page.getByText(/application summary/i)).toBeVisible();

    // Verify Evaluation Scoring section
    await expect(page.getByText(/evaluation scoring/i)).toBeVisible();

    // Verify all 8 scoring criteria are displayed
    const criteria = [
      'Experience & Scope of Supply',
      'Technical Specification of APCDs',
      'Technical Team & Capability',
      'Financial Standing',
      'Legal & Quality Compliance',
      'Customer Complaint Handling',
      'Client Feedback',
      'Global Supply',
    ];

    for (const criterion of criteria) {
      await expect(page.getByText(criterion)).toBeVisible();
    }

    // Verify recommendation select is visible
    await expect(page.getByText(/recommendation/i)).toBeVisible();

    // Verify Submit button is present
    await expect(page.getByRole('button', { name: /submit evaluation/i })).toBeVisible();
  });

  test('should fill the scoring form with values and submit evaluation', async ({ page }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    if ((await evaluateLinks.count()) === 0) {
      test.skip(true, 'No applications pending committee evaluation');
      return;
    }

    await evaluateLinks.first().click();
    await page.waitForURL(/\/committee\/evaluate\//, { timeout: 10000 });

    // Wait for scoring form to load
    await expect(page.getByText(/evaluation scoring/i)).toBeVisible({
      timeout: 10000,
    });

    // Fill scores for all 8 criteria (score input fields are type="number" with class w-20)
    const scoreInputs = page.locator('input[type="number"].w-20');
    const scoreCount = await scoreInputs.count();

    const scores = [8, 7, 9, 7, 8, 6, 7, 5]; // Values for 8 criteria
    for (let i = 0; i < Math.min(scoreCount, scores.length); i++) {
      await scoreInputs.nth(i).fill('');
      await scoreInputs.nth(i).fill(String(scores[i]));
    }

    // Verify total score updates (sum = 57)
    const expectedTotal = scores.reduce((sum, s) => sum + s, 0);
    await expect(page.getByText(new RegExp(`${expectedTotal}\\s*/\\s*80`))).toBeVisible();

    // Select recommendation: Approve
    const recommendationTrigger = page
      .locator('button')
      .filter({ hasText: /select your recommendation/i });
    await recommendationTrigger.click();
    await page.getByRole('option', { name: /approve/i }).click();

    // Fill overall remarks
    await page
      .getByPlaceholder(/provide overall assessment/i)
      .fill(
        'E2E Test evaluation: Company meets technical and quality standards. Recommend approval for empanelment.',
      );

    // Submit evaluation
    await page.getByRole('button', { name: /submit evaluation/i }).click();

    // Should redirect to committee page or show success
    await Promise.race([
      page.waitForURL(/\/committee/, { timeout: 15000 }),
      expect(page.getByText(/evaluation submitted successfully/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });
});
