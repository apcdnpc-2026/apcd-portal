import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Payment Flow - End-to-End Tests
 *
 * Tests the payment workflows:
 *   Payment page navigation -> Fee calculation display
 *   Manual NEFT payment form -> Payment status display
 */

test.describe('Payment Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('should navigate to payments page and see payment history', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/payments');

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify payments page heading
    await expect(
      page.getByRole('heading', { name: /payments|payment history/i }),
    ).toBeVisible();

    // Should show either payment records or empty state
    const paymentRows = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no payments found|no payment records/i);

    const rowCount = await paymentRows.count();
    if (rowCount > 0) {
      // Verify payment record structure: amount, status, date
      await expect(
        page.getByText(/(paid|pending|failed|processing)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should display fee calculation on payment checkout page', async ({ page }) => {
    await loginAs(page, 'oem');

    // Navigate to applications to find a submitted one
    await page.goto('/applications');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Look for any application with a "Pay" or "Make Payment" link
    const payLinks = page.getByRole('link', { name: /pay|make payment|checkout/i });
    const payCount = await payLinks.count();

    if (payCount === 0) {
      test.skip(true, 'No applications with pending payment');
      return;
    }

    // Click the first Pay link
    await payLinks.first().click();
    await page.waitForURL(/\/payments\/checkout/, { timeout: 10000 });

    // Verify fee calculation section is visible
    await expect(page.getByText(/fee summary|fee breakdown|payment summary/i)).toBeVisible({
      timeout: 10000,
    });

    // Verify fee line items are displayed
    await expect(page.getByText(/base fee|application fee|empanelment fee/i)).toBeVisible();
    await expect(page.getByText(/GST|tax/i)).toBeVisible();
    await expect(page.getByText(/total|amount payable/i)).toBeVisible();

    // Verify total amount is a valid currency figure (contains a number)
    const totalElement = page.getByText(/total|amount payable/i).first();
    const totalText = await totalElement.textContent();
    expect(totalText).toMatch(/\d/);
  });

  test('should display manual NEFT payment form', async ({ page }) => {
    await loginAs(page, 'oem');

    // Navigate to applications and find one with pending payment
    await page.goto('/applications');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const payLinks = page.getByRole('link', { name: /pay|make payment|checkout/i });
    if ((await payLinks.count()) === 0) {
      test.skip(true, 'No applications with pending payment');
      return;
    }

    await payLinks.first().click();
    await page.waitForURL(/\/payments\/checkout/, { timeout: 10000 });

    // Look for NEFT/manual payment option
    const neftOption = page.getByText(/NEFT|bank transfer|manual payment/i);
    if ((await neftOption.count()) === 0) {
      test.skip(true, 'NEFT payment option not available');
      return;
    }

    await neftOption.first().click();

    // Verify NEFT payment form fields are displayed
    await expect(
      page.getByLabel(/transaction reference|UTR number|reference number/i),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByLabel(/payment date|transaction date/i),
    ).toBeVisible();

    await expect(
      page.getByLabel(/bank name|remitting bank/i),
    ).toBeVisible();

    // Fill the NEFT form
    await page
      .getByLabel(/transaction reference|UTR number|reference number/i)
      .fill('NEFT202501310001');

    await page
      .getByLabel(/bank name|remitting bank/i)
      .fill('State Bank of India');

    // Verify submit button exists
    await expect(
      page.getByRole('button', { name: /submit payment|confirm payment|submit/i }),
    ).toBeVisible();
  });

  test('should display payment status for completed payments', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/payments');

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Look for a payment record with a status badge
    const statusBadges = page.locator(
      '[class*="badge"], [class*="Badge"]',
    );
    const badgeCount = await statusBadges.count();

    if (badgeCount === 0) {
      test.skip(true, 'No payment records with status badges');
      return;
    }

    // Verify the first status badge has a recognized status
    const firstBadge = statusBadges.first();
    await expect(firstBadge).toBeVisible();

    const badgeText = await firstBadge.textContent();
    const validStatuses = ['paid', 'pending', 'failed', 'processing', 'verified', 'rejected'];
    const hasValidStatus = validStatuses.some((s) => badgeText?.toLowerCase().includes(s));
    expect(hasValidStatus).toBeTruthy();

    // Click on a payment record to view details (if clickable)
    const detailLinks = page.getByRole('link', { name: /view|details/i });
    if ((await detailLinks.count()) > 0) {
      await detailLinks.first().click();

      // Should show payment detail page
      await expect(
        page.getByText(/payment details|transaction details/i),
      ).toBeVisible({ timeout: 10000 });

      // Verify payment information is displayed
      await expect(page.getByText(/amount|total/i)).toBeVisible();
      await expect(page.getByText(/status/i)).toBeVisible();
    }
  });
});
