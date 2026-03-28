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
  scoreJobAgainstPreferences,
} from './index';

describe('domain helpers', () => {
  it('clamps match scores between 0 and 100', () => {
    expect(normalizeMatchScore(140)).toBe(100);
    expect(normalizeMatchScore(-5)).toBe(0);
  });

  it('scores jobs using profile and preferences', () => {
    const score = scoreJobAgainstPreferences(demoCandidateProfile, demoPreferences, demoJobs[0]);
    expect(score.overall).toBeGreaterThan(50);
    expect(score.recommendedAction).toBe('apply');
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
