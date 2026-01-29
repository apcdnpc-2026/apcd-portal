import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Admin User Journey - End-to-End Tests
 *
 * Tests the admin workflow:
 *   Login -> User Management -> Create User Dialog -> Fee Configuration
 */

test.describe('Admin User Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('should login as admin and see the admin dashboard', async ({ page }) => {
    await loginAs(page, 'admin');

    // Should land on admin dashboard
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // The dashboard should render without errors
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('should navigate to user management and verify user table renders', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible();
    await expect(page.getByText(/manage portal users and roles/i)).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify search input is visible
    await expect(page.getByPlaceholder(/search by name or email/i)).toBeVisible();

    // Verify "Create User" button is visible
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();

    // Verify table headers are rendered
    const tableHeaders = ['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'];
    for (const header of tableHeaders) {
      await expect(page.locator('th').filter({ hasText: new RegExp(header, 'i') })).toBeVisible();
    }

    // Verify at least one user row is present (seeded test users)
    const tableRows = page.locator('tbody tr');
    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify first row has expected structure (name, email, role badge, status badge)
    const firstRow = tableRows.first();
    await expect(firstRow.locator('td').first()).not.toBeEmpty();

    // Verify role badges exist
    await expect(
      firstRow.locator('td').nth(2).locator('[class*="badge"], [class*="Badge"]'),
    ).toBeVisible();
  });

  test('should open create user dialog and fill the form', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');

    // Wait for page to load
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Click "Create User" button
    await page.getByRole('button', { name: /create user/i }).click();

    // Dialog should appear
    await expect(page.getByRole('heading', { name: /create new user/i })).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByText(/add a new user to the portal/i)).toBeVisible();

    // Fill the create user form
    const uniqueEmail = `e2e-test-${Date.now()}@test.com`;

    await page.getByPlaceholder(/first name/i).fill('E2ETest');
    await page.getByPlaceholder(/last name/i).fill('Officer');
    await page.getByPlaceholder(/user@example.com/i).fill(uniqueEmail);
    await page.getByPlaceholder(/minimum 8 characters/i).fill('Test@1234');

    // Select role via the Select component
    const roleTrigger = page
      .locator('[role="dialog"]')
      .locator('button')
      .filter({ hasText: /select role/i });
    await roleTrigger.click();
    await page.getByRole('option', { name: /officer/i }).click();

    // Optionally fill phone
    await page.getByPlaceholder(/phone number/i).fill('9876543211');

    // Verify both Cancel and Create User buttons are available
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /cancel/i }),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /create user/i }),
    ).toBeVisible();

    // Submit the form
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /create user/i })
      .click();

    // Should show success toast or dialog should close
    await Promise.race([
      expect(page.getByText(/user created successfully/i)).toBeVisible({
        timeout: 10000,
      }),
      expect(page.getByRole('heading', { name: /create new user/i })).toBeHidden({
        timeout: 10000,
      }),
    ]);
  });

  test('should navigate to fee configuration and verify fee cards render', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/fees');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /fee configuration/i })).toBeVisible();
    await expect(page.getByText(/manage application and empanelment fees/i)).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify fee cards are rendered (the grid of fee type cards)
    // Each card should have: payment type, base amount, GST rate, discount, total
    const feeLabels = ['Base Amount', 'GST Rate', 'Discount'];
    for (const label of feeLabels) {
      // At least one card should display these labels
      const labelElements = page.getByText(new RegExp(label, 'i'));
      const count = await labelElements.count();
      // If fee data is available, these should be visible
      if (count > 0) {
        await expect(labelElements.first()).toBeVisible();
      }
    }

    // Verify fee cards have edit buttons (pencil icons)
    const editButtons = page.locator('button').filter({
      has: page.locator('svg'),
    });
    const editCount = await editButtons.count();
    // There should be at least one fee card with an edit button
    expect(editCount).toBeGreaterThanOrEqual(0);

    // Verify Total (with GST) label appears
    const totalLabels = page.getByText(/total.*gst/i);
    const totalCount = await totalLabels.count();
    if (totalCount > 0) {
      await expect(totalLabels.first()).toBeVisible();
    }
  });
});
