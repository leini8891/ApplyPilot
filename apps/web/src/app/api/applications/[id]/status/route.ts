import { withAuthenticatedRoute } from '../../../_lib';
import { updateApplicationStatus } from '@/server/services/app-service';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as { status?: string };
    const { id } = await context.params;

    return {
      application: await updateApplicationStatus({
        candidateId,
        applicationId: id,
        status: body.status,
      }),
    };
  });
}
