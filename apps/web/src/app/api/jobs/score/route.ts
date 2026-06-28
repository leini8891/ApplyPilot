import type { JobPosting } from '@applypilot/domain';

import { withAuthenticatedRoute } from '../../_lib';
import { isAiConfigured } from '@/server/services/ai';
import { scoreJobForCandidate } from '@/server/services/app-service';
import { recordUsage } from '@/server/services/usage-meter';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as Partial<JobPosting>;

    const result = await scoreJobForCandidate({
      candidateId,
      jobInput: body,
    });

    recordUsage({
      candidateId,
      eventType: 'job_score',
      provider: 'openai',
      aiCallCount: isAiConfigured() ? 1 : 0,
      metadata: {
        jobPostingId: result.job.id,
        fallbackMode: !isAiConfigured(),
      },
    });

    if (result.tailoredResume) {
      recordUsage({
        candidateId,
        eventType: 'tailored_resume_generation',
        provider: 'openai',
        aiCallCount: isAiConfigured() ? 1 : 0,
        metadata: {
          jobPostingId: result.job.id,
          resumeId: result.tailoredResume.baseResumeId,
          fallbackMode: !isAiConfigured(),
        },
      });
    }

    return result;
  });
}
