import { withAuthenticatedRoute } from '../../../_lib';
import {
  answerMockInterviewTurn,
  type MockInterviewSession,
} from '@/server/services/mock-interview';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId, store }) => {
    const body = (await request.json()) as {
      session?: MockInterviewSession;
      answer?: string;
    };

    if (!body.session) {
      throw new Error('Mock interview session is required.');
    }

    return {
      session: await answerMockInterviewTurn({
        candidateId,
        session: body.session,
        answer: body.answer ?? '',
        appStore: store,
      }),
    };
  });
}
