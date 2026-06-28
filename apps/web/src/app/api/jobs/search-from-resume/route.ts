import { withAuthenticatedRoute } from '../../_lib';
import { searchJobsFromResume } from '@/server/services/resume-job-search';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId, store }) => {
    const body = (await request.json().catch(() => ({}))) as {
      resumeId?: string;
      limit?: number;
    };

    const search = await searchJobsFromResume({
      candidateId,
      resumeId: body.resumeId,
      limit: body.limit,
      store,
    });

    return { search };
  });
}
