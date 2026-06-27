import {
  demoCandidateProfile,
  demoJobs,
  demoPreferences,
  demoResume,
  scoreJobAgainstPreferences,
} from '@applypilot/domain';

import {
  getDashboardData,
  getApplicationWorkflow,
  getDailyPicks,
  matchResumeMaterialsForJob,
  prepareApplicationWorkflow,
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

  it('keeps drafted saved jobs visible in Daily Picks for prep review', async () => {
    await store.clearCandidateData(candidateId);
    await store.upsertProfile({
      ...demoCandidateProfile,
      id: candidateId,
    });
    await store.upsertPreferences({
      ...demoPreferences,
      candidateId,
    });
    await store.saveResume({
      ...demoResume,
      id: 'resume_app_service_daily_picks',
      candidateId,
    });

    const job = await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Senior Product Manager, Payments Platform',
        company: 'Checkout Co',
        location: 'Singapore',
        url: 'https://www.linkedin.com/jobs/view/616161/',
        description:
          'Own payment platform strategy, KYC, AML, merchant onboarding, and compliance dashboards.',
        salaryText: 'SGD 160k - 190k',
        easyApply: true,
      },
    });

    const dailyPicks = await getDailyPicks(candidateId);

    expect(dailyPicks.setupRequired).toBe(false);
    expect(dailyPicks.picks.some((pick) => pick.job.id === job.id)).toBe(true);
    expect(dailyPicks.picks[0]?.resumeMatches.length).toBeGreaterThan(0);
  });

  it('prepares a checklist workflow and advances drafted applications to queued', async () => {
    await store.clearCandidateData(candidateId);
    await store.upsertProfile({
      ...demoCandidateProfile,
      id: candidateId,
    });
    await store.upsertPreferences({
      ...demoPreferences,
      candidateId,
    });
    await store.saveResume({
      ...demoResume,
      id: 'resume_app_service_workflow',
      candidateId,
    });

    await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Senior Product Manager, Payments Platform',
        company: 'Demo Checkout Co',
        location: 'Singapore',
        url: 'https://www.linkedin.com/jobs/view/717171/',
        description:
          'Own payment platform strategy, KYC, AML, merchant onboarding, compliance dashboards, and growth experiments.',
        salaryText: 'SGD 160k - 190k',
        easyApply: true,
      },
    });

    const [attempt] = await store.listAttempts(candidateId);

    if (!attempt) {
      throw new Error('Expected synced application attempt.');
    }

    const preview = await getApplicationWorkflow({
      candidateId,
      applicationId: attempt.id,
    });

    expect(attempt.status).toBe('drafted');
    expect(preview.preparedAt).toBeNull();
    expect(preview.checklist.some((item) => item.id === 'resume-evidence')).toBe(true);
    expect(preview.resumeMatches.length).toBeGreaterThan(0);
    expect(preview.knowledgeMatches.length).toBeGreaterThan(0);

    const prepared = await prepareApplicationWorkflow({
      candidateId,
      applicationId: attempt.id,
    });
    const detail = await store.getApplicationDetail(candidateId, attempt.id);
    const workflowMetadata = detail?.attempt.metadata.applicationWorkflow;

    expect(prepared.application.status).toBe('queued');
    expect(prepared.workflow.preparedAt).toEqual(expect.any(String));
    expect(workflowMetadata).toMatchObject({
      version: 1,
      scoreOverall: prepared.workflow.score.overall,
    });
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
