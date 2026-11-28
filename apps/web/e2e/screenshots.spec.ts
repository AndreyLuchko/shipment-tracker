import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const outDir = path.resolve(process.cwd(), '../../docs/screenshots');
const shot = (name: string) => path.join(outDir, `${name}.png`);

// The API rate-limits auth to 5 requests a minute per IP, so sign in once per demo account (not once per shot)
// and let every shot reuse that session through `storageState`.
const stateDir = path.join(os.tmpdir(), `st-screenshots-${process.pid}`);
const dispatcherState = path.join(stateDir, 'dispatcher.json');
const clientState = path.join(stateDir, 'client.json');

test.beforeAll(async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  fs.mkdirSync(stateDir, { recursive: true });
  for (const [name, file] of [
    ['Demo dispatcher', dispatcherState],
    ['Demo client', clientState],
  ] as const) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/login');
    // The API rate-limits auth to 5 requests a minute, so two runs in quick succession can get a 429.
    await page.getByRole('button', { name }).click();
    await expect(page).toHaveURL(/\/shipments$/, { timeout: 90_000 });
    await context.storageState({ path: file });
    await context.close();
  }
});

test.afterAll(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

async function waitForRows(page: Page): Promise<void> {
  const table = page.getByRole('table', { name: 'Shipments' });
  await expect(table.getByRole('link', { name: /^ST-\d{4}-\d{6}$/ }).first()).toBeVisible();
}

async function openDetail(page: Page): Promise<void> {
  // The detail route takes the shipment id, so open it through the list (searched by tracking number).
  await page.goto('/shipments?search=ST-2026-000001');
  const table = page.getByRole('table', { name: 'Shipments' });
  await table.getByRole('link', { name: 'ST-2026-000001', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ST-2026-000001');
  // The entries fade in one after another (opacity animates even under reduced motion): wait for the last one.
  const items = page.getByRole('list', { name: 'Movement timeline' }).getByRole('listitem');
  await expect(items.first()).toBeVisible();
  await expect(items.last()).toHaveCSS('opacity', '1');
}

test.describe('light', () => {
  test.use({ colorScheme: 'light' });

  test('login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Demo dispatcher' })).toBeVisible();
    await page.screenshot({ path: shot('login') });
  });

  test.describe('dispatcher', () => {
    test.use({ storageState: dispatcherState });

    test('shipments', async ({ page }) => {
      await page.goto('/shipments');
      await waitForRows(page);
      await page.screenshot({ path: shot('shipments') });
    });

    test('shipment detail', async ({ page }) => {
      await openDetail(page);
      await page.screenshot({ path: shot('shipment-detail'), fullPage: true });
    });

    test('exceptions', async ({ page }) => {
      await page.goto('/shipments?status=EXCEPTION');
      await waitForRows(page);
      await page.screenshot({ path: shot('exceptions') });
    });

    test('new shipment', async ({ page }) => {
      await page.goto('/shipments/new');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.screenshot({ path: shot('new-shipment') });
    });
  });

  test.describe('client', () => {
    test.use({ storageState: clientState });

    test('client view', async ({ page }) => {
      await page.goto('/shipments');
      await waitForRows(page);
      await page.screenshot({ path: shot('client-view') });
    });
  });
});

test.describe('dark', () => {
  test.use({ colorScheme: 'dark', storageState: dispatcherState });

  test('shipments', async ({ page }) => {
    await page.goto('/shipments');
    await waitForRows(page);
    await page.screenshot({ path: shot('shipments-dark') });
  });

  test('shipment detail', async ({ page }) => {
    await openDetail(page);
    await page.screenshot({ path: shot('shipment-detail-dark'), fullPage: true });
  });
});
