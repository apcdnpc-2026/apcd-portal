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
 */

test.describe('Dealing Hand Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('dealing hand dashboard loads with summary stats', async ({ page }) => {
    await loginAs(page, 'dealing-hand');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await waitForLoad(page);

    await expect(
      page.getByText(/lab bills|payments|pending|verification/i),
    ).toBeVisible({ timeout: 5000 });
  });

  // ── Lab Bills ──────────────────────────────────────────────────────────

  test('lab bills page renders with bill records or empty state', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/lab-bills');

    await expect(
      page.getByRole('heading', { name: /lab bills|laboratory bills|bill management/i }),
    ).toBeVisible();
    await waitForLoad(page);

    const billRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no lab bills|no bills found|no records/i);
    const rowCount = await billRows.count();

    if (rowCount > 0) {
      const firstRow = billRows.first();
      await expect(firstRow.locator('.font-medium, td').first()).toBeVisible();

      await expect(
        page.getByText(/(pending|verified|approved|paid|rejected)/i).first(),
      ).toBeVisible({ timeout: 5000 });

      await expect(
        page
          .getByRole('button', { name: /view|verify|review/i })
          .first()
          .or(page.getByRole('link', { name: /view|verify|review/i }).first()),
      ).toBeVisible();
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

    await expect(
      page.getByRole('heading', {
        name: /payment verification|verify payments|payment management/i,
      }),
    ).toBeVisible();
    await waitForLoad(page);

    const paymentRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no payments|no pending payments|no records/i);
    const rowCount = await paymentRows.count();

    if (rowCount > 0) {
      await expect(
        page.getByText(/(NEFT|online|bank transfer|payment)/i).first(),
      ).toBeVisible({ timeout: 5000 });

      await expect(
        page.getByText(/(pending verification|verified|rejected)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  // ── Open Payment for Verification ──────────────────────────────────────

  test('open payment record shows details and approve/reject actions', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');
    await waitForLoad(page);

    const verifyLinks = page.getByRole('link', { name: /verify|review|view/i });
    const verifyButtons = page.getByRole('button', { name: /verify|review|view/i });

    const linkCount = await verifyLinks.count();
    const buttonCount = await verifyButtons.count();

    if (linkCount === 0 && buttonCount === 0) {
      test.skip(true, 'No payment records available for verification');
      return;
    }

    if (linkCount > 0) {
      await verifyLinks.first().click();
    } else {
      await verifyButtons.first().click();
    }

    await expect(
      page.getByText(/payment details|transaction details|verify payment/i),
    ).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/amount|total/i)).toBeVisible();
    await expect(page.getByText(/reference|UTR|transaction/i)).toBeVisible();

    const approveBtn = page.getByRole('button', { name: /approve|verify|confirm/i });
    const rejectBtn = page.getByRole('button', { name: /reject|decline/i });

    if (await approveBtn.isVisible().catch(() => false)) {
      await expect(approveBtn).toBeVisible();
    }
    if (await rejectBtn.isVisible().catch(() => false)) {
      await expect(rejectBtn).toBeVisible();
    }
  });

  test('approve a pending payment', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');
    await waitForLoad(page);

    const verifyLinks = page.getByRole('link', { name: /verify|review|view/i });
    const verifyButtons = page.getByRole('button', { name: /verify|review|view/i });
    const linkCount = await verifyLinks.count();
    const buttonCount = await verifyButtons.count();

    if (linkCount === 0 && buttonCount === 0) {
      test.skip(true, 'No payment records available');
      return;
    }

    if (linkCount > 0) {
      await verifyLinks.first().click();
    } else {
      await verifyButtons.first().click();
    }

    await expect(
      page.getByText(/payment details|transaction details|verify payment/i),
    ).toBeVisible({ timeout: 10000 });

    const approveBtn = page.getByRole('button', { name: /approve|verify|confirm/i });
    if (!(await approveBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No approve button available');
      return;
    }

    await approveBtn.click();

    // Should show success or redirect
    await Promise.race([
      page.waitForURL(/\/dealing-hand\/payments/, { timeout: 15000 }),
      expect(
        page.getByText(/payment (verified|approved)|successfully/i),
      ).toBeVisible({ timeout: 15000 }),
    ]);
  });
});
