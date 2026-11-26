import { expect, test } from '@playwright/test';

test('the demo dispatcher signs in, opens a shipment and signs out', async ({ page }) => {
  await page.goto('/shipments');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: 'Demo dispatcher' }).click();
  await expect(page).toHaveURL(/\/shipments$/, { timeout: 90_000 });

  const table = page.getByRole('table', { name: 'Shipments' });
  await expect(table).toBeVisible();
  const link = table.getByRole('link', { name: /^ST-\d{4}-\d{6}$/ }).first();
  const trackingNumber = (await link.textContent())?.trim() ?? '';
  expect(trackingNumber).toMatch(/^ST-\d{4}-\d{6}$/);

  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(trackingNumber);
  await expect(page.getByRole('region', { name: 'Shipment details' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Movement timeline' }).getByRole('listitem').first()).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
});
