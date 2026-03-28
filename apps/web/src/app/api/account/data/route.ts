import { NextResponse } from 'next/server';

import { resolveCandidateId } from '../../_lib';
import { getDashboardData } from '@/server/services/app-service';
import { store } from '@/server/services/store';

export async function GET(request: Request) {
  const candidateId = resolveCandidateId(request);
  const snapshot = await getDashboardData(candidateId);

  return NextResponse.json(snapshot, {
    headers: {
      'Content-Disposition': 'attachment; filename="applypilot-export.json"',
    },
  });
}

export async function DELETE(request: Request) {
  const candidateId = resolveCandidateId(request);
  await store.clearCandidateData(candidateId);
  return NextResponse.json({
    ok: true,
  });
}

