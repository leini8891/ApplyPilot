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
});

