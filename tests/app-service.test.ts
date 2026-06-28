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
import { searchJobsFromResume } from '../apps/web/src/server/services/resume-job-search';
import { store } from '../apps/web/src/server/services/store';

describe('app service saved jobs and material search', () => {
  const candidateId = 'app-service-test-user';
  const otherCandidateId = 'app-service-test-other-user';

  afterEach(async () => {
    vi.restoreAllMocks();
    await store.clearCandidateData(candidateId);
    await store.clearCandidateData(otherCandidateId);
  });

  it('syncs manually saved jobs into the application tracker', async () => {
    await store.clearCandidateData(candidateId);

    const job = await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Product Manager, Workflows',
        company: 'Workflow Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/424242/',
        description:
          'Own workflow automation, customer trust, and onboarding conversion.',
        easyApply: false,
      },
    });

    const attempts = await store.listAttempts(candidateId);
    const [attempt] = attempts;

    expect(attempts).toHaveLength(1);
    expect(attempt?.jobPostingId).toBe(job.id);
    expect(attempt?.status).toBe('drafted');
    expect(attempt?.metadata).toMatchObject({
      company: 'Workflow Co',
      title: 'Product Manager, Workflows',
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
        title: 'Product Manager, Workflows',
        company: 'Workflow Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/515151/',
        description: 'Own workflow automation.',
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
        title: 'Product Lead, Workflows',
        company: 'Workflow Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/515151/',
        description: 'Own workflow automation and customer trust.',
      },
    });

    const attempts = await store.listAttempts(candidateId);
    const refreshedAttempt = attempts.find(
      (item) => item.jobPostingId === job.id,
    );

    expect(attempts).toHaveLength(1);
    expect(refreshedAttempt?.status).toBe('submitted');
    expect(refreshedAttempt?.metadata.title).toBe('Product Lead, Workflows');
  });

  it('keeps manually saved jobs isolated per candidate', async () => {
    await saveManualJob({
      candidateId,
      input: {
        source: 'linkedin',
        title: 'Product Manager, User A',
        company: 'User A Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/818181/',
        description: 'Own workflow automation for user A.',
      },
    });
    await saveManualJob({
      candidateId: otherCandidateId,
      input: {
        source: 'linkedin',
        title: 'Product Manager, User B',
        company: 'User B Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/919191/',
        description: 'Own workflow automation for user B.',
      },
    });

    const userAJobs = await store.listJobs(candidateId);
    const userBJobs = await store.listJobs(otherCandidateId);

    expect(userAJobs.some((job) => job.company === 'User A Co')).toBe(true);
    expect(userAJobs.some((job) => job.company === 'User B Co')).toBe(false);
    expect(userBJobs.some((job) => job.company === 'User B Co')).toBe(true);
    expect(userBJobs.some((job) => job.company === 'User A Co')).toBe(false);
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
        title: 'Product Manager, Workflow Automation',
        company: 'Workflow Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/616161/',
        description:
          'Own workflow automation strategy, analytics dashboards, customer onboarding, and growth experiments.',
        salaryText: 'USD 140k - 170k',
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
        title: 'Product Manager, Workflow Automation',
        company: 'Demo Workflow Co',
        location: 'Remote',
        url: 'https://www.linkedin.com/jobs/view/717171/',
        description:
          'Own workflow automation strategy, analytics dashboards, customer onboarding, reporting, and growth experiments.',
        salaryText: 'USD 140k - 170k',
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
    expect(
      preview.checklist.some((item) => item.id === 'resume-evidence'),
    ).toBe(true);
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

  it('searches Adzuna jobs from a resume, ranks them, and syncs tracker items', async () => {
    await store.clearCandidateData(candidateId);
    await store.upsertProfile({
      ...demoCandidateProfile,
      id: candidateId,
    });
    await store.upsertPreferences({
      ...demoPreferences,
      candidateId,
      targetRoles: ['Product Manager'],
      keywords: ['workflow automation', 'analytics'],
      regions: ['Singapore'],
      easyApplyOnly: false,
    });
    await store.saveResume({
      ...demoResume,
      id: 'resume_app_service_adzuna_search',
      candidateId,
      parsedProfileId: candidateId,
    });

    const usageSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      Response.json({
        count: 2,
        results: [
          {
            id: 'adzuna-low-fit',
            title: 'Office Coordinator',
            company: {
              display_name: 'Admin Co',
            },
            location: {
              display_name: 'Singapore',
            },
            redirect_url: 'https://www.adzuna.sg/details/low',
            description: 'Coordinate office supplies and facilities.',
            created: '2026-06-28T01:00:00Z',
          },
          {
            id: 'adzuna-high-fit',
            title: 'Product Manager, Workflow Automation',
            company: {
              display_name: 'Workflow Co',
            },
            location: {
              display_name: 'Singapore',
            },
            redirect_url: 'https://www.adzuna.sg/details/high',
            description:
              'Own workflow automation, analytics dashboards, and product growth loops.',
            created: '2026-06-28T02:00:00Z',
          },
        ],
      }),
    );

    const result = await searchJobsFromResume({
      candidateId,
      resumeId: 'resume_app_service_adzuna_search',
      limit: 1,
      aggregatorConfig: {
        appId: 'test-app',
        appKey: 'test-key',
        country: 'sg',
        baseUrl: 'https://api.adzuna.test/v1/api',
        fetchImpl: fetchMock as typeof fetch,
      },
      store,
    });

    expect(result.enabled).toBe(true);
    expect(result.savedCount).toBe(1);
    expect(result.savedJobs[0]?.job.company).toBe('Workflow Co');

    const attempts = await store.listAttempts(candidateId);
    const jobs = await store.listJobs(candidateId);
    const usageEvents = usageSpy.mock.calls
      .filter(([label]) => label === '[usage-meter]')
      .map(([, payload]) => JSON.parse(String(payload)));

    expect(attempts).toHaveLength(1);
    expect(jobs.some((job) => job.company === 'Workflow Co')).toBe(true);
    expect(jobs.some((job) => job.company === 'Admin Co')).toBe(false);
    expect(usageEvents[0]).toMatchObject({
      candidateId,
      eventType: 'resume_job_search',
      provider: 'adzuna',
      searchCount: 1,
      aiCallCount: 0,
    });
  });

  it('records a disabled search usage event when Adzuna credentials are missing', async () => {
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
      id: 'resume_app_service_adzuna_disabled',
      candidateId,
      parsedProfileId: candidateId,
    });
    const usageSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi.fn();

    const result = await searchJobsFromResume({
      candidateId,
      resumeId: 'resume_app_service_adzuna_disabled',
      aggregatorConfig: {
        appId: '',
        appKey: '',
        fetchImpl: fetchMock as typeof fetch,
      },
      store,
    });

    const attempts = await store.listAttempts(candidateId);
    const usageEvents = usageSpy.mock.calls
      .filter(([label]) => label === '[usage-meter]')
      .map(([, payload]) => JSON.parse(String(payload)));

    expect(result).toMatchObject({
      enabled: false,
      provider: 'adzuna',
      disabledReason: 'missing_api_key',
      savedCount: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(0);
    expect(usageEvents[0]).toMatchObject({
      candidateId,
      eventType: 'resume_job_search_disabled',
      provider: 'adzuna',
      searchCount: 0,
      aiCallCount: 0,
    });
  });

  it('retrieves resume material for a scored job', () => {
    const job = demoJobs[0];
    const score = scoreJobAgainstPreferences(
      demoCandidateProfile,
      demoPreferences,
      job,
    );
    const matches = matchResumeMaterialsForJob({
      profile: demoCandidateProfile,
      resumes: [demoResume],
      job,
      score,
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(
      matches.some((match) => match.reason.toLowerCase().includes('workflow')),
    ).toBe(true);
  });
});
