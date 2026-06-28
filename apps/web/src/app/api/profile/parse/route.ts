import { withAuthenticatedRoute } from '../../_lib';
import { isAiConfigured } from '@/server/services/ai';
import { parseProfileFromResume } from '@/server/services/app-service';
import { recordUsage } from '@/server/services/usage-meter';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as { resumeId?: string };

    if (!body.resumeId) {
      throw new Error('Missing resumeId.');
    }

    const profile = await parseProfileFromResume({
      candidateId,
      resumeId: body.resumeId,
    });

    recordUsage({
      candidateId,
      eventType: 'profile_parse',
      provider: 'openai',
      aiCallCount: isAiConfigured() ? 1 : 0,
      metadata: {
        resumeId: body.resumeId,
        fallbackMode: !isAiConfigured(),
      },
    });

    return { profile };
  });
}
