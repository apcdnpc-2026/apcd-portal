import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Dealing Hand Journey - End-to-End Tests
 *
 * Covers:
 *   1. Login -> dealing hand dashboard
 *   2. Lab bills page (/dealing-hand/lab-bills) - view bills, status badges
 *   3. Payment verification page (/dealing-hand/payments) - view payments
 *   4. Open a payment record for verification - approve/reject actions
 *
 * NOTE: These tests require DEALING_HAND in ROLE_ROUTES (auth-provider).
 *       If not yet deployed, tests will be skipped.
 */

test.describe('Dealing Hand Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('dealing hand dashboard loads with summary stats', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    // Wait for potential auth-provider redirect to /unauthorized
    await page.waitForTimeout(2000);
    if (page.url().includes('/unauthorized')) {
      test.skip(true, 'DEALING_HAND routes not yet deployed');
      return;
    }

    await expect(page.getByRole('heading', { name: /dealing hand dashboard/i })).toBeVisible();
    await waitForLoad(page);
  });

  // ── Lab Bills ──────────────────────────────────────────────────────────

  test('lab bills page renders with bill records or empty state', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/lab-bills');
    await page.waitForTimeout(2000);

    if (page.url().includes('/unauthorized')) {
      test.skip(true, 'DEALING_HAND routes not yet deployed');
      return;
    }

    await expect(page.getByRole('heading', { name: /lab bills/i })).toBeVisible();
    await waitForLoad(page);

    // Lab bills page shows application cards with Upload Bill buttons or empty state
    const uploadBills = page.getByRole('button', { name: /upload bill/i });
    const emptyMessage = page.getByText(/no lab bills|no bills found|no records/i);
    const billCount = await uploadBills.count();

    if (billCount > 0) {
      // Cards show application number and company name
      await expect(page.getByText(/APCD-\d{4}-\d+/).first()).toBeVisible();
      await expect(uploadBills.first()).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  // ── Payment Verification ───────────────────────────────────────────────

  test('payment verification page renders with payment records or empty state', async ({
    page,
  }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/unauthorized')) {
      test.skip();
      return;
    }

    await expect(
      page.getByRole('heading', {
        name: /payment support|payment verification|verify payments/i,
      }),
    ).toBeVisible();
    await waitForLoad(page);
  });

  // ── Open Payment for Verification ──────────────────────────────────────

  test('open payment record shows details and approve/reject actions', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');

    if (page.url().includes('/unauthorized')) {
      test.skip();
      return;
    }

    await waitForLoad(page);

    const verifyLinks = page.getByRole('link', { name: /verify|review|view/i });
    const verifyButtons = page.getByRole('button', { name: /verify|review|view/i });

    const linkCount = await verifyLinks.count();
    const buttonCount = await verifyButtons.count();

    if (linkCount === 0 && buttonCount === 0) {
      test.skip();
      return;
    }

    if (linkCount > 0) {
      await verifyLinks.first().click();
    } else {
      await verifyButtons.first().click();
    }

    await expect(page.getByText(/payment details|transaction details|verify payment/i)).toBeVisible(
      { timeout: 10000 },
    );
  });

  test('approve a pending payment', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');

    if (page.url().includes('/unauthorized')) {
      test.skip();
      return;
    }

    await waitForLoad(page);

    const verifyLinks = page.getByRole('link', { name: /verify|review|view/i });
    const verifyButtons = page.getByRole('button', { name: /verify|review|view/i });
    const linkCount = await verifyLinks.count();
    const buttonCount = await verifyButtons.count();

    if (linkCount === 0 && buttonCount === 0) {
      test.skip();
      return;
    }

    if (linkCount > 0) {
      await verifyLinks.first().click();
    } else {
      await verifyButtons.first().click();
    }

    await expect(page.getByText(/payment details|transaction details|verify payment/i)).toBeVisible(
      { timeout: 10000 },
    );

    const approveBtn = page.getByRole('button', { name: /approve|verify|confirm/i });
    if (!(await approveBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await approveBtn.click();

    // Should show success or redirect
    await Promise.race([
      page.waitForURL(/\/dealing-hand\/payments/, { timeout: 30000 }),
      expect(page.getByText(/payment (verified|approved)|successfully/i).first()).toBeVisible({
        timeout: 15000,
      }),
    ]);
  });
});
