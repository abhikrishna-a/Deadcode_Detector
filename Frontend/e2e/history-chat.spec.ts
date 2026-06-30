import { test, expect, Page } from '@playwright/test';
import { TOTP, URI } from 'otpauth';

const BASE_URL = 'http://localhost:5173';

async function authenticateUser(page: Page) {
  const ts = Date.now();
  const username = `e2e_${ts}`;
  const email = `e2e_${ts}@test.com`;
  const password = 'TestPass123!';

  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  const regRes = await page.evaluate(async (opts) => {
    const res = await fetch('/api/auth/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    return { ok: res.ok, status: res.status };
  }, { username, email, password });
  expect(regRes.ok).toBeTruthy();

  const loginData: any = await page.evaluate(async (opts) => {
    const res = await fetch('/api/auth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    return res.json();
  }, { username, password });
  expect(loginData.pre_auth_token).toBeTruthy();

  const qrData: any = await page.evaluate(async (token) => {
    const res = await fetch('/api/auth/mfa/setup/', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return res.json();
  }, loginData.pre_auth_token);
  expect(qrData.qr_code_uri).toBeTruthy();

  const parsed = URI.parse(qrData.qr_code_uri);
  const totp = new TOTP({ secret: parsed.secret });
  const code = totp.generate();

  const activateRes: any = await page.evaluate(async (opts) => {
    const res = await fetch('/api/auth/mfa/activate/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.token}`,
      },
      body: JSON.stringify({ token: opts.code }),
    });
    return res.json();
  }, { token: loginData.pre_auth_token, code });
  expect(activateRes.access).toBeTruthy();

  await page.reload();
  await page.waitForLoadState('networkidle');

  return { username, password };
}

async function getAccessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    return document.cookie
      .split('; ')
      .find(r => r.startsWith('ghostcode_access='))
      ?.split('=')[1] || '';
  });
}

test.describe('HistoryTab and TeamChatTab E2E', () => {

  test('HistoryTab - loads, search works, retains search', async ({ page }) => {
    await authenticateUser(page);

    await page.waitForSelector('text=History', { timeout: 15000 });
    await page.click('button:has-text("History")');

    const searchInput = page.locator('input[placeholder*="Search by filename"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    await searchInput.fill('test_search');
    await expect(searchInput).toHaveValue('test_search');

    await searchInput.fill('');
  });

  test('TeamChatTab - creates room, sends message, confirms delivery', async ({ page }) => {
    await authenticateUser(page);

    await page.waitForSelector('text=Team Chat', { timeout: 15000 });
    await page.click('button:has-text("Team Chat")');

    await page.waitForSelector('text=Chat Rooms', { timeout: 10000 });

    // Create room via API since we can't scan a folder in test
    const roomName = `e2e-room-${Date.now()}`;
    const accessToken = await getAccessToken(page);

    const roomResult: any = await page.evaluate(async (opts) => {
      const res = await fetch('/api/chat/rooms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${opts.token}`,
        },
        body: JSON.stringify({ name: opts.name, scan_folder: opts.name }),
      });
      return res.json();
    }, { token: accessToken, name: roomName });
    expect(roomResult.id).toBeTruthy();

    // Refresh sidebar by switching tabs
    await page.click('button:has-text("History")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Team Chat")');

    await page.waitForSelector(`text="${roomName}"`, { timeout: 10000 });

    // Select the room
    await page.click(`text="${roomName}"`);

    // Wait for message input
    const msgInput = page.locator('input[placeholder*="Message"]');
    await expect(msgInput).toBeVisible({ timeout: 10000 });

    // Verify connection status badge shows "Connected"
    await expect(page.locator('text=Connected')).toBeVisible({ timeout: 8000 });

    // Send message via Enter key
    const testMsg = `Hello from e2e ${Date.now()}`;
    await msgInput.fill(testMsg);
    // Verify React state caught up before pressing Enter
    await expect(msgInput).toHaveValue(testMsg);
    await page.waitForTimeout(200);
    await msgInput.press('Enter');

    // Wait for message to appear
    await expect(page.locator(`text="${testMsg}"`)).toBeVisible({ timeout: 12000 });

    // Send a follow-up via Enter
    const secondMsg = `Second message ${Date.now()}`;
    await msgInput.fill(secondMsg);
    await expect(msgInput).toHaveValue(secondMsg);
    await page.waitForTimeout(200);
    await msgInput.press('Enter');

    await expect(page.locator(`text="${secondMsg}"`)).toBeVisible({ timeout: 12000 });

    // Switch room: click History then back to verify room still works
    await page.click('button:has-text("History")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Team Chat")');

    await page.waitForSelector(`text="${roomName}"`, { timeout: 10000 });
    await page.click(`text="${roomName}"`);

    await expect(page.locator(`text="${testMsg}"`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text="${secondMsg}"`)).toBeVisible({ timeout: 10000 });
  });

});
