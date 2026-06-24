import { withRouteError } from '../../_lib';

import { resolveCandidateId } from '../../_lib';
import { handleResumeUpload } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withRouteError(async () => {
    const candidateId = resolveCandidateId(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const label = formData.get('label');

    if (!(file instanceof File)) {
      throw new Error('Missing resume file.');
    }

    const resume = await handleResumeUpload({
      candidateId,
      file,
      label: typeof label === 'string' ? label : undefined,
    });

    return { resume };
  });
}

