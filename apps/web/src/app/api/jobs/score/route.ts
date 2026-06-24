import type { JobPosting } from '@applypilot/domain';

import { withRouteError } from '../../_lib';

import { resolveCandidateId } from '../../_lib';
import { scoreJobForCandidate } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const body = (await request.json()) as Partial<JobPosting>;

    return scoreJobForCandidate({
      candidateId,
      jobInput: body,
    });
  });
}
