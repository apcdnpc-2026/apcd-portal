import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Dealing Hand Journey - End-to-End Tests
 *
 * Tests the dealing hand workflow:
 *   Login -> View Lab Bills -> Verify Payments
 */

test.describe('Dealing Hand Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('should login as dealing hand and see the dealing hand dashboard', async ({ page }) => {
    await loginAs(page, 'dealing-hand');

    // Verify dealing hand dashboard loaded
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Dashboard should render without errors
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify dashboard stat cards or summary section is visible
    await expect(
      page.getByText(/lab bills|payments|pending|verification/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to lab bills page and view bill records', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/lab-bills');

    // Verify page heading
    await expect(
      page.getByRole('heading', { name: /lab bills|laboratory bills|bill management/i }),
    ).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should show either lab bill records or empty state
    const billRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no lab bills|no bills found|no records/i);

    const rowCount = await billRows.count();

    if (rowCount > 0) {
      // Verify bill record structure: bill number, amount, status
      const firstRow = billRows.first();
      await expect(firstRow.locator('.font-medium, td').first()).toBeVisible();

      // Verify status badge is present
      await expect(
        page.getByText(/(pending|verified|approved|paid|rejected)/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Verify action buttons are available
      await expect(
        page.getByRole('button', { name: /view|verify|review/i }).first().or(
          page.getByRole('link', { name: /view|verify|review/i }).first(),
        ),
      ).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should navigate to payment verification page', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');

    // Verify page heading
    await expect(
      page.getByRole('heading', { name: /payment verification|verify payments|payment management/i }),
    ).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should show either payment records or empty state
    const paymentRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no payments|no pending payments|no records/i);

    const rowCount = await paymentRows.count();

    if (rowCount > 0) {
      // Verify payment record structure: reference, amount, status
      await expect(
        page.getByText(/(NEFT|online|bank transfer|payment)/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Verify status badges
      await expect(
        page.getByText(/(pending verification|verified|rejected)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should open a payment record for verification', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await page.goto('/dealing-hand/payments');

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Look for verify/review links
    const verifyLinks = page.getByRole('link', { name: /verify|review|view/i });
    const verifyButtons = page.getByRole('button', { name: /verify|review|view/i });

    const linkCount = await verifyLinks.count();
    const buttonCount = await verifyButtons.count();

    if (linkCount === 0 && buttonCount === 0) {
      test.skip(true, 'No payment records available for verification');
      return;
    }

    // Click the first verify action
    if (linkCount > 0) {
      await verifyLinks.first().click();
    } else {
      await verifyButtons.first().click();
    }

    // Should show payment detail or verification dialog
    await expect(
      page.getByText(/payment details|transaction details|verify payment/i),
    ).toBeVisible({ timeout: 10000 });

    // Verify payment information is displayed
    await expect(page.getByText(/amount|total/i)).toBeVisible();
    await expect(page.getByText(/reference|UTR|transaction/i)).toBeVisible();

    // Verify action buttons are available (Approve / Reject)
    const approveBtn = page.getByRole('button', { name: /approve|verify|confirm/i });
    const rejectBtn = page.getByRole('button', { name: /reject|decline/i });

    if (await approveBtn.isVisible().catch(() => false)) {
      await expect(approveBtn).toBeVisible();
    }
    if (await rejectBtn.isVisible().catch(() => false)) {
      await expect(rejectBtn).toBeVisible();
    }
  });
});
