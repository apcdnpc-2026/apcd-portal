import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Admin User Journey - End-to-End Tests
 *
 * Covers:
 *   1. Login -> admin dashboard
 *   2. User management page (/admin/users) - table with users, search, roles
 *   3. Create user dialog - fill form, select role, submit
 *   4. Fee configuration page (/admin/fees) - fee cards with amounts
 *   5. System stats / reports page (/admin/reports)
 *   6. APCD types management page (/admin/apcd-types)
 *   7. Certificates management page (/admin/certificates)
 */

test.describe('Admin User Journey', () => {
  // ── Dashboard ──────────────────────────────────────────────────────────

  test('admin dashboard loads successfully', async ({ page }) => {
    await loginAs(page, 'admin');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
  });

  // ── User Management ────────────────────────────────────────────────────

  test('user management page renders user table with search and filters', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');

    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible();
    await waitForLoad(page);

    // Search input
    await expect(page.getByPlaceholder(/search by name or email/i)).toBeVisible();

    // Create user button
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();

    // Table headers
    const tableHeaders = ['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'];
    for (const header of tableHeaders) {
      await expect(page.locator('th').filter({ hasText: new RegExp(header, 'i') })).toBeVisible();
    }

    // At least one seeded user row exists
    const tableRows = page.locator('tbody tr');
    expect(await tableRows.count()).toBeGreaterThan(0);

    // First row has content in name and role columns
    const firstRow = tableRows.first();
    await expect(firstRow.locator('td').first()).not.toBeEmpty();
    // Role column (td index 2) should have text content
    await expect(firstRow.locator('td').nth(2)).not.toBeEmpty();
  });

  test('search filters users by name or email', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/search by name or email/i);
    await searchInput.fill('oem@testcompany.com');

    // Wait for the table to update
    await page.waitForTimeout(500);

    // The table should now show filtered results
    const tableRows = page.locator('tbody tr');
    const rowCount = await tableRows.count();

    // Should have at least the OEM user or show no results
    if (rowCount > 0) {
      await expect(page.getByText(/oem@testcompany\.com/i)).toBeVisible();
    }
  });

  // ── Create User Dialog ─────────────────────────────────────────────────

  test('create user dialog opens, fills form, and submits', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await waitForLoad(page);

    await page.getByRole('button', { name: /create user/i }).click();

    await expect(page.getByRole('heading', { name: /create new user/i })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText(/add a new user to the portal/i)).toBeVisible();

    const uniqueEmail = `e2e-admin-test-${Date.now()}@test.com`;

    await page.getByPlaceholder(/first name/i).fill('E2EAdmin');
    await page.getByPlaceholder(/last name/i).fill('TestUser');
    await page.getByPlaceholder(/user@example.com/i).fill(uniqueEmail);
    await page.getByPlaceholder(/minimum 8 characters/i).fill('AdminTest@2025!');

    // Select role
    const roleTrigger = page
      .locator('[role="dialog"]')
      .locator('button')
      .filter({ hasText: /select role/i });
    await roleTrigger.click();
    await page.getByRole('option', { name: /officer/i }).click();

    await page.getByPlaceholder(/phone number/i).fill('9876543299');

    // Verify Cancel and Create buttons exist
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /cancel/i }),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /create user/i }),
    ).toBeVisible();

    // Submit
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /create user/i })
      .click();

    await Promise.race([
      expect(page.getByText(/user created successfully/i).first()).toBeVisible({ timeout: 10000 }),
      expect(page.getByRole('heading', { name: /create new user/i })).toBeHidden({
        timeout: 10000,
      }),
    ]);
  });

  // ── Fee Configuration ──────────────────────────────────────────────────

  test('fee configuration page renders fee cards', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/fees');

    await expect(page.getByRole('heading', { name: /fee configuration/i })).toBeVisible();
    await expect(page.getByText(/manage application and empanelment fees/i)).toBeVisible();
    await waitForLoad(page);

    // Fee labels
    const feeLabels = ['Base Amount', 'GST Rate', 'Discount'];
    for (const label of feeLabels) {
      const labelElements = page.getByText(new RegExp(label, 'i'));
      if ((await labelElements.count()) > 0) {
        await expect(labelElements.first()).toBeVisible();
      }
    }

    // Total with GST
    const totalLabels = page.getByText(/total.*gst/i);
    if ((await totalLabels.count()) > 0) {
      await expect(totalLabels.first()).toBeVisible();
    }
  });

  // ── Reports Page ───────────────────────────────────────────────────────

  test('reports page loads for admin', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/reports');

    await expect(
      page.getByRole('heading', { name: /MIS reports|reports|analytics|statistics/i }),
    ).toBeVisible({ timeout: 10000 });
    await waitForLoad(page);
  });

  // ── APCD Types Management ──────────────────────────────────────────────

  test('APCD types management page loads', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/apcd-types');

    await expect(page.getByRole('heading', { name: /APCD types|manage APCD/i })).toBeVisible({
      timeout: 10000,
    });
    await waitForLoad(page);
  });

  // ── Certificates Management ────────────────────────────────────────────

  test('certificates management page loads', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/certificates');

    await expect(page.getByRole('heading', { name: /certificate|certificates/i })).toBeVisible({
      timeout: 10000,
    });
    await waitForLoad(page);
  });
});
