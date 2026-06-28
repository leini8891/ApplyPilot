import { withAuthenticatedRoute } from '../../_lib';
import { parseProfileFromResume } from '@/server/services/app-service';

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

    return { profile };
  });
}
