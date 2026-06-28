import { withAuthenticatedRoute } from '../../_lib';
import { getDashboardData } from '@/server/services/app-service';

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const snapshot = await getDashboardData(candidateId);
    return {
      summary: snapshot.summary,
      profile: snapshot.profile,
      preference: snapshot.preference,
      currentRun: snapshot.runs[0] ?? null,
      reviews: snapshot.reviews.slice(0, 5),
    };
  });
}
