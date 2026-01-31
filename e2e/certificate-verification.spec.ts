import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Certificate Verification - End-to-End Tests
 *
 * Tests the certificate verification workflows:
 *   Public certificate verification page
 *   Certificate list for OEM
 *   Empaneled OEMs page
 */

test.describe('Certificate Verification', () => {
  test.describe.configure({ mode: 'serial' });

  test('should display public certificate verification page', async ({ page }) => {
    await page.goto('/verify-certificate');

    // Verify public page heading
    await expect(
      page.getByRole('heading', { name: /verify certificate|certificate verification/i }),
    ).toBeVisible();

    // Verify search/input field for certificate number
    await expect(
      page.getByLabel(/certificate number|certificate id/i).or(
        page.getByPlaceholder(/enter certificate|certificate number/i),
      ),
    ).toBeVisible();

    // Verify search/verify button
    await expect(
      page.getByRole('button', { name: /verify|search|check/i }),
    ).toBeVisible();
  });

  test('should show validation message for invalid certificate number', async ({ page }) => {
    await page.goto('/verify-certificate');

    // Enter an invalid certificate number
    const certInput = page
      .getByLabel(/certificate number|certificate id/i)
      .or(page.getByPlaceholder(/enter certificate|certificate number/i));
    await certInput.fill('INVALID-CERT-000');

    // Click verify button
    await page.getByRole('button', { name: /verify|search|check/i }).click();

    // Should show "not found" or error message
    await expect(
      page.getByText(/not found|invalid|no certificate|does not exist|no results/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display certificate list for logged-in OEM', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/certificates');

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify page heading
    await expect(
      page.getByRole('heading', { name: /my certificates|certificates|empanelment certificates/i }),
    ).toBeVisible();

    // Should show either certificate cards or empty state
    const certificateCards = page.locator('[class*="rounded-lg border"]');
    const emptyMessage = page.getByText(/no certificates|no empanelment certificates/i);

    const cardCount = await certificateCards.count();

    if (cardCount > 0) {
      // Verify certificate card structure
      await expect(
        page.getByText(/(certificate|empanelment|APCD)/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Verify status or validity display
      await expect(
        page.getByText(/(valid|active|expired|issued|validity)/i).first(),
      ).toBeVisible({ timeout: 5000 });

      // Verify download/view button exists
      await expect(
        page
          .getByRole('button', { name: /download|view|print/i })
          .first()
          .or(page.getByRole('link', { name: /download|view|print/i }).first()),
      ).toBeVisible();
    } else {
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should display empaneled OEMs public page', async ({ page }) => {
    await page.goto('/empaneled-oems');

    // Verify public page heading
    await expect(
      page.getByRole('heading', { name: /empaneled OEMs|empaneled manufacturers|approved OEMs/i }),
    ).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should show either OEM list or empty state
    const oemCards = page.locator('[class*="rounded-lg border"], tbody tr');
    const emptyMessage = page.getByText(/no empaneled|no OEMs|no results/i);

    const oemCount = await oemCards.count();

    if (oemCount > 0) {
      // Verify OEM card/row structure: company name, APCD types, certificate
      await expect(
        page.locator('.font-medium, td').first(),
      ).toBeVisible();

      // Verify APCD type or category information is shown
      await expect(
        page.getByText(/(APCD|category|type|manufacturer)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      await expect(emptyMessage).toBeVisible();
    }

    // Verify search/filter functionality is available
    const searchInput = page.getByPlaceholder(/search|filter/i);
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });
});
