import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Committee Member Journey - End-to-End Tests
 *
 * Covers:
 *   1. Login -> committee dashboard
 *   2. View pending evaluations list (/committee/pending)
 *   3. Open evaluation form -> verify all 8 scoring criteria
 *   4. Fill scores, select recommendation, enter remarks
 *   5. Submit evaluation with passing scores
 *   6. Submit evaluation with failing scores (reject recommendation)
 *   7. Verify total score calculation
 */

test.describe('Committee Member Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('committee dashboard loads successfully', async ({ page }) => {
    await loginAs(page, 'committee');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await waitForLoad(page);
  });

  // ── Pending Evaluations ────────────────────────────────────────────────

  test('pending evaluations list shows applications or empty state', async ({ page }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');

    await expect(page.getByRole('heading', { name: /pending committee review/i })).toBeVisible();
    await waitForLoad(page);

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    const emptyMessage = page.getByText(/no applications pending review/i);

    if ((await evaluateLinks.count()) > 0) {
      const firstCard = page.locator('[class*="hover:shadow-md"]').first();
      await expect(firstCard.locator('.font-medium').first()).toBeVisible();
      await expect(firstCard.getByRole('link', { name: /evaluate/i })).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  // ── Evaluation Form ────────────────────────────────────────────────────

  test('evaluation form shows all 8 scoring criteria', async ({ page }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');
    await waitForLoad(page);

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    if ((await evaluateLinks.count()) === 0) {
      test.skip(true, 'No applications pending committee evaluation');
      return;
    }

    await evaluateLinks.first().click();
    await page.waitForURL(/\/committee\/evaluate\//, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /committee evaluation/i })).toBeVisible();
    await expect(page.getByText(/application summary/i)).toBeVisible();
    await expect(page.getByText(/evaluation scoring/i)).toBeVisible();

    // All 8 criteria must be visible
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

    await expect(page.getByText(/recommendation/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /submit evaluation/i })).toBeVisible();
  });

  // ── Submit with Passing Scores ─────────────────────────────────────────

  test('fill passing scores and submit evaluation with Approve recommendation', async ({
    page,
  }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');
    await waitForLoad(page);

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    if ((await evaluateLinks.count()) === 0) {
      test.skip(true, 'No applications pending committee evaluation');
      return;
    }

    await evaluateLinks.first().click();
    await page.waitForURL(/\/committee\/evaluate\//, { timeout: 10000 });

    await expect(page.getByText(/evaluation scoring/i)).toBeVisible({ timeout: 10000 });

    // Fill 8 criteria with passing scores (total >= 60 out of 80)
    const scoreInputs = page.locator('input[type="number"].w-20');
    const scores = [9, 8, 9, 8, 9, 8, 8, 7]; // Total: 66/80
    const scoreCount = await scoreInputs.count();

    for (let i = 0; i < Math.min(scoreCount, scores.length); i++) {
      await scoreInputs.nth(i).fill('');
      await scoreInputs.nth(i).fill(String(scores[i]));
    }

    // Verify total score is calculated
    const expectedTotal = scores.reduce((sum, s) => sum + s, 0);
    await expect(page.getByText(new RegExp(`${expectedTotal}\\s*/\\s*80`))).toBeVisible();

    // Select Approve recommendation
    const recommendTrigger = page
      .locator('button')
      .filter({ hasText: /select your recommendation/i });
    await recommendTrigger.click();
    await page.getByRole('option', { name: /approve/i }).click();

    // Fill remarks
    await page
      .getByPlaceholder(/provide overall assessment/i)
      .fill(
        'E2E Test: Company meets all technical and quality standards. Full approval recommended.',
      );

    await page.getByRole('button', { name: /submit evaluation/i }).click();

    await Promise.race([
      page.waitForURL(/\/committee/, { timeout: 15000 }),
      expect(page.getByText(/evaluation submitted successfully/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Submit with Failing Scores ─────────────────────────────────────────

  test('fill failing scores and submit evaluation with Reject recommendation', async ({
    page,
  }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');
    await waitForLoad(page);

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    if ((await evaluateLinks.count()) === 0) {
      test.skip(true, 'No applications pending committee evaluation');
      return;
    }

    await evaluateLinks.first().click();
    await page.waitForURL(/\/committee\/evaluate\//, { timeout: 10000 });

    await expect(page.getByText(/evaluation scoring/i)).toBeVisible({ timeout: 10000 });

    // Fill 8 criteria with failing scores (total < 60 out of 80)
    const scoreInputs = page.locator('input[type="number"].w-20');
    const scores = [4, 3, 5, 4, 3, 4, 3, 2]; // Total: 28/80
    const scoreCount = await scoreInputs.count();

    for (let i = 0; i < Math.min(scoreCount, scores.length); i++) {
      await scoreInputs.nth(i).fill('');
      await scoreInputs.nth(i).fill(String(scores[i]));
    }

    // Verify total score
    const expectedTotal = scores.reduce((sum, s) => sum + s, 0);
    await expect(page.getByText(new RegExp(`${expectedTotal}\\s*/\\s*80`))).toBeVisible();

    // Select Reject recommendation
    const recommendTrigger = page
      .locator('button')
      .filter({ hasText: /select your recommendation/i });
    await recommendTrigger.click();
    await page.getByRole('option', { name: /reject/i }).click();

    await page
      .getByPlaceholder(/provide overall assessment/i)
      .fill('E2E Test: Company does not meet minimum technical requirements.');

    await page.getByRole('button', { name: /submit evaluation/i }).click();

    await Promise.race([
      page.waitForURL(/\/committee/, { timeout: 15000 }),
      expect(page.getByText(/evaluation submitted successfully/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });
});
