import { withRouteError } from '../../../_lib';

import { resolveCandidateId } from '../../../_lib';
import { updateApplicationStatus } from '@/server/services/app-service';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
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

