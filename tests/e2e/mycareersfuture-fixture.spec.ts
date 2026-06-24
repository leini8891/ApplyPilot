import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

test('mocked MyCareersFuture fixture exposes an apply entry point', async ({ page }) => {
  const html = await fs.readFile(
    path.join(process.cwd(), 'tests/fixtures/mycareersfuture-apply.html'),
    'utf8',
  );

  await page.setContent(html);

  await expect(page.locator('h1')).toHaveText('Business Intelligence Analyst');
  await expect(page.locator('a[href*="/companies/"]')).toHaveText('Demo Healthcare Co');
  await expect(page.locator('button')).toHaveText('Apply Now');
});
