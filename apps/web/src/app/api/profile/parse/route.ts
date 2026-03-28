import { withRouteError } from '../../_lib';

import { resolveCandidateId } from '../../_lib';
import { parseProfileFromResume } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const body = (await request.json()) as { resumeId?: string };

    if (!body.resumeId) {
      throw new Error('Missing resumeId.');
    }

    const profile = await parseProfileFromResume({
      candidateId,
      resumeId: body.resumeId,
    });

    return { profile };
  });
}

