import type { CandidateProfile, JobPosting, JobPreference } from '@applypilot/domain';

import type { PopupState, WorkerJobPlan } from '../shared/messages';

import { applyToLinkedInJob } from './auto-apply';
import { getLinkedInSession } from './session';

type DashboardBootstrap = {
  profile: CandidateProfile | null;
  preference: JobPreference | null;
  summary: {
    todaySubmitted: number;
    pendingReviewCount: number;
  };
};

type RunStartResponse = {
  run: { id: string };
  plans: WorkerJobPlan[];
};

type ApiRequest = <T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
    body?: unknown;
  },
) => Promise<T>;

type UpdateState = (patch: Partial<PopupState>) => Promise<unknown> | unknown;

const toReviewReason = (message: string) => message.trim() || 'TinyFish requested manual review.';
const trimProgressMessage = (message: string, maxLength = 180) =>
  message.length <= maxLength ? message : `${message.slice(0, maxLength - 1)}…`;
const isTinyFishAuthBarrier = (message: string) =>
  /login wall|login requirement|requires a linkedin account|requires a user account|no credentials were provided|no credentials were provided or available in the vault|execution environment is not authenticated|sign in|sign-in page|sign-up page|log in/i.test(
    message,
  );

export const runLinkedInTinyFishSingleApply = async ({
  job,
  entryUrl,
  apiRequest,
  updateState,
}: {
  job: JobPosting;
  entryUrl: string;
  apiRequest: ApiRequest;
  updateState: UpdateState;
}) => {
  await updateState({
    runStatus: 'running',
    pendingReviewCount: 0,
    recentResult: 'Checking your LinkedIn session for TinyFish...',
  });

  const session = await getLinkedInSession();
  if (!session) {
    throw new Error('LinkedIn session not found. Sign in to LinkedIn in this browser first.');
  }

  const dashboard = await apiRequest<DashboardBootstrap>('/api/dashboard/summary');
  if (!dashboard.profile) {
    throw new Error('Upload a resume and parse your profile before starting the TinyFish demo.');
  }

  await updateState({
    runStatus: 'running',
    recentResult: `Creating a run plan for ${job.title}...`,
  });

  const runPayload = await apiRequest<RunStartResponse>('/api/runs/start', {
    method: 'POST',
    body: {
      source: 'linkedin',
      targetCount: 1,
      jobs: [job],
    },
  });
  const plan = runPayload.plans[0];

  if (!plan) {
    throw new Error('The server did not return a LinkedIn run plan.');
  }

  await updateState({
    activeRunId: runPayload.run.id,
    runStatus: 'running',
    recentResult: `TinyFish is opening ${plan.job.title} at ${plan.job.company}...`,
  });

  const result = await applyToLinkedInJob(
    {
      entryUrl,
      plan,
      profile: dashboard.profile,
      session,
    },
    async (step, message) => {
      await updateState({
        runStatus: 'running',
        activeRunId: runPayload.run.id,
        recentResult: `TinyFish step ${step}: ${trimProgressMessage(message)}`,
      });
    },
  );

  if (!result.success || result.data?.needsReview) {
    const reviewReason = toReviewReason(
      result.data?.reason ?? result.error ?? 'TinyFish stopped before submitting the application.',
    );

    if (isTinyFishAuthBarrier(reviewReason)) {
      throw new Error(`TINYFISH_LOGIN_WALL:${reviewReason}`);
    }

    await apiRequest(`/api/applications/${plan.attempt.id}/review`, {
      method: 'POST',
      body: {
        reason: reviewReason,
      },
    });

    const refreshedDashboard = await apiRequest<DashboardBootstrap>('/api/dashboard/summary');
    await updateState({
      activeRunId: null,
      runStatus: 'failed',
      pendingReviewCount: refreshedDashboard.summary.pendingReviewCount,
      recentResult: reviewReason,
    });
    return;
  }

  if (!result.data?.submitted) {
    throw new Error(result.error ?? 'TinyFish did not confirm that the LinkedIn application was submitted.');
  }

  await apiRequest(`/api/applications/${plan.attempt.id}/status`, {
    method: 'PATCH',
    body: {
      status: 'submitted',
    },
  });

  const refreshedDashboard = await apiRequest<DashboardBootstrap>('/api/dashboard/summary');
  await updateState({
    activeRunId: null,
    runStatus: 'completed',
    dailySubmitted: refreshedDashboard.summary.todaySubmitted,
    pendingReviewCount: refreshedDashboard.summary.pendingReviewCount,
    recentResult:
      result.data.confirmationText?.trim() ||
      `Submitted ${plan.job.title} at ${plan.job.company} with TinyFish.`,
  });
};
