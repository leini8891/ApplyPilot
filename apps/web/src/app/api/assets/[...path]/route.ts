import { NextResponse } from 'next/server';

import { requireRouteAuth } from '@/server/auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { auth, response } = await requireRouteAuth(request);

  if (response) {
    return response;
  }

  const { path } = await context.params;
  const assetPath = path.join('/');

  if (!assetPath.includes(`/${auth.candidateId}/`)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const asset = await auth.store.getBinaryAsset(assetPath);

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
