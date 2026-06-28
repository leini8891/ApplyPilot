import { withAuthenticatedRoute } from '../../../_lib';
import { markApplicationForReview } from '@/server/services/app-service';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as { reason?: string };
    const { id } = await context.params;

    return markApplicationForReview({
      candidateId,
      applicationId: id,
      reason: body.reason ?? 'Manual review requested',
    });
  });
}
