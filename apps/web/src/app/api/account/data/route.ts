import { NextResponse } from 'next/server';

import { requireRouteAuth } from '@/server/auth';
import { getDashboardData, withAppStore } from '@/server/services/app-service';
import { withAuthenticatedRoute } from '../../_lib';

export async function GET(request: Request) {
  const { auth, response } = await requireRouteAuth(request);

  if (response) {
    return response;
  }

  const snapshot = await withAppStore(auth.store, () =>
    getDashboardData(auth.candidateId),
  );

  return NextResponse.json(snapshot, {
    headers: {
      'Content-Disposition': 'attachment; filename="applypilot-export.json"',
    },
  });
}

export async function DELETE(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId, store }) => {
    await store.clearCandidateData(candidateId);
    return {
      ok: true,
    };
  });
}
