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

const normalizeSearchText = (value: string) => tokenize(value).join(' ');

const buildJobText = (job: JobPosting) =>
  [
    job.title,
    job.company,
    job.location,
    job.employmentType ?? '',
    job.description,
  ].join(' ');

const hasKeywordMatch = (searchText: string, keyword: string) => {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  if (searchText.includes(normalizedKeyword)) {
    return true;
  }

  const tokens = tokenize(keyword);
  const haystack = new Set(tokenize(searchText));

  return tokens.length > 0 && tokens.every((token) => haystack.has(token));
};

export const buildKeywordCoverage = (jobDescription: string, keywords: string[]) => {
  const searchText = normalizeSearchText(jobDescription);
  const seen = new Set<string>();

  return keywords.reduce<string[]>((matches, keyword) => {
    const normalized = keyword.trim().toLowerCase();

    if (!normalized || seen.has(normalized) || !hasKeywordMatch(searchText, keyword)) {
      return matches;
    }

    seen.add(normalized);

    return [...matches, keyword];
  }, []);
};

const scoreCoverage = (hits: string[], targets: string[], weight: number) => {
  const uniqueTargets = new Set(targets.map((target) => target.trim().toLowerCase()).filter(Boolean));

  if (uniqueTargets.size === 0) {
    return Math.round(weight * 0.65);
  }

  return Math.min(weight, Math.round((hits.length / uniqueTargets.size) * weight));
};

const hasRegionMatch = (job: JobPosting, preferences: JobPreference) =>
  preferences.regions.length === 0 ||
  preferences.regions.some((region) => {
    const normalizedRegion = region.toLowerCase();
    const location = job.location.toLowerCase();
    const description = job.description.toLowerCase();

    return location.includes(normalizedRegion) || description.includes(normalizedRegion);
  });

const hasRemotePolicyMatch = (job: JobPosting, preferences: JobPreference) => {
  if (preferences.remotePolicy === 'any') {
    return true;
  }

  const text = normalizeSearchText(`${job.title} ${job.location} ${job.description}`);
  const mentionsRemote = text.includes('remote') || text.includes('work from home') || text.includes('wfh');
  const mentionsHybrid = text.includes('hybrid');

  if (preferences.remotePolicy === 'remote') {
    return mentionsRemote;
  }

  return mentionsHybrid || mentionsRemote || hasRegionMatch(job, preferences);
};

export const parseSalaryUpperBound = (salaryText: string | null) => {
  if (!salaryText) {
    return null;
  }

  const matches = salaryText.match(/\d[\d,]*(?:\.\d+)?\s*k?/gi) ?? [];
  const values = matches
    .map((rawValue) => {
      const hasThousandsSuffix = /k/i.test(rawValue);
      const value = Number(rawValue.replace(/[^\d.]/g, ''));

      if (!Number.isFinite(value)) {
        return null;
      }

      return hasThousandsSuffix ? value * 1000 : value;
    })
    .filter((value): value is number => value !== null && value >= 1000);

  return values.length > 0 ? Math.max(...values) : null;
};

const buildSalarySignal = (preferences: JobPreference, job: JobPosting) => {
  const salaryUpperBound = parseSalaryUpperBound(job.salaryText);

  if (preferences.minSalary === 0) {
    return {
      score: salaryUpperBound ? 6 : 4,
      gap: null,
      reason: salaryUpperBound ? `Salary signal captured: ${job.salaryText}` : null,
      blocksApply: false,
    };
  }

  if (!salaryUpperBound) {
    return {
      score: 2,
      gap: 'Salary not listed',
      reason: null,
      blocksApply: false,
    };
  }

  if (salaryUpperBound >= preferences.minSalary) {
    return {
      score: 8,
      gap: null,
      reason: `Salary range appears to meet ${preferences.salaryCurrency} ${preferences.minSalary}`,
      blocksApply: false,
    };
  }

  return {
    score: -14,
    gap: `Salary may be below ${preferences.salaryCurrency} ${preferences.minSalary}`,
    reason: `Salary listed as ${job.salaryText}`,
    blocksApply: true,
  };
};

