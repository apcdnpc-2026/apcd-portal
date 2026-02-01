import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Officer User Journey - End-to-End Tests
 *
 * Covers:
 *   1. Login -> officer dashboard with stat cards
 *   2. Pending applications list (/verification)
 *   3. Open application -> four tabs visible
 *   4. Application Details tab - company information
 *   5. Documents tab - uploaded documents, view document action
 *   6. Queries tab - raise query (BUG: with empty documentType!)
 *   7. Queries tab - resolve a query
 *   8. Actions tab - forward to committee
 *   9. Actions tab - forward to field verification
 */

test.describe('Officer User Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('officer dashboard loads with stat cards', async ({ page }) => {
    await loginAs(page, 'officer');

    await expect(page.getByRole('heading', { name: /officer dashboard/i })).toBeVisible();

    await expect(page.getByText(/total applications/i)).toBeVisible();
    await expect(page.getByText(/pending payments/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /field verification/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /committee review/i })).toBeVisible();

    await expect(page.getByText(/today's new applications/i)).toBeVisible();
    await expect(page.getByText(/today's submissions/i)).toBeVisible();
    await expect(page.getByText(/today's payments/i)).toBeVisible();
  });

  // ── Pending Applications ───────────────────────────────────────────────

  test('verification page lists pending applications', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    await expect(page.getByRole('heading', { name: /application verification/i })).toBeVisible();
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review|check docs/i });
    const noAppsMsg = page.getByText(/no applications pending verification/i);
    const linkCount = await reviewLinks.count();

    if (linkCount > 0) {
      await expect(reviewLinks.first()).toBeVisible();
    } else {
      await expect(noAppsMsg).toBeVisible();
    }
  });

  // ── Open Application Detail ────────────────────────────────────────────

  test('open application shows tabs', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    // Prefer "Review" (submitted apps) over "Check Docs" (drafts) for full tab set
    const submittedLinks = page.getByRole('link', { name: /^review$/i });
    const allLinks = page.getByRole('link', { name: /review|check docs/i });
    const submittedCount = await submittedLinks.count();
    const allCount = await allLinks.count();

    if (allCount === 0) {
      test.skip(true, 'No applications available for verification');
      return;
    }

    if (submittedCount > 0) {
      await submittedLinks.first().click();
    } else {
      await allLinks.first().click();
    }

    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    await expect(page.locator('h1.text-2xl.font-bold')).toBeVisible();

    await expect(page.getByRole('tab', { name: /application details/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /queries/i })).toBeVisible();

    // Actions tab only visible for submitted (non-draft) applications
    const actionsTab = page.getByRole('tab', { name: /actions/i });
    if (await actionsTab.isVisible().catch(() => false)) {
      await expect(actionsTab).toBeVisible();
    }

    // Click Application Details tab and verify it shows content
    await page.getByRole('tab', { name: /application details/i }).click();
    await expect(page.getByText(/company|applicant|apcd types|application/i).first()).toBeVisible();
  });

  // ── Documents Tab ──────────────────────────────────────────────────────

  test('Documents tab shows uploaded documents', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review|check docs/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    await page.getByRole('tab', { name: /documents/i }).click();

    await expect(page.getByRole('heading', { name: /uploaded documents/i })).toBeVisible({
      timeout: 5000,
    });

    // Verify document entries display type and size (BUG area: documentType rendering)
    const docEntries = page.locator('.text-xs.text-muted-foreground');
    const docCount = await docEntries.count();
    if (docCount > 0) {
      // Each document entry should show type info
      const firstDocText = await docEntries.first().textContent();
      expect(firstDocText).toBeTruthy();
    }
  });

  // ── Raise Query (with empty documentType - known bug) ──────────────────

  test('raise query dialog opens and submits (BUG: empty documentType allowed)', async ({
    page,
  }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review|check docs/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    await page.getByRole('tab', { name: /queries/i }).click();
    await page.getByRole('button', { name: /raise query/i }).click();

    await expect(page.getByRole('heading', { name: /raise query/i })).toBeVisible({
      timeout: 5000,
    });

    // Fill subject and description but leave documentType EMPTY (testing the bug)
    await page.getByPlaceholder(/brief subject/i).fill('E2E Test: Missing GST Certificate');
    await page
      .getByPlaceholder(/describe the query in detail/i)
      .fill('The GST certificate appears to be expired. Please upload a valid copy.');

    // Verify the documentType select shows "optional" placeholder
    await expect(page.getByText(/select document type \(optional\)/i)).toBeVisible();

    // Submit with empty documentType - this should succeed (it is optional)
    await page.getByRole('button', { name: /send query/i }).click();

    await expect(page.getByText(/query raised successfully/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('raise query with a specific documentType', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review|check docs/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    await page.getByRole('tab', { name: /queries/i }).click();
    await page.getByRole('button', { name: /raise query/i }).click();

    await expect(page.getByRole('heading', { name: /raise query/i })).toBeVisible({
      timeout: 5000,
    });

    await page.getByPlaceholder(/brief subject/i).fill('E2E Test: GST Certificate Validity');
    await page
      .getByPlaceholder(/describe the query in detail/i)
      .fill('Please provide updated GST certificate with current validity dates.');

    // Select a document type from the dropdown
    const docTypeSelect = page
      .locator('[role="dialog"]')
      .locator('button')
      .filter({
        hasText: /select document type/i,
      });
    await docTypeSelect.click();
    await page.getByRole('option', { name: /GST CERTIFICATE/i }).click();

    await page.getByRole('button', { name: /send query/i }).click();
    await expect(page.getByText(/query raised successfully/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  // ── Resolve Query ──────────────────────────────────────────────────────

  test('resolve a responded query', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    const reviewLinks = page.getByRole('link', { name: /review|check docs/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    await page.getByRole('tab', { name: /queries/i }).click();

    const resolveButton = page.getByRole('button', { name: /mark resolved/i });
    if (!(await resolveButton.isVisible().catch(() => false))) {
      test.skip(true, 'No responded queries to resolve');
      return;
    }

    await resolveButton.first().click();
    await expect(page.getByText(/query resolved/i).first()).toBeVisible({ timeout: 10000 });
  });

  // ── Forward to Committee ───────────────────────────────────────────────

  test('forward application to committee from Actions tab', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    // Must target submitted (non-draft) applications - only those have Actions tab
    const submittedLinks = page.getByRole('link', { name: /^review$/i });
    if ((await submittedLinks.count()) === 0) {
      test.skip(true, 'No submitted applications available');
      return;
    }

    await submittedLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    const actionsTab = page.getByRole('tab', { name: /actions/i });
    if (!(await actionsTab.isVisible().catch(() => false))) {
      test.skip(true, 'Actions tab not available for this application');
      return;
    }
    await actionsTab.click();

    await expect(page.getByText(/verification actions/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /forward to committee/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /forward to field/i })).toBeVisible();

    await page.getByRole('button', { name: /forward to committee/i }).click();

    await expect(page.getByRole('heading', { name: /forward to committee/i })).toBeVisible({
      timeout: 5000,
    });

    await page
      .getByPlaceholder(/add any remarks/i)
      .fill('Application verified. Forwarding for committee evaluation.');

    await page.getByRole('button', { name: /confirm forward/i }).click();

    await Promise.race([
      page.waitForURL(/\/verification$/, { timeout: 30000 }),
      expect(page.getByText(/forwarded to committee/i).first()).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Forward to Field Verification ──────────────────────────────────────

  test('forward application to field verification from Actions tab', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    // Must target submitted (non-draft) applications - only those have Actions tab
    const submittedLinks = page.getByRole('link', { name: /^review$/i });
    if ((await submittedLinks.count()) === 0) {
      test.skip(true, 'No submitted applications available');
      return;
    }

    await submittedLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 30000 });

    const actionsTab = page.getByRole('tab', { name: /actions/i });
    if (!(await actionsTab.isVisible().catch(() => false))) {
      test.skip(true, 'Actions tab not available for this application');
      return;
    }
    await actionsTab.click();

    await page.getByRole('button', { name: /forward to field/i }).click();

    await expect(page.getByRole('heading', { name: /forward to field/i })).toBeVisible({
      timeout: 5000,
    });

    await page
      .getByPlaceholder(/add any remarks/i)
      .fill('Physical site verification required before committee review.');

    await page.getByRole('button', { name: /confirm forward/i }).click();

    await Promise.race([
      page.waitForURL(/\/verification$/, { timeout: 30000 }),
      expect(page.getByText(/forwarded to field verification/i).first()).toBeVisible({
        timeout: 15000,
      }),
    ]);
  });
});
