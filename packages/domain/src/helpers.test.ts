import {
  buildDashboardSummary,
  chooseReviewPriority,
  demoAttempts,
  demoCandidateProfile,
  demoJobs,
  demoPreferences,
  isWithinDailyQuota,
  normalizeMatchScore,
  needsReviewRouting,
  parseSalaryUpperBound,
  scoreJobAgainstPreferences,
} from './index';

describe('domain helpers', () => {
  it('clamps match scores between 0 and 100', () => {
    expect(normalizeMatchScore(140)).toBe(100);
    expect(normalizeMatchScore(-5)).toBe(0);
  });

  it('scores jobs using profile and preferences', () => {
    const score = scoreJobAgainstPreferences(demoCandidateProfile, demoPreferences, demoJobs[0]);
    expect(score.overall).toBeGreaterThan(70);
    expect(score.recommendedAction).toBe('apply');
    expect(score.reasons.some((reason) => reason.includes('priority keywords'))).toBe(true);
  });

  it('routes strong matches to review when application friction conflicts with preferences', () => {
    const score = scoreJobAgainstPreferences(demoCandidateProfile, demoPreferences, {
      ...demoJobs[0],
      id: 'manual_payments_role',
      easyApply: false,
    });

    expect(score.overall).toBeGreaterThan(55);
    expect(score.recommendedAction).toBe('review');
    expect(score.gaps).toContain('Manual application flow');
  });

  it('penalizes roles that appear below the saved salary floor', () => {
    const score = scoreJobAgainstPreferences(demoCandidateProfile, demoPreferences, {
      ...demoJobs[0],
      id: 'low_salary_payments_role',
      salaryText: 'SGD 90k - 110k',
    });

    expect(score.recommendedAction).toBe('review');
    expect(score.gaps).toContain('Salary may be below SGD 140000');
  });

  it('parses common salary range formats', () => {
    expect(parseSalaryUpperBound('SGD 160k - 190k')).toBe(190000);
    expect(parseSalaryUpperBound('$120,000 - $150,000')).toBe(150000);
    expect(parseSalaryUpperBound(null)).toBeNull();
  });

  it('routes VIP companies and weak knockout flows to review', () => {
    const reasons = needsReviewRouting({
      job: demoJobs[1],
      preferences: demoPreferences,
      knockoutConfidence: 0.5,
      riskSignals: ['Risk throttle triggered'],
    });

    expect(reasons).toContain('VIP company');
    expect(chooseReviewPriority(reasons)).toBe('high');
  });

  it('checks daily quota', () => {
    expect(isWithinDailyQuota({ attempts: demoAttempts, target: 10 })).toBe(true);
    expect(isWithinDailyQuota({ attempts: demoAttempts, target: 1 })).toBe(false);
  });

  it('summarizes dashboard metrics', () => {
    const summary = buildDashboardSummary({
      attempts: demoAttempts,
      dailyTarget: demoPreferences.dailyTarget,
      runStatus: 'running',
    });

    expect(summary.todaySubmitted).toBeGreaterThanOrEqual(1);
    expect(summary.pendingReviewCount).toBeGreaterThanOrEqual(1);
  });
});
