import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

test('mocked LinkedIn fixture exposes Easy Apply structure', async ({ page }) => {
  const html = await fs.readFile(
    path.join(process.cwd(), 'tests/fixtures/linkedin-easy-apply.html'),
    'utf8',
  );

  await page.setContent(html);

  await expect(page.locator('button.jobs-apply-button')).toHaveText('Easy Apply');
  await expect(page.locator('.jobs-description__content')).toContainText('payments roadmap');
  await expect(page.locator('li.jobs-search-results__list-item')).toHaveCount(2);
});

