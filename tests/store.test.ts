import fs from 'node:fs';
import path from 'node:path';

import { store } from '../apps/web/src/server/services/store';

describe('store asset persistence', () => {
  it('stores and retrieves binary assets in demo mode', async () => {
    const asset = await store.storeBinaryAsset({
      path: 'receipts/demo-user/test.png',
      contentType: 'image/png',
      bytes: Buffer.from('hello'),
    });

    expect(asset.storagePath).toBe('receipts/demo-user/test.png');

    const loaded = await store.getBinaryAsset('receipts/demo-user/test.png');
    expect(loaded?.contentType).toBe('image/png');
    expect(loaded?.bytes.toString('utf8')).toBe('hello');
  });

  it('persists the local fallback store to an ignored JSON file', async () => {
    const candidateId = `file-store-test-${process.env.VITEST_WORKER_ID ?? '0'}`;
    await store.clearCandidateData(candidateId);

    await store.upsertPreferences({
      candidateId,
      targetRoles: ['Product Manager'],
      keywords: ['workflow automation'],
      industries: ['b2b saas'],
      regions: ['remote'],
      minSalary: 120000,
      salaryCurrency: 'USD',
      applicationSalaryAmount: 10000,
      yearsExperienceOverride: 8,
      noticePeriodWeeks: 2,
      workAuthorization: 'unknown',
      requiresVisaSponsorship: 'unknown',
      willingToRelocate: 'unknown',
      dailyTarget: 5,
      vipCompanies: [],
      remotePolicy: 'remote',
      easyApplyOnly: true,
    });

    const localStorePath = path.join(
      process.cwd(),
      '.codex_tmp',
      `applypilot-store-test-${process.env.VITEST_WORKER_ID ?? '0'}.json`,
    );
    const payload = JSON.parse(fs.readFileSync(localStorePath, 'utf8')) as {
      preferences?: Array<{ candidateId: string; targetRoles: string[] }>;
    };

    expect(payload.preferences?.some((preference) => preference.candidateId === candidateId)).toBe(true);
    expect(payload.preferences?.find((preference) => preference.candidateId === candidateId)?.targetRoles).toContain(
      'Product Manager',
    );
  });
});
