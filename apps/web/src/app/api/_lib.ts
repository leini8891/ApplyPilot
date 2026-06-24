import { NextResponse } from 'next/server';

import { getCandidateId } from '@/server/services/app-service';

export const resolveCandidateId = (request: Request) =>
  getCandidateId(request.headers.get('x-applypilot-user') ?? undefined);

export const withRouteError = async <T>(callback: () => Promise<T>) => {
  try {
    const data = await callback();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      {
        status: 400,
      },
    );
  }
};

