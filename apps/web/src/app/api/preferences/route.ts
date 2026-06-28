import { withAuthenticatedRoute } from '../_lib';
import { savePreferences } from '@/server/services/app-service';

export async function PUT(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = await request.json();
    const preference = await savePreferences({
      candidateId,
      input: body,
    });

    return { preference };
  });
}
