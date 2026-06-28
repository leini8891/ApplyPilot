import type { JobPosting } from '@applypilot/domain';

import { withAuthenticatedRoute } from '../../_lib';
import { scoreJobForCandidate } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as Partial<JobPosting>;

    return scoreJobForCandidate({
      candidateId,
      jobInput: body,
    });
  });
}
