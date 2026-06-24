import { resolveCandidateId, withRouteError } from '../../_lib';

import { getDailyPicks } from '@/server/services/app-service';

export async function GET(request: Request) {
  return withRouteError(async () => ({
    dailyPicks: await getDailyPicks(resolveCandidateId(request)),
  }));
}
