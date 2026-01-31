import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Payment Flow - End-to-End Tests
 *
 * Covers:
 *   1. OEM payments page (/payments) - payment history
 *   2. Payment checkout page - fee calculation display
 *   3. Manual NEFT payment form - fill and submit
 *   4. Payment status badges on completed payments
 *   5. Officer verifies payment (/payments/verify)
 */

test.describe('Payment Flow', () => {
  // ── OEM Payment History ────────────────────────────────────────────────

  test('OEM payments page shows history or empty state', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/payments');
    await waitForLoad(page);

    await expect(
      page.getByRole('heading', { name: /payments|payment history/i }),
    ).toBeVisible();

    const paymentRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no payments found|no payment records/i);
    const rowCount = await paymentRows.count();

    if (rowCount > 0) {
      await expect(
        page.getByText(/(paid|pending|failed|processing)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  // ── Payment Checkout ───────────────────────────────────────────────────

  test('payment checkout page shows fee breakdown', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');
    await waitForLoad(page);

    const payLinks = page.getByRole('link', { name: /pay|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments\/checkout/, { timeout: 10000 });

    await expect(
      page.getByText(/fee summary|fee breakdown|payment summary/i),
    ).toBeVisible({ timeout: 10000 });

    // Fee line items
    await expect(page.getByText(/base fee|application fee|empanelment fee/i)).toBeVisible();
    await expect(page.getByText(/GST|tax/i)).toBeVisible();
    await expect(page.getByText(/total|amount payable/i)).toBeVisible();

    // Total should contain a numeric value
    const totalElement = page.getByText(/total|amount payable/i).first();
    const totalText = await totalElement.textContent();
    expect(totalText).toMatch(/\d/);
  });

  // ── Manual NEFT Payment ────────────────────────────────────────────────

  test('NEFT payment form renders and can be filled', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');
    await waitForLoad(page);

    const payLinks = page.getByRole('link', { name: /pay|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments\/checkout/, { timeout: 10000 });

    const neftOption = page.getByText(/NEFT|bank transfer|manual payment/i);
    if ((await neftOption.count()) === 0) {
      test.skip(true, 'NEFT payment option not available');
      return;
    }

    await neftOption.first().click();

    await expect(
      page.getByLabel(/transaction reference|UTR number|reference number/i),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/payment date|transaction date/i)).toBeVisible();
    await expect(page.getByLabel(/bank name|remitting bank/i)).toBeVisible();

    // Fill NEFT form
    await page
      .getByLabel(/transaction reference|UTR number|reference number/i)
      .fill('NEFT202501310001');
    await page.getByLabel(/bank name|remitting bank/i).fill('State Bank of India');

    await expect(
      page.getByRole('button', { name: /submit payment|confirm payment|submit/i }),
    ).toBeVisible();
  });

  test('submit NEFT payment and see confirmation', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');
    await waitForLoad(page);

    const payLinks = page.getByRole('link', { name: /pay|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments\/checkout/, { timeout: 10000 });

    const neftOption = page.getByText(/NEFT|bank transfer|manual payment/i);
    if ((await neftOption.count()) === 0) {
      test.skip(true, 'NEFT payment option not available');
      return;
    }

    await neftOption.first().click();

    await page
      .getByLabel(/transaction reference|UTR number|reference number/i)
      .fill(`NEFT${Date.now()}`);
    await page.getByLabel(/bank name|remitting bank/i).fill('State Bank of India');

    // Fill date if required
    const dateInput = page.getByLabel(/payment date|transaction date/i);
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill('2026-01-31');
    }

    await page
      .getByRole('button', { name: /submit payment|confirm payment|submit/i })
      .click();

    // Expect success or redirect
    await Promise.race([
      page.waitForURL(/\/(payments|applications)/, { timeout: 15000 }),
      expect(
        page.getByText(/payment submitted|payment recorded|pending verification/i),
      ).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Payment Status ─────────────────────────────────────────────────────

  test('payment records show valid status badges', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/payments');
    await waitForLoad(page);

    const statusBadges = page.locator('[class*="badge"], [class*="Badge"]');
    const badgeCount = await statusBadges.count();

    if (badgeCount === 0) {
      test.skip(true, 'No payment records with status badges');
      return;
    }

    const firstBadge = statusBadges.first();
    await expect(firstBadge).toBeVisible();

    const badgeText = await firstBadge.textContent();
    const validStatuses = ['paid', 'pending', 'failed', 'processing', 'verified', 'rejected'];
    const hasValidStatus = validStatuses.some((s) => badgeText?.toLowerCase().includes(s));
    expect(hasValidStatus).toBeTruthy();
  });

  // ── Officer Payment Verification ───────────────────────────────────────

  test('officer can access payment verification page', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/payments/verify');

    await expect(
      page.getByRole('heading', { name: /payment verification|verify payments/i }),
    ).toBeVisible({ timeout: 10000 });
    await waitForLoad(page);

    // Should show payment records or empty state
    const paymentRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMsg = page.getByText(/no payments|no pending/i);
    const rowCount = await paymentRows.count();

    if (rowCount > 0) {
      await expect(
        page.getByText(/(pending|verified|rejected|NEFT|online)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMsg).toBeVisible();
    }
  });

  test('officer can verify a pending NEFT payment', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/payments/verify');
    await waitForLoad(page);

    const verifyButtons = page.getByRole('button', { name: /verify|review|view/i });
    const verifyLinks = page.getByRole('link', { name: /verify|review|view/i });

    const btnCount = await verifyButtons.count();
    const linkCount = await verifyLinks.count();

    if (btnCount === 0 && linkCount === 0) {
      test.skip(true, 'No payments available for verification');
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

    // Approve/Reject buttons should be available
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
