import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Certificate Verification - End-to-End Tests
 *
 * Covers:
 *   1. Check eligibility page (/check-eligibility) - public, no login required
 *   2. Empaneled OEMs public page (/empaneled-oems)
 *   3. OEM certificates list (/certificates) - logged in
 *   4. Certificate download/view actions
 */

test.describe('Certificate Verification', () => {
  // ── Check Eligibility (Public Page) ────────────────────────────────────

  test('check eligibility page loads without login', async ({ page }) => {
    await page.goto('/check-eligibility');

    // This is a public page - should not redirect to login
    expect(page.url()).toContain('/check-eligibility');

    // Page should have heading and form elements
    await expect(page.getByRole('heading', { name: /eligibility|check eligibility/i })).toBeVisible(
      { timeout: 10000 },
    );

    // Should have form fields for eligibility check
    await expect(page.locator('form, [class*="card"]').first()).toBeVisible();
  });

  test('eligibility check wizard can be navigated', async ({ page }) => {
    await page.goto('/check-eligibility');

    await expect(page.getByRole('heading', { name: /eligibility|check eligibility/i })).toBeVisible(
      { timeout: 10000 },
    );

    // Look for Next/Continue button to advance through the wizard
    const nextBtn = page.getByRole('button', { name: /next|continue|check/i });
    if (await nextBtn.isVisible().catch(() => false)) {
      // Fill any visible required fields first
      const numberInputs = page.locator('input[type="number"]');
      const inputCount = await numberInputs.count();
      for (let i = 0; i < inputCount; i++) {
        await numberInputs.nth(i).fill('10');
      }

      // Try advancing
      await nextBtn.click();

      // Should either advance to next step or show results
      await page.waitForTimeout(500);
    }
  });

  // ── Empaneled OEMs (Public Page) ───────────────────────────────────────

  test('empaneled OEMs public page loads without login', async ({ page }) => {
    await page.goto('/empaneled-oems');

    await expect(
      page.getByRole('heading', {
        name: /empaneled OEM|empaneled manufacturers|approved OEMs/i,
      }),
    ).toBeVisible({ timeout: 10000 });
    await waitForLoad(page);

    // Page shows empaneled OEMs or a count summary
    const countText = page.getByText(/\d+ empaneled manufacturer/i);
    const oemHeadings = page.getByRole('heading', { level: 3 });
    const emptyMessage = page.getByText(/no empaneled|no OEMs|no results|0 empaneled/i);

    const headingCount = await oemHeadings.count();
    if (headingCount > 0) {
      await expect(oemHeadings.first()).toBeVisible();
    } else {
      await expect(emptyMessage.or(countText)).toBeVisible();
    }
  });

  test('empaneled OEMs page has search/filter', async ({ page }) => {
    await page.goto('/empaneled-oems');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/search|filter/i);
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();

      // Type a search term
      await searchInput.first().fill('Test');
      await page.waitForTimeout(500);
    }
  });

  // ── OEM Certificates List (Authenticated) ──────────────────────────────

  test('OEM certificates page shows certificates or empty state', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/certificates');
    await waitForLoad(page);

    await expect(
      page.getByRole('heading', {
        name: /my certificates|certificates|empanelment certificates/i,
      }),
    ).toBeVisible();

    // Check for certificate content or empty state
    const certText = page.getByText(/APCD-CERT/i);
    const emptyMessage = page.getByText(/no certificates|no empanelment certificates/i);
    const certCount = await certText.count();

    if (certCount > 0) {
      await expect(certText.first()).toBeVisible({ timeout: 5000 });

      await expect(page.getByText(/(active|expired|issued|valid until)/i).first()).toBeVisible({
        timeout: 5000,
      });

      // Download button should exist
      await expect(page.getByRole('button', { name: /download/i }).first()).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  // ── Admin Certificates Management ──────────────────────────────────────

  test('admin can access certificates management page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/certificates');

    await expect(page.getByRole('heading', { name: /certificate|certificates/i })).toBeVisible({
      timeout: 10000,
    });
    await waitForLoad(page);
  });
});
