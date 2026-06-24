import {
  demoCandidateProfile,
  demoJobs,
  demoPreferences,
  demoResume,
  scoreJobAgainstPreferences,
} from '@applypilot/domain';

import {
  getDashboardData,
  matchResumeMaterialsForJob,
  saveManualJob,
  updateApplicationStatus,
} from '../apps/web/src/server/services/app-service';
import { store } from '../apps/web/src/server/services/store';

describe('app service saved jobs and material search', () => {
  const candidateId = 'app-service-test-user';

  afterEach(async () => {
    await store.clearCandidateData(candidateId);
  });

  it('syncs manually saved jobs into the application tracker', async () => {
    await store.clearCandidateData(candidateId);

    const job = await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Product Manager, Payments',
        company: 'Checkout Co',
        location: 'Singapore',
        url: 'https://www.linkedin.com/jobs/view/424242/',
        description: 'Own payment reliability, merchant trust, and onboarding conversion.',
        easyApply: false,
      },
    });

    const attempts = await store.listAttempts(candidateId);
    const [attempt] = attempts;

    expect(attempts).toHaveLength(1);
    expect(attempt?.jobPostingId).toBe(job.id);
    expect(attempt?.status).toBe('drafted');
    expect(attempt?.metadata).toMatchObject({
      company: 'Checkout Co',
      title: 'Product Manager, Payments',
      source: 'saved_job',
    });

    const snapshot = await getDashboardData(candidateId);

    expect(snapshot.attempts).toHaveLength(1);
    expect(snapshot.runs).toHaveLength(0);
  });

  it('does not reset an existing tracker status when a saved job is refreshed', async () => {
    await store.clearCandidateData(candidateId);

    const job = await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Product Manager, Payments',
        company: 'Checkout Co',
        location: 'Singapore',
        url: 'https://www.linkedin.com/jobs/view/515151/',
        description: 'Own payment reliability.',
      },
    });
    const [attempt] = await store.listAttempts(candidateId);

    if (!attempt) {
      throw new Error('Expected synced application attempt.');
    }

    await updateApplicationStatus({
      candidateId,
      applicationId: attempt.id,
      status: 'submitted',
    });
    await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Senior Product Manager, Payments',
        company: 'Checkout Co',
        location: 'Singapore',
        url: 'https://www.linkedin.com/jobs/view/515151/',
        description: 'Own payment reliability and merchant trust.',
      },
    });

    const attempts = await store.listAttempts(candidateId);
    const refreshedAttempt = attempts.find((item) => item.jobPostingId === job.id);

    expect(attempts).toHaveLength(1);
    expect(refreshedAttempt?.status).toBe('submitted');
    expect(refreshedAttempt?.metadata.title).toBe('Senior Product Manager, Payments');
  });

  it('retrieves resume material for a scored job', () => {
    const job = demoJobs[0];
    const score = scoreJobAgainstPreferences(demoCandidateProfile, demoPreferences, job);
    const matches = matchResumeMaterialsForJob({
      profile: demoCandidateProfile,
      resumes: [demoResume],
      job,
      score,
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.reason.toLowerCase().includes('payments'))).toBe(true);
  });
});
