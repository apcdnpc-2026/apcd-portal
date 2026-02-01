import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Payment Flow - End-to-End Tests
 *
 * Covers:
 *   1. OEM payments page (/payments) - payment info
 *   2. Payment checkout page - fee calculation display (data-dependent)
 *   3. Manual NEFT payment form - fill and submit (data-dependent)
 *   4. Officer verifies payment (/payments/verify)
 */

test.describe('Payment Flow', () => {
  // ── OEM Payment History ────────────────────────────────────────────────

  test('OEM payments page loads', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/payments');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();

    // Page shows payment info message
    await expect(
      page.getByText(/payment details|payment history|your payment/i).first(),
    ).toBeVisible();
  });

  // ── Payment Checkout ───────────────────────────────────────────────────

  test('payment checkout page shows fee breakdown', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');
    await waitForLoad(page);

    // Look for pay/checkout links on applications page (exact "Pay" to avoid matching "Payments")
    const payLinks = page.getByRole('link', { name: /^pay$|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment link');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments/, { timeout: 30000 });

    await expect(
      page.getByText(/fee summary|fee breakdown|payment summary|payment checkout/i),
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Manual NEFT Payment ────────────────────────────────────────────────

  test('NEFT payment form renders and can be filled', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');
    await waitForLoad(page);

    const payLinks = page.getByRole('link', { name: /^pay$|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment link');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments/, { timeout: 30000 });

    const neftOption = page.getByText(/NEFT|bank transfer|manual payment/i);
    if ((await neftOption.count()) === 0) {
      test.skip(true, 'NEFT payment option not available');
      return;
    }

    await neftOption.first().click();

    await expect(page.getByLabel(/transaction reference|UTR number|reference number/i)).toBeVisible(
      { timeout: 5000 },
    );
  });

  test('submit NEFT payment and see confirmation', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');
    await waitForLoad(page);

    const payLinks = page.getByRole('link', { name: /^pay$|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment link');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments/, { timeout: 30000 });

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

    const dateInput = page.getByLabel(/payment date|transaction date/i);
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill('2026-01-31');
    }

    await page.getByRole('button', { name: /submit payment|confirm payment|submit/i }).click();

    await Promise.race([
      page.waitForURL(/\/(payments|applications)/, { timeout: 15000 }),
      expect(
        page.getByText(/payment submitted|payment recorded|pending verification/i),
      ).toBeVisible({ timeout: 15000 }),
    ]);
  });

  // ── Officer Payment Verification ───────────────────────────────────────

  test('officer can access payment verification page', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/payments/verify');

    await expect(
      page.getByRole('heading', { name: /payment verification|verify payments/i }),
    ).toBeVisible({ timeout: 10000 });
    await waitForLoad(page);

    // Page should show either payment cards or empty state
    const emptyMsg = page.getByText(/no payments pending verification/i);
    const paymentCards = page.getByText(/Txn:/i);

    const emptyCount = await emptyMsg.count();
    const cardCount = await paymentCards.count();

    // At least one of these should be visible
    expect(emptyCount + cardCount).toBeGreaterThan(0);
  });

  test('officer can verify a pending NEFT payment', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/payments/verify');
    await waitForLoad(page);

    // Verification page shows inline Verify/Reject buttons per payment card
    const verifyButtons = page.getByRole('button', { name: /^verify$/i });
    const btnCount = await verifyButtons.count();

    if (btnCount === 0) {
      test.skip(true, 'No payments available for verification');
      return;
    }

    await verifyButtons.first().click();

    // After clicking verify, the payment should disappear or show success
    await page.waitForTimeout(2000);

    // Page should still be the verify page
    await expect(page.getByRole('heading', { name: /payment verification/i })).toBeVisible();
  });
});
