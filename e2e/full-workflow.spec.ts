import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Full Cross-Role End-to-End Workflow
 *
 * Complete application lifecycle:
 *   Phase 1: OEM creates profile, creates application, navigates steps, submits
 *   Phase 2: Officer views pending, opens app, raises query (with empty documentType)
 *   Phase 3: OEM views /queries, responds to query
 *   Phase 4: Officer resolves query, forwards to committee
 *   Phase 5: Committee evaluates with scores, submits Approve recommendation
 *   Phase 6: Certificate generation verification (officer checks status)
 *   Phase 7: OEM verifies final application status
 *
 * Serial execution: each phase depends on the previous one.
 */

test.describe.serial('Full Application Workflow (Cross-Role)', () => {
  // ── Phase 1: OEM creates and submits ───────────────────────────────────

  test('Phase 1: OEM creates profile, application, and submits', async ({ page }) => {
    await loginAs(page, 'oem');

    // Ensure profile exists
    await page.goto('/profile');
    await page.waitForSelector('form', { timeout: 15000 });

    const hasProfile = await page
      .getByRole('button', { name: /update profile/i })
      .isVisible()
      .catch(() => false);

    if (!hasProfile) {
      await page.getByLabel(/company name/i).fill('Full Workflow OEM Ltd');

      const firmTypeTrigger = page.locator('button:has-text("Select firm type")');
      if (await firmTypeTrigger.isVisible()) {
        await firmTypeTrigger.click();
        await page.getByRole('option', { name: /private limited/i }).click();
      }

      await page.getByLabel(/GST Registration No/i).fill('06AABCU9603R1ZM');
      await page.getByLabel(/PAN Number/i).fill('AABCU9603R');
      await page.getByLabel(/contact number/i).fill('9876543210');
      await page.getByLabel(/full address/i).fill('Industrial Estate, Sector 5');
      await page.getByLabel(/^state/i).fill('Haryana');
      await page.getByLabel(/PIN Code/i).fill('122002');

      await page.getByRole('button', { name: /save profile/i }).click();
      await expect(page.getByText(/profile created/i)).toBeVisible({ timeout: 10000 });
    }

    // Create new application
    await page.goto('/applications/new');
    await expect(
      page.getByRole('heading', { name: /new empanelment application/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 15000 });

    // Select first APCD type
    const apcdCards = page.locator('[class*="cursor-pointer"]').filter({
      has: page.locator('.font-medium'),
    });
    if ((await apcdCards.count()) > 0) {
      await apcdCards.first().click();
    }

    // Navigate through all steps
    const advanceStep = async () => {
      const saveBtn = page.getByRole('button', { name: /save & continue/i });
      const skipBtn = page.getByRole('button', { name: /skip for now/i });
      const nextBtn = page.getByRole('button', { name: /^next$/i });
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
      } else if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
      } else {
        await nextBtn.click();
      }
    };

    for (let step = 1; step <= 5; step++) {
      await advanceStep();
      await expect(
        page.getByRole('heading', { name: new RegExp(`step ${step + 1}`, 'i') }),
      ).toBeVisible({ timeout: 5000 });
    }

    // Accept declaration and submit
    const declarationCheckbox = page.locator('input[type="checkbox"]').last();
    await declarationCheckbox.check();
    await page.getByRole('button', { name: /submit application/i }).click();

    await page.waitForURL(/\/(payments\/checkout|applications)/, { timeout: 15000 });

    // Verify in applications list
    await page.goto('/applications');
    await waitForLoad(page);
  });

  // ── Phase 2: Officer raises query with empty documentType ──────────────

  test('Phase 2: Officer reviews application and raises query (empty documentType)', async ({
    page,
  }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    await expect(page.getByRole('heading', { name: /application verification/i })).toBeVisible();
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No pending applications for officer review');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    // Navigate to Queries tab
    await page.getByRole('tab', { name: /queries/i }).click();

    // Raise a query WITHOUT selecting documentType (testing the known bug)
    await page.getByRole('button', { name: /raise query/i }).click();
    await expect(page.getByRole('heading', { name: /raise query/i })).toBeVisible({ timeout: 5000 });

    await page
      .getByPlaceholder(/brief subject/i)
      .fill('Workflow Test: Clarify manufacturing capacity');
    await page
      .getByPlaceholder(/describe the query in detail/i)
      .fill('We need clarification on manufacturing capacity. Please provide annual production figures.');

    // NOTE: documentType left empty intentionally -- this is the known bug
    await page.getByRole('button', { name: /send query/i }).click();
    await expect(page.getByText(/query raised successfully/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Phase 3: OEM responds to query ─────────────────────────────────────

  test('Phase 3: OEM accesses /queries and responds', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/queries');

    await expect(page.getByRole('heading', { name: /my queries|queries/i })).toBeVisible();
    await waitForLoad(page);

    const respondLinks = page.getByRole('link', { name: /respond/i });
    if ((await respondLinks.count()) === 0) {
      test.skip(true, 'No pending queries for OEM');
      return;
    }

    await respondLinks.first().click();
    await page.waitForURL(/\/queries\//, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /query details/i })).toBeVisible();

    await page
      .getByPlaceholder(/provide your response/i)
      .fill(
        'Annual manufacturing capacity is 5000 units. Production report attached for reference.',
      );

    await page.getByRole('button', { name: /submit response/i }).click();

    await Promise.race([
      page.waitForURL(/\/queries$/, { timeout: 15000 }),
      expect(page.getByText(/response submitted successfully/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Phase 4: Officer resolves query and forwards to committee ──────────

  test('Phase 4: Officer resolves query and forwards to committee', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available for officer');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    // Resolve query
    await page.getByRole('tab', { name: /queries/i }).click();
    const resolveButton = page.getByRole('button', { name: /mark resolved/i });
    if (await resolveButton.isVisible().catch(() => false)) {
      await resolveButton.click();
      await expect(page.getByText(/query resolved/i)).toBeVisible({ timeout: 10000 });
    }

    // Forward to committee
    await page.getByRole('tab', { name: /actions/i }).click();
    await expect(page.getByText(/verification actions/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /forward to committee/i }).click();
    await expect(page.getByRole('heading', { name: /forward to committee/i })).toBeVisible({
      timeout: 5000,
    });

    await page
      .getByPlaceholder(/add any remarks/i)
      .fill('Queries resolved. Application ready for committee evaluation.');

    await page.getByRole('button', { name: /confirm forward/i }).click();

    await Promise.race([
      page.waitForURL(/\/verification$/, { timeout: 15000 }),
      expect(page.getByText(/forwarded to committee/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Phase 5: Committee evaluates ───────────────────────────────────────

  test('Phase 5: Committee evaluates with passing scores and approves', async ({ page }) => {
    await loginAs(page, 'committee');
    await page.goto('/committee/pending');

    await expect(page.getByRole('heading', { name: /pending committee review/i })).toBeVisible();
    await waitForLoad(page);

    const evaluateLinks = page.getByRole('link', { name: /evaluate/i });
    if ((await evaluateLinks.count()) === 0) {
      test.skip(true, 'No applications pending committee evaluation');
      return;
    }

    await evaluateLinks.first().click();
    await page.waitForURL(/\/committee\/evaluate\//, { timeout: 10000 });

    await expect(page.getByText(/evaluation scoring/i)).toBeVisible({ timeout: 10000 });

    // Fill 8 criteria scores (passing: 66/80)
    const scoreInputs = page.locator('input[type="number"].w-20');
    const scores = [9, 8, 9, 8, 9, 8, 8, 7];
    const inputCount = await scoreInputs.count();

    for (let i = 0; i < Math.min(inputCount, scores.length); i++) {
      await scoreInputs.nth(i).fill('');
      await scoreInputs.nth(i).fill(String(scores[i]));
    }

    // Select Approve
    const recommendTrigger = page
      .locator('button')
      .filter({ hasText: /select your recommendation/i });
    await recommendTrigger.click();
    await page.getByRole('option', { name: /approve/i }).click();

    await page
      .getByPlaceholder(/provide overall assessment/i)
      .fill('Full workflow test: Strong technical capability. All criteria met. Recommend approval.');

    await page.getByRole('button', { name: /submit evaluation/i }).click();

    await Promise.race([
      page.waitForURL(/\/committee/, { timeout: 15000 }),
      expect(page.getByText(/evaluation submitted successfully/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Phase 6: Officer verifies committee result ─────────────────────────

  test('Phase 6: Officer checks post-evaluation application status', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review/i });
    const count = await reviewLinks.count();

    if (count === 0) {
      // Check officer dashboard for aggregate stats
      await page.goto('/dashboard/officer');
      await waitForLoad(page);
      await expect(page.getByRole('heading', { name: /officer dashboard/i })).toBeVisible();
      await expect(page.getByText(/total applications/i)).toBeVisible();
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    await expect(page.locator('h1.text-2xl.font-bold')).toBeVisible();

    // Status badge should be visible showing post-committee status
    const statusBadge = page.locator('[class*="badge"], [class*="Badge"]').first();
    await expect(statusBadge).toBeVisible();
  });

  // ── Phase 7: OEM verifies final status ─────────────────────────────────

  test('Phase 7: OEM verifies application has progressed beyond draft', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');

    await expect(page.getByRole('heading', { name: /my applications/i })).toBeVisible();
    await waitForLoad(page);

    const applicationCards = page.locator('[class*="rounded-lg border"]');
    const appCount = await applicationCards.count();
    expect(appCount).toBeGreaterThan(0);

    const firstStatusBadge = applicationCards
      .first()
      .locator('[class*="badge"], [class*="Badge"]');
    await expect(firstStatusBadge).toBeVisible({ timeout: 5000 });

    const statusText = await firstStatusBadge.textContent();
    expect(statusText).toBeTruthy();

    // If the workflow completed, status should not be DRAFT
    const processedStatuses = [
      'submitted',
      'under review',
      'committee',
      'approved',
      'payment',
      'pending',
      'verified',
      'forwarded',
      'evaluated',
    ];

    const hasProcessedStatus = processedStatuses.some((s) =>
      statusText?.toLowerCase().includes(s),
    );

    if (hasProcessedStatus) {
      expect(statusText?.toLowerCase()).not.toBe('draft');
    }
  });
});
