import {
  type ApplicationAttempt,
  type CandidateProfile,
  type DashboardSummary,
  type JobPosting,
  type JobPreference,
  type MatchScore,
  type ReviewPriority,
} from './schemas';

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9+#]+/i)
    .filter(Boolean);

export const normalizeMatchScore = (score: number) =>
  Math.max(0, Math.min(100, Math.round(score)));

export const buildKeywordCoverage = (jobDescription: string, keywords: string[]) => {
  const haystack = new Set(tokenize(jobDescription));

  return keywords.reduce<string[]>((matches, keyword) => {
    const tokens = tokenize(keyword);
    const matched = tokens.every((token) => haystack.has(token));

    return matched ? [...matches, keyword] : matches;
  }, []);
};

export const scoreJobAgainstPreferences = (
  profile: CandidateProfile,
  preferences: JobPreference,
  job: JobPosting,
): MatchScore => {
  const keywordHits = buildKeywordCoverage(job.description, preferences.keywords);
  const targetRoleHits = buildKeywordCoverage(job.title, profile.targetRoles);
  const industryHits = buildKeywordCoverage(job.description, preferences.industries);
  const profileSkillHits = buildKeywordCoverage(job.description, profile.skills);

  const score =
    keywordHits.length * 18 +
    targetRoleHits.length * 12 +
    industryHits.length * 10 +
    profileSkillHits.length * 6 +
    (job.easyApply ? 10 : -15) +
    (preferences.regions.some((region) =>
      job.location.toLowerCase().includes(region.toLowerCase()),
    )
      ? 12
      : 0);

  const gaps = preferences.keywords.filter((keyword) => !keywordHits.includes(keyword));
  const overall = normalizeMatchScore(score);

  return {
    id: `score_${job.id}`,
    candidateId: profile.id,
    jobPostingId: job.id,
    overall,
    keywordHits,
    gaps: gaps.slice(0, 5),
    reasons: [
      `${keywordHits.length} keyword matches`,
      `${profileSkillHits.length} resume skill matches`,
      job.easyApply ? 'Easy Apply supported' : 'Needs manual review for submission',
    ],
    recommendedAction: overall >= 60 ? 'apply' : overall >= 40 ? 'review' : 'skip',
    generatedAt: new Date().toISOString(),
  };
};

export const needsReviewRouting = ({
  job,
  preferences,
  knockoutConfidence,
  riskSignals,
}: {
  job: JobPosting;
  preferences: JobPreference;
  knockoutConfidence: number;
  riskSignals?: string[];
}) => {
  const reasons: string[] = [];

  if (!job.easyApply && preferences.easyApplyOnly) {
    reasons.push('Non-Easy Apply role');
  }

  if (preferences.vipCompanies.some((company) => company.toLowerCase() === job.company.toLowerCase())) {
    reasons.push('VIP company');
  }

  if (job.detectedQuestions.length > 3 || knockoutConfidence < 0.75) {
    reasons.push('Needs human review for knockout questions');
  }

  if (riskSignals?.length) {
    reasons.push(...riskSignals);
  }

  return reasons;
};

export const chooseReviewPriority = (reasons: string[]): ReviewPriority => {
  if (reasons.some((reason) => reason.toLowerCase().includes('vip'))) {
    return 'high';
  }

  if (reasons.some((reason) => reason.toLowerCase().includes('risk'))) {
    return 'high';
  }

  if (reasons.length >= 2) {
    return 'medium';
  }

  return 'low';
};

export const isWithinDailyQuota = ({
  attempts,
  target,
}: {
  attempts: ApplicationAttempt[];
  target: number;
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const todaySubmitted = attempts.filter((attempt) => attempt.submittedAt?.startsWith(today)).length;

  return todaySubmitted < target;
};

export const buildDashboardSummary = ({
  attempts,
  dailyTarget,
  runStatus,
}: {
  attempts: ApplicationAttempt[];
  dailyTarget: number;
  runStatus: DashboardSummary['runningStatus'];
}): DashboardSummary => {
  const today = new Date().toISOString().slice(0, 10);
  const todayAttempts = attempts.filter((attempt) => attempt.updatedAt.startsWith(today));
  const todaySubmitted = todayAttempts.filter((attempt) => attempt.status === 'submitted').length;
  const failures = todayAttempts.filter((attempt) => attempt.status === 'failed').length;
  const pendingReviewCount = todayAttempts.filter((attempt) => attempt.status === 'needs_review').length;
  const denominator = todaySubmitted + failures;
  const successRate = denominator === 0 ? 100 : normalizeMatchScore((todaySubmitted / denominator) * 100);
  const recent = todayAttempts.at(0);

  return {
    todaySubmitted,
    dailyTarget,
    runningStatus: runStatus,
    pendingReviewCount,
    successRate,
    recentResult: recent
      ? `${recent.status.replace('_', ' ')} for ${recent.jobPostingId}`
      : 'No activity yet today',
  };
};
