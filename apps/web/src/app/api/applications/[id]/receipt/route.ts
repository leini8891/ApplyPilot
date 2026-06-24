import { withRouteError } from '../../../_lib';

import { resolveCandidateId } from '../../../_lib';
import { attachApplicationReceipt } from '@/server/services/app-service';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const body = (await request.json()) as { dataUrl?: string };
    const { id } = await context.params;

    if (!body.dataUrl) {
      throw new Error('Missing dataUrl.');
    }

    return {
      application: await attachApplicationReceipt({
        candidateId,
        applicationId: id,
        dataUrl: body.dataUrl,
      }),
    };
  });
}

