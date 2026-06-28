import { withAuthenticatedRoute } from '../../_lib';
import { handleResumeUpload } from '@/server/services/app-service';

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async ({ candidateId }) => {
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
