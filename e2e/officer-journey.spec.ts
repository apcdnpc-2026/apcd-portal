import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Officer User Journey - End-to-End Tests
 *
 * Tests the officer workflow:
 *   Login -> View Pending Applications -> Open Application -> View Tabs
 *   -> Raise Query -> Forward to Committee
 */

test.describe('Officer User Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('should login as officer and see the officer dashboard', async ({ page }) => {
    await loginAs(page, 'officer');

    // Verify officer dashboard loaded
    await expect(page.getByRole('heading', { name: /officer dashboard/i })).toBeVisible();

    // Verify dashboard stat cards are rendered
    await expect(page.getByText(/total applications/i)).toBeVisible();
    await expect(page.getByText(/pending payments/i)).toBeVisible();
    await expect(page.getByText(/field verification/i)).toBeVisible();
    await expect(page.getByText(/committee review/i)).toBeVisible();

    // Verify "Today's Stats" section
    await expect(page.getByText(/today's new applications/i)).toBeVisible();
    await expect(page.getByText(/today's submissions/i)).toBeVisible();
    await expect(page.getByText(/today's payments/i)).toBeVisible();
  });

  test('should view pending applications list (verification page)', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /application verification/i })).toBeVisible();

    // Wait for loading to finish
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should show either application cards or "no applications" message
    const hasApplications = await page.locator('[class*="hover:shadow-md"]').count();
    const noApplicationsMsg = page.getByText(/no applications pending verification/i);

    if (hasApplications > 0) {
      // Verify application card structure: application number, company name, Review button
      const firstCard = page.locator('[class*="hover:shadow-md"]').first();
      await expect(firstCard.locator('.font-medium').first()).toBeVisible();
      await expect(firstCard.getByRole('link', { name: /review/i })).toBeVisible();
    } else {
      await expect(noApplicationsMsg).toBeVisible();
    }
  });

  test('should open an application for verification and view details tabs', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    // Wait for the list to load
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const reviewLinks = page.getByRole('link', { name: /review/i });
    const count = await reviewLinks.count();

    if (count === 0) {
      test.skip(true, 'No applications available for verification');
      return;
    }

    // Click first "Review" link
    await reviewLinks.first().click();

    // Should navigate to verification detail page
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    // Verify application header is visible
    await expect(page.locator('h1.text-2xl.font-bold')).toBeVisible();

    // Verify all four tabs are present
    await expect(page.getByRole('tab', { name: /application details/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /queries/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /actions/i })).toBeVisible();

    // Default tab should show Company Information
    await expect(page.getByText(/company information/i)).toBeVisible();
  });

  test('should view Documents tab', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const reviewLinks = page.getByRole('link', { name: /review/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    // Click on Documents tab
    await page.getByRole('tab', { name: /documents/i }).click();

    // Should show uploaded documents section
    await expect(page.getByText(/uploaded documents/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('should raise a query on an application', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const reviewLinks = page.getByRole('link', { name: /review/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    // Navigate to Queries tab
    await page.getByRole('tab', { name: /queries/i }).click();

    // Click "Raise Query" button to open dialog
    await page.getByRole('button', { name: /raise query/i }).click();

    // Dialog should be visible
    await expect(page.getByRole('heading', { name: /raise query/i })).toBeVisible({
      timeout: 5000,
    });

    // Fill in the query form
    await page.getByPlaceholder(/brief subject/i).fill('E2E Test: Missing GST Certificate');

    await page
      .getByPlaceholder(/describe the query in detail/i)
      .fill(
        'During verification, the GST certificate appears to be expired. Please upload a valid copy.',
      );

    // Submit the query
    await page.getByRole('button', { name: /send query/i }).click();

    // Wait for success toast
    await expect(page.getByText(/query raised successfully/i)).toBeVisible({ timeout: 10000 });
  });

  test('should forward application to committee from Actions tab', async ({ page }) => {
    await loginAs(page, 'officer');
    await page.goto('/verification');

    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    const reviewLinks = page.getByRole('link', { name: /review/i });
    if ((await reviewLinks.count()) === 0) {
      test.skip(true, 'No applications available');
      return;
    }

    await reviewLinks.first().click();
    await page.waitForURL(/\/verification\//, { timeout: 10000 });

    // Navigate to Actions tab
    await page.getByRole('tab', { name: /actions/i }).click();

    // Verify Actions tab content is visible
    await expect(page.getByText(/verification actions/i)).toBeVisible({
      timeout: 5000,
    });

    // Verify the forward buttons are visible
    await expect(page.getByRole('button', { name: /forward to committee/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /forward to field/i })).toBeVisible();

    // Click "Forward to Committee"
    await page.getByRole('button', { name: /forward to committee/i }).click();

    // Dialog should open
    await expect(page.getByRole('heading', { name: /forward to committee/i })).toBeVisible({
      timeout: 5000,
    });

    // Fill remarks
    await page
      .getByPlaceholder(/add any remarks/i)
      .fill('Application verified. Forwarding for committee evaluation.');

    // Confirm forward
    await page.getByRole('button', { name: /confirm forward/i }).click();

    // Should redirect back to verification list or show success
    await Promise.race([
      page.waitForURL(/\/verification$/, { timeout: 15000 }),
      expect(page.getByText(/forwarded to committee/i)).toBeVisible({ timeout: 15000 }),
    ]);
  });
});
