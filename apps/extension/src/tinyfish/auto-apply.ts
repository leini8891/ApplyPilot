import type { CandidateProfile } from '@applypilot/domain';

import type { WorkerJobPlan } from '../shared/messages';

import { runAgent } from './client';

type TinyFishApplyData = {
  submitted?: boolean;
  needsReview?: boolean;
  confirmationText?: string;
  reason?: string;
};

export const applyToLinkedInJob = async ({
  entryUrl,
  plan,
  profile,
  session,
}: {
  entryUrl: string;
  plan: WorkerJobPlan;
  profile: CandidateProfile;
  session: string;
}, onProgress?: (step: number, message: string) => void | Promise<void>) => {
  const experienceYears = Number.isFinite(profile.yearsExperience) ? profile.yearsExperience : 0;
  const resumeUrl = plan.resumeUploadUrl ?? plan.tailoredResumeUrl ?? null;

  return runAgent<TinyFishApplyData>(
    {
      url: entryUrl,
      session,
      goal: `
        Apply to exactly one LinkedIn job posting.

        Job context:
        - Start page URL: ${entryUrl}
        - Job URL: ${plan.job.url}

        Follow these steps exactly:
        1. Open the exact start page URL above first. This page is the live LinkedIn page the user is already on and may expose the correct Easy Apply button.
        2. Stay focused on the single selected job that matches the canonical Job URL above.
        3. If the start page already shows a visible "Easy Apply" / "快速申请" button for the selected job, click it there.
        4. Only if the start page cannot open the application flow, navigate to the canonical Job URL above and try again.
        5. Stay focused on this single application only. Do not open or inspect other jobs.
        6. Complete standard contact fields using:
           - Full name: ${profile.fullName || ''}
           - Email: ${profile.email || ''}
           - Phone: ${profile.phone || ''}
           - Current location: ${profile.location || ''}
           - Years of experience: ${experienceYears}
        7. If LinkedIn already has an existing resume selected, keep it.
        8. If LinkedIn asks for a resume upload and no existing resume is selected, upload this file: ${resumeUrl ?? 'NO_RESUME_UPLOAD_URL_AVAILABLE'}
        9. For common screening questions, answer conservatively:
           - Authorized to work in Singapore: Yes
           - Require visa sponsorship now or in future: No
           - Willing to relocate: ${profile.location.toLowerCase().includes('singapore') ? 'Yes' : 'No'}
           - Any numeric years-of-experience question: ${Math.max(experienceYears, 1)}
        10. Keep clicking the primary action until the flow reaches review and then submit.
        11. If you encounter a long essay question, a tricky free-form question, or anything ambiguous, stop and return needsReview=true instead of guessing.
        12. If LinkedIn forces a sign-in page or blocks access to the application form, return needsReview=true with a reason that the execution environment is not authenticated.
        13. Confirm whether the application was submitted successfully and capture the confirmation text if visible.

        Return a JSON object:
        {
          "submitted": boolean,
          "needsReview": boolean,
          "confirmationText": string,
          "reason": string
        }
      `,
      extract: {
        format: 'json',
        schema: {
          submitted: 'boolean',
          needsReview: 'boolean',
          confirmationText: 'string',
          reason: 'string',
        },
      },
    },
    onProgress,
  );
};
