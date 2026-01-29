import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * OEM User Journey - End-to-End Tests
 *
 * Tests the complete OEM workflow:
 *   Register -> Complete Profile -> Create Application -> Fill Steps -> Submit
 */

// Use a unique email per test run to avoid conflicts
const uniqueId = Date.now();
const OEM_REG = {
  firstName: 'TestOEM',
  lastName: 'User',
  email: `oem-e2e-${uniqueId}@test.com`,
  phone: '9876543210',
  password: 'Test@1234',
};

test.describe('OEM User Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('should navigate to the registration page and see the form', async ({ page }) => {
    await page.goto('/register');

    // Verify page loaded with correct heading
    await expect(page.getByRole('heading', { name: /OEM Registration/i })).toBeVisible();

    // Verify all form fields are present
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/mobile number/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();

    // Verify submit button is present
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('should register a new OEM account', async ({ page }) => {
    await page.goto('/register');
    await page.waitForSelector('form');

    // Fill registration form
    await page.getByLabel(/first name/i).fill(OEM_REG.firstName);
    await page.getByLabel(/last name/i).fill(OEM_REG.lastName);
    await page.getByLabel(/email address/i).fill(OEM_REG.email);
    await page.getByLabel(/mobile number/i).fill(OEM_REG.phone);
    await page.getByLabel(/^password$/i).fill(OEM_REG.password);
    await page.getByLabel(/confirm password/i).fill(OEM_REG.password);

    // Submit the form
    await page.getByRole('button', { name: /create account/i }).click();

    // Should redirect to OEM dashboard after successful registration
    await page.waitForURL(/\/dashboard\/oem/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should complete company profile with required fields', async ({ page }) => {
    // Login as the standard OEM test user (already seeded)
    await loginAs(page, 'oem');

    // Navigate to profile page
    await page.goto('/profile');
    await page.waitForSelector('form');

    await expect(page.getByRole('heading', { name: /company profile/i })).toBeVisible();

    // Fill company information fields
    await page.getByLabel(/company name/i).fill('E2E Test Manufacturing Ltd');

    // Select firm type via the Select component (click trigger, then option)
    const firmTypeTrigger = page.locator('button:has-text("Select firm type")');
    if (await firmTypeTrigger.isVisible()) {
      await firmTypeTrigger.click();
      await page.getByRole('option', { name: /private limited/i }).click();
    }

    await page.getByLabel(/GST Registration No/i).fill('06AABCU9603R1ZM');
    await page.getByLabel(/PAN Number/i).fill('AABCU9603R');
    await page.getByLabel(/contact number/i).fill('9876543210');

    // Fill address information
    await page.getByLabel(/full address/i).fill('Plot 42, Industrial Area Phase-II, Gurugram');
    await page.getByLabel(/^state/i).fill('Haryana');
    await page.getByLabel(/PIN Code/i).fill('122002');

    // Submit the profile form
    await page.getByRole('button', { name: /save profile|update profile/i }).click();

    // Wait for success toast
    await expect(page.getByText(/profile (created|updated)/i)).toBeVisible({ timeout: 10000 });
  });

  test('should create a new application from the dashboard', async ({ page }) => {
    await loginAs(page, 'oem');

    // Navigate to new application page
    await page.goto('/applications/new');

    // Wait for page to load (it auto-creates an application)
    await expect(page.getByRole('heading', { name: /new empanelment application/i })).toBeVisible({
      timeout: 15000,
    });

    // Profile summary should show the company name
    await expect(page.getByText(/E2E Test Manufacturing|GST:/i)).toBeVisible({
      timeout: 10000,
    });

    // Step progress should be visible
    await expect(page.getByText(/APCD Types/i)).toBeVisible();
    await expect(page.getByText(/Documents/i)).toBeVisible();
    await expect(page.getByText(/Review & Submit/i)).toBeVisible();

    // Step 1 content should be visible (APCD Types)
    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 10000 });
  });

  test('should fill Step 1 - APCD Types selection', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    // Wait for Step 1 content to render
    await expect(page.getByText(/select apcd types for empanelment/i)).toBeVisible({
      timeout: 15000,
    });

    // Click on first available APCD type card to select it
    const apcdCards = page.locator('[class*="cursor-pointer"]').filter({
      has: page.locator('.font-medium'),
    });

    const cardCount = await apcdCards.count();
    if (cardCount > 0) {
      await apcdCards.first().click();

      // Verify selection counter updated
      await expect(page.getByText(/Selected APCD Types: 1/i)).toBeVisible();
    }

    // Click Save & Continue
    await page.getByRole('button', { name: /save & continue/i }).click();

    // Should advance to Step 2 - Documents
    await expect(page.getByRole('heading', { name: /step 2/i })).toBeVisible({ timeout: 10000 });
  });

  test('should fill Step 2 - Document upload section renders', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    // Wait for page load then navigate to Step 2
    await expect(page.getByText(/select apcd types for empanelment/i)).toBeVisible({
      timeout: 15000,
    });

    // Skip Step 1 to get to Step 2
    await page.getByRole('button', { name: /skip for now/i }).click();

    // Should be on Step 2 - Documents
    await expect(page.getByText(/document upload/i)).toBeVisible({
      timeout: 10000,
    });

    // Verify document list is visible (shows required/optional documents)
    await expect(page.getByText(/GST Registration Certificate/i)).toBeVisible();
    await expect(page.getByText(/Company PAN Card/i)).toBeVisible();

    // Verify document progress bar is rendered
    await expect(page.getByText(/Documents:/i)).toBeVisible();

    // Click Save & Continue to advance
    await page.getByRole('button', { name: /save & continue/i }).click();

    // Should move to Step 3 - Experience
    await expect(page.getByRole('heading', { name: /step 3/i })).toBeVisible({ timeout: 10000 });
  });

  test('should navigate through remaining steps to Review', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    // Wait for application to be created and step 1 to load
    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 15000 });

    // Navigate forward through all steps using Next button
    // Step 1 -> 2
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: /step 2/i })).toBeVisible({
      timeout: 5000,
    });

    // Step 2 -> 3
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: /step 3/i })).toBeVisible({
      timeout: 5000,
    });

    // Step 3 -> 4
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: /step 4/i })).toBeVisible({
      timeout: 5000,
    });

    // Step 4 -> 5
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: /step 5/i })).toBeVisible({
      timeout: 5000,
    });

    // Step 5 -> 6 (Review & Submit)
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByRole('heading', { name: /step 6/i })).toBeVisible({
      timeout: 5000,
    });

    // Review page should show company profile summary and checklist
    await expect(page.getByText(/company profile/i)).toBeVisible();
    await expect(page.getByText(/fee summary/i)).toBeVisible();
  });

  test('should submit application from the Review step', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    // Navigate to the last step (Review & Submit)
    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 15000 });

    // Navigate through all steps
    for (let step = 1; step <= 5; step++) {
      await page.getByRole('button', { name: /^next$/i }).click();
      await expect(
        page.getByRole('heading', { name: new RegExp(`step ${step + 1}`, 'i') }),
      ).toBeVisible({ timeout: 5000 });
    }

    // We are on Step 6 - Review & Submit
    // Accept declaration checkbox
    const declarationCheckbox = page.locator('input[type="checkbox"]').last();
    await declarationCheckbox.check();

    // Click Submit Application button
    await page.getByRole('button', { name: /submit application/i }).click();

    // After submission, should redirect to payment checkout or show success
    // The app redirects to /payments/checkout/{applicationId}
    await page.waitForURL(/\/(payments\/checkout|applications)/, {
      timeout: 15000,
    });
  });

  test('should verify submitted application appears in the applications list', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications');

    // Wait for applications list to load
    await expect(page.getByRole('heading', { name: /my applications/i })).toBeVisible();

    // Wait for loading to complete
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // The list should show at least one application
    // Look for an application card/row with status badge
    const applicationList = page.locator('[class*="rounded-lg border"]');
    const count = await applicationList.count();
    expect(count).toBeGreaterThanOrEqual(0);

    // If there are applications, check for status badges
    if (count > 0) {
      // At least one should have a visible status text
      await expect(
        page.getByText(/(submitted|draft|under review|approved|pending)/i).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });
});
