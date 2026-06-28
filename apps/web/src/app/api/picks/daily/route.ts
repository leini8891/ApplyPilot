import { withAuthenticatedRoute } from '../../_lib';

import { getDailyPicks } from '@/server/services/app-service';

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => ({
    dailyPicks: await getDailyPicks(candidateId),
  }));
}
