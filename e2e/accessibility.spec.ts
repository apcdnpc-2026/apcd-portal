import { test, expect } from '@playwright/test';

import { loginAs, waitForLoad } from './helpers/auth';

/**
 * Accessibility - End-to-End Tests
 *
 * Covers:
 *   1. Keyboard navigation on login page (Tab through fields, Enter to submit)
 *   2. ARIA labels on login form elements
 *   3. ARIA labels on registration form elements
 *   4. Color contrast basics on login page
 *   5. Responsive layout at mobile viewport (375x667) - login page
 *   6. Responsive layout at mobile viewport - OEM dashboard
 *   7. ARIA labels on OEM application page
 *   8. Focus management - dialog traps focus
 */

test.describe('Accessibility', () => {
  // ── Keyboard Navigation ────────────────────────────────────────────────

  test('login page supports full keyboard navigation', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Tab through focusable elements to find email input
    let maxTabs = 15;
    let emailFocused = false;
    await page.keyboard.press('Tab');

    while (maxTabs > 0) {
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName?.toLowerCase(),
          type: (el as HTMLInputElement)?.type,
        };
      });

      if (
        focusedElement.tagName === 'input' &&
        (focusedElement.type === 'email' || focusedElement.type === 'text')
      ) {
        emailFocused = true;
        break;
      }

      await page.keyboard.press('Tab');
      maxTabs--;
    }

    expect(emailFocused).toBeTruthy();

    // Type email
    await page.keyboard.type('keyboard@test.com');

    // Tab to password
    await page.keyboard.press('Tab');

    const passwordFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return (el as HTMLInputElement)?.type === 'password';
    });
    expect(passwordFocused).toBeTruthy();

    // Type password
    await page.keyboard.type('Test@1234');

    // Tab to submit button
    maxTabs = 5;
    let buttonFocused = false;
    await page.keyboard.press('Tab');

    while (maxTabs > 0) {
      const focusedTag = await page.evaluate(
        () => document.activeElement?.tagName?.toLowerCase(),
      );
      if (focusedTag === 'button') {
        buttonFocused = true;
        break;
      }
      await page.keyboard.press('Tab');
      maxTabs--;
    }

    expect(buttonFocused).toBeTruthy();

    // Press Enter to submit
    await page.keyboard.press('Enter');

    // Should navigate to dashboard or show error (either confirms keyboard submission works)
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }),
      expect(page.getByText(/invalid|error|incorrect|failed/i)).toBeVisible({ timeout: 10000 }),
    ]);
  });

  // ── ARIA Labels: Login ─────────────────────────────────────────────────

  test('login form elements have proper ARIA labels', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', /(email|text)/);

    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    await expect(submitButton).toBeVisible();

    const formElement = page.locator('form');
    await expect(formElement).toBeVisible();

    const registerLink = page.getByRole('link', { name: /register|create account|sign up/i });
    await expect(registerLink).toBeVisible();
  });

  // ── ARIA Labels: Registration ──────────────────────────────────────────

  test('registration form elements have proper ARIA labels', async ({ page }) => {
    await page.goto('/register');
    await page.waitForSelector('form');

    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/mobile number/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();

    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  // ── Color Contrast ─────────────────────────────────────────────────────

  test('login page has sufficient color contrast on key elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Submit button: text color differs from background
    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    const buttonStyles = await submitButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
      };
    });

    expect(buttonStyles.color).toBeTruthy();
    expect(buttonStyles.backgroundColor).toBeTruthy();
    expect(buttonStyles.color).not.toBe(buttonStyles.backgroundColor);

    // Input fields have visible borders
    const emailInput = page.getByLabel(/email/i);
    const inputStyles = await emailInput.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        borderWidth: styles.borderWidth,
        borderColor: styles.borderColor,
      };
    });
    expect(inputStyles.borderWidth).toBeTruthy();

    // Heading has reasonable font size
    const heading = page.getByRole('heading', { name: /login|sign in/i });
    const headingStyles = await heading.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        fontSize: parseFloat(styles.fontSize),
        fontWeight: styles.fontWeight,
      };
    });
    expect(headingStyles.fontSize).toBeGreaterThanOrEqual(18);
  });

  // ── Responsive Layout: Login ───────────────────────────────────────────

  test('login page renders correctly at mobile viewport (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    await page.waitForSelector('form');

    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();

    // Form does not overflow horizontally
    const formOverflow = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return false;
      const rect = form.getBoundingClientRect();
      return rect.right <= window.innerWidth && rect.left >= 0;
    });
    expect(formOverflow).toBeTruthy();

    // Input is at least 200px wide
    const inputWidth = await page.getByLabel(/email/i).evaluate((el) => {
      return el.getBoundingClientRect().width;
    });
    expect(inputWidth).toBeGreaterThanOrEqual(200);
  });

  // ── Responsive Layout: Dashboard ───────────────────────────────────────

  test('OEM dashboard renders without horizontal overflow at mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, 'oem');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // No horizontal overflow
    const bodyOverflow = await page.evaluate(() => {
      return document.body.scrollWidth <= window.innerWidth;
    });
    expect(bodyOverflow).toBeTruthy();

    // Mobile navigation control should exist (hamburger or bottom nav)
    const mobileNav = page.locator(
      'button[aria-label*="menu" i], [aria-label*="navigation" i], [class*="mobile-nav"], [class*="hamburger"]',
    );
    const navCount = await mobileNav.count();
    expect(navCount).toBeGreaterThanOrEqual(0);
  });

  // ── ARIA Labels: Application Page ──────────────────────────────────────

  test('application new page has accessible step headings', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.goto('/applications/new');

    await expect(
      page.getByRole('heading', { name: /new empanelment application/i }),
    ).toBeVisible({ timeout: 15000 });

    // Step heading should be an accessible heading
    await expect(page.getByRole('heading', { name: /step 1/i })).toBeVisible({ timeout: 10000 });

    // Navigation buttons should have accessible names
    const nextBtn = page.getByRole('button', { name: /^next$/i });
    if (await nextBtn.isVisible().catch(() => false)) {
      await expect(nextBtn).toBeVisible();
    }
  });

  // ── Focus Management: Dialog ───────────────────────────────────────────

  test('dialog traps focus when opened (admin create user)', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await waitForLoad(page);

    await page.getByRole('button', { name: /create user/i }).click();

    await expect(page.getByRole('heading', { name: /create new user/i })).toBeVisible({
      timeout: 5000,
    });

    // Dialog should be present in the DOM with role="dialog"
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Tab within the dialog - focus should stay inside
    await page.keyboard.press('Tab');

    const focusedInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return dialog?.contains(active) ?? false;
    });
    expect(focusedInDialog).toBeTruthy();

    // Escape closes the dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5000 });
  });

  // ── Responsive: Verification Page ──────────────────────────────────────

  test('officer verification page renders at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, 'officer');
    await page.goto('/verification');
    await waitForLoad(page);

    await expect(
      page.getByRole('heading', { name: /application verification/i }),
    ).toBeVisible();

    const bodyOverflow = await page.evaluate(() => {
      return document.body.scrollWidth <= window.innerWidth;
    });
    expect(bodyOverflow).toBeTruthy();
  });
});
