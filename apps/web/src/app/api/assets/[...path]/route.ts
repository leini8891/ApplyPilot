import { NextResponse } from 'next/server';

import { store } from '@/server/services/store';

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const asset = await store.getBinaryAsset(path.join('/'));

  if (!asset) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(asset.bytes, {
    headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': 'no-store',
    },
  });
}

