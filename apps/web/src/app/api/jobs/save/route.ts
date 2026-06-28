import { withAuthenticatedRoute } from '../../_lib';
import { saveManualJob } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
    const body = (await request.json()) as {
      source?: string;
      title?: string;
      company?: string;
      location?: string;
      salaryText?: string;
      employmentType?: string;
      url?: string;
      description?: string;
      easyApply?: boolean;
    };

    return {
      job: await saveManualJob({
        candidateId,
        input: body,
      }),
    };
  });
}
