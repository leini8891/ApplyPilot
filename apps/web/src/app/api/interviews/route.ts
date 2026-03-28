import { withRouteError } from '../_lib';

import { resolveCandidateId } from '../_lib';
import { createInterview } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const body = (await request.json()) as {
      applicationId: string;
      scheduledAt: string | null;
      interviewerNames: string[];
      stage: string;
      notes: string;
      tags: string[];
    };

    return {
      interview: await createInterview({
        candidateId,
        input: body,
      }),
    };
  });
}

