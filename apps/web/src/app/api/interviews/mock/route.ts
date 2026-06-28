import { withAuthenticatedRoute } from '../../_lib';
import { startMockInterview } from '@/server/services/mock-interview';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId, store }) => {
    const body = (await request.json()) as {
      applicationId?: string;
      roundLimit?: number;
    };

    if (!body.applicationId) {
      throw new Error('Application is required.');
    }

    return {
      session: await startMockInterview({
        candidateId,
        applicationId: body.applicationId,
        roundLimit: body.roundLimit,
        appStore: store,
      }),
    };
  });
}
