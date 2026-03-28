import Link from 'next/link';

import { EmptyState, SectionCard, StatCard, StatusPill } from '@applypilot/ui';

import { ManualJobForm } from '@/components/manual-job-form';
import { formatDateTime } from '@/lib/utils';
import { getDailyPicks } from '@/server/services/app-service';

const scoreTone = (score: number) => {
  if (score >= 70) {
    return 'success';
  }

  if (score >= 55) {
    return 'accent';
  }

  return 'warning';
};

export default async function DailyPicksPage() {
  const dailyPicks = await getDailyPicks();

  if (dailyPicks.setupRequired) {
    return (
      <SectionCard
        actions={<Link className="ghost-link" href="/settings">Open settings</Link>}
        description="Daily picks need both a parsed resume and saved preferences."
        eyebrow="Setup"
        title="Finish your profile first"
      >
        <EmptyState
          title="We need a little more context"
          description="Upload your resume, confirm your skills, and save job preferences. Then ApplyPilot can shortlist the best three roles for manual apply."
        />
      </SectionCard>
    );
  }

  const topPick = dailyPicks.picks[0] ?? null;

  return (
    <div className="page-grid">
      <section className="stats-row">
        <StatCard label="Top match" tone="success" value={topPick ? `${topPick.score.overall}%` : 'N/A'} />
        <StatCard label="Saved pool" value={dailyPicks.savedPoolSize} />
        <StatCard label="Ready to review" value={dailyPicks.picks.length} />
        <StatCard label="Keywords tracked" tone="accent" value={dailyPicks.preference?.keywords.length ?? 0} />
      </section>

      <SectionCard
        description="Paste real roles here and ApplyPilot will start ranking them immediately."
        eyebrow="Build your pool"
        title="Save a real job manually"
      >
        <ManualJobForm />
      </SectionCard>

      <SectionCard
        actions={<Link className="ghost-link" href="/settings">Tune filters</Link>}
        description="A compact shortlist built only from real roles already saved into ApplyPilot."
        eyebrow="Daily Picks"
        title="Today’s top roles"
      >
        {dailyPicks.picks.length > 0 ? (
          <div className="pick-list">
            {dailyPicks.picks.map((pick, index) => (
              <article className="pick-card" key={pick.job.id}>
                <div className="pick-header">
                  <div className="pick-title">
                    <p className="panel-eyebrow">Pick {index + 1}</p>
                    <h3>{pick.job.title}</h3>
                    <p className="pick-company">
                      {pick.job.company} · {pick.job.location || 'Location flexible'}
                    </p>
                  </div>
                  <StatusPill label={`${pick.score.overall}% fit`} tone={scoreTone(pick.score.overall)} />
                </div>

                <p className="pick-summary">{pick.job.description || 'No description captured yet for this role.'}</p>

                <div className="pick-meta">
                  <div className="tag-row">
                    <span className="tag">{pick.sourceLabel}</span>
                    <span className="tag">{pick.freshnessLabel}</span>
                    <span className="tag">{pick.job.easyApply ? 'Easy apply signal' : 'Manual apply flow'}</span>
                  </div>
                  <span className="muted-copy">Refreshed {formatDateTime(dailyPicks.generatedAt)}</span>
                </div>

                <div className="pick-grid">
                  <div className="signal-block">
                    <h3>Why it fits</h3>
                    <ul className="signal-list">
                      {pick.fitSignals.map((signal) => (
                        <li className="signal-positive" key={signal}>
                          {signal}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="signal-block">
                    <h3>Watchouts</h3>
                    {pick.watchouts.length > 0 ? (
                      <ul className="signal-list">
                        {pick.watchouts.map((signal) => (
                          <li className="signal-warning" key={signal}>
                            {signal}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted-copy">No major watchouts surfaced from the saved data.</p>
                    )}
                  </div>
                </div>

                <div className="pick-footer">
                  <a className="primary-button" href={pick.job.url} rel="noreferrer" target="_blank">
                    Open role
                  </a>
                  <p className="muted-copy">
                    Use this as a shortlist, then apply manually and track the outcome in your board.
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Your pool is still empty"
            description="Once real jobs are saved into ApplyPilot, this page will rank the best three for you each day. We no longer pad this list with demo roles."
          />
        )}
      </SectionCard>
    </div>
  );
}
