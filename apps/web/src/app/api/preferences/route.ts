import { withRouteError } from '../_lib';

import { resolveCandidateId } from '../_lib';
import { savePreferences } from '@/server/services/app-service';

export async function PUT(request: Request) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const body = await request.json();
    const preference = await savePreferences({
      candidateId,
      input: body,
    });

    return { preference };
  });
}

