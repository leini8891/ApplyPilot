import { withRouteError } from '../../../_lib';

import { resolveCandidateId } from '../../../_lib';
import { getApplicationWorkflow, prepareApplicationWorkflow } from '@/server/services/app-service';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const { id } = await context.params;

    return {
      workflow: await getApplicationWorkflow({
        candidateId,
        applicationId: id,
      }),
    };
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const { id } = await context.params;

    return prepareApplicationWorkflow({
      candidateId,
      applicationId: id,
    });
  });
}
