import { withAuthenticatedRoute } from '../../../_lib';
import {
  saveMockInterviewSession,
  type MockInterviewSession,
} from '@/server/services/mock-interview';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId, store }) => {
    const body = (await request.json()) as {
      session?: MockInterviewSession;
    };

    if (!body.session) {
      throw new Error('Mock interview session is required.');
    }

    return {
      interview: await saveMockInterviewSession({
        candidateId,
        session: body.session,
        appStore: store,
      }),
    };
  });
}
