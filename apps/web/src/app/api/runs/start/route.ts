import type { JobPosting } from '@applypilot/domain';

import { withAuthenticatedRoute } from '../../_lib';
import { startRun } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as {
      source?: 'linkedin' | 'mycareersfuture';
      targetCount?: number;
      jobs?: Array<Partial<JobPosting>>;
    };

    return startRun({
      candidateId,
      source: body.source ?? 'linkedin',
      targetCount: body.targetCount ?? 10,
      jobs: body.jobs,
    });
  });
}