export const scoreJobAgainstPreferences = (
  profile: CandidateProfile,
  preferences: JobPreference,
  job: JobPosting,
): MatchScore => {
  const jobText = buildJobText(job);
  const roleText = `${job.title} ${job.description}`;
  const preferenceIndustries = [...preferences.industries, ...profile.industries];
  const keywordHits = buildKeywordCoverage(jobText, preferences.keywords);
  const targetRoleHits = buildKeywordCoverage(roleText, profile.targetRoles);
  const industryHits = buildKeywordCoverage(jobText, preferenceIndustries);
  const profileSkillHits = buildKeywordCoverage(jobText, profile.skills);
  const regionMatch = hasRegionMatch(job, preferences);
  const remotePolicyMatch = hasRemotePolicyMatch(job, preferences);
  const salarySignal = buildSalarySignal(preferences, job);
  const isVipCompany = preferences.vipCompanies.some(
    (company) => company.toLowerCase() === job.company.toLowerCase(),
  );
  const hasSparseDescription = tokenize(job.description).length < 12;

  const score =
    18 +
    scoreCoverage(keywordHits, preferences.keywords, 24) +
    scoreCoverage(targetRoleHits, profile.targetRoles, 20) +
    scoreCoverage(industryHits, preferenceIndustries, 12) +
    Math.min(18, profileSkillHits.length * 4) +
    (regionMatch ? 10 : -12) +
    (remotePolicyMatch ? 6 : -8) +
    (job.easyApply ? 6 : preferences.easyApplyOnly ? -10 : 2) +
    salarySignal.score +
    (isVipCompany ? 5 : 0) +
    (hasSparseDescription ? -5 : 0);

  const keywordGaps = preferences.keywords.filter(
    (keyword) => !keywordHits.some((hit) => hit.toLowerCase() === keyword.toLowerCase()),
  );
  const gaps = [
    ...keywordGaps.slice(0, 5).map((keyword) => `Missing keyword: ${keyword}`),
    regionMatch ? null : `Outside preferred regions: ${preferences.regions.join(', ')}`,
    remotePolicyMatch ? null : `Does not clearly match ${preferences.remotePolicy} preference`,
    preferences.easyApplyOnly && !job.easyApply ? 'Manual application flow' : null,
    salarySignal.gap,
    hasSparseDescription ? 'Job description is too thin to score deeply' : null,
  ].filter((gap): gap is string => Boolean(gap));
  const overall = normalizeMatchScore(score);
  const shouldReview =
    salarySignal.blocksApply ||
    !regionMatch ||
    !remotePolicyMatch ||
    (preferences.easyApplyOnly && !job.easyApply);
  const recommendedAction =
    overall >= 72 && !shouldReview ? 'apply' : overall >= 48 ? 'review' : 'skip';
  const reasons = [
    keywordHits.length > 0 ? `Matched priority keywords: ${keywordHits.slice(0, 4).join(', ')}` : null,
    targetRoleHits.length > 0 ? `Role alignment: ${targetRoleHits.slice(0, 2).join(', ')}` : null,
    industryHits.length > 0 ? `Industry overlap: ${industryHits.slice(0, 3).join(', ')}` : null,
    profileSkillHits.length > 0 ? `Resume skill overlap: ${profileSkillHits.slice(0, 4).join(', ')}` : null,
    regionMatch ? 'Location fits saved region preferences' : null,
    remotePolicyMatch ? `Work mode fits ${preferences.remotePolicy} preference` : null,
    job.easyApply ? 'Low application friction' : null,
    salarySignal.reason,
    isVipCompany ? 'VIP company bonus applied' : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    id: `score_${job.id}`,
    candidateId: profile.id,
    jobPostingId: job.id,
    overall,
    keywordHits,
    gaps,
    reasons: reasons.length > 0 ? reasons : ['Limited match evidence from the saved profile and job text'],
    recommendedAction,
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
