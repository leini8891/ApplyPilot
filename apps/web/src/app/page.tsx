import Link from 'next/link';

import { SectionCard, StatCard, StatusPill } from '@applypilot/ui';

import { AppShell } from '@/components/app-shell';
import { applicationTone, humanizeStatus } from '@/components/status-utils';
import { getDailyPicks, getDashboardData } from '@/server/services/app-service';

export default async function HomePage() {
  const [snapshot, dailyPicks] = await Promise.all([getDashboardData(), getDailyPicks()]);
  const topPick = dailyPicks.picks[0] ?? null;

  return (
    <AppShell>
      <div className="page-grid">
        <section className="stats-row">
          <StatCard label="Recommended today" tone="accent" value={dailyPicks.picks.length} />
          <StatCard label="Saved job pool" value={dailyPicks.savedPoolSize} />
          <StatCard
            label="Keywords tracked"
            value={dailyPicks.preference?.keywords.length ?? 0}
          />
          <StatCard label="Top match" tone="success" value={topPick ? `${topPick.score.overall}%` : 'N/A'} />
        </section>

        <SectionCard
          description="The calmer version keeps the scoring brain, but moves the final application step back into your hands."
          eyebrow="Daily shortlist"
          title="How this version works"
        >
          <div className="checklist">
            <p>1. Parse a master resume into a structured candidate profile.</p>
            <p>2. Save keywords, regions, salary floor, and VIP companies.</p>
            <p>3. Review the top three roles, then apply manually with more confidence.</p>
          </div>
        </SectionCard>

        <div className="two-column-grid">
          <SectionCard
            actions={<Link className="ghost-link" href="/picks">Open all picks</Link>}
            description="Fresh recommendations ranked only from real roles already saved into your job pool."
            eyebrow="Today"
            title="Daily picks"
          >
            <div className="simple-list">
              {dailyPicks.picks.length > 0 ? dailyPicks.picks.map((pick) => (
                <article className="list-row" key={pick.job.id}>
                  <div>
                    <strong>{pick.job.title}</strong>
                    <p>
                      {pick.job.company} · {pick.job.location || 'Location flexible'}
                    </p>
                  </div>
                  <StatusPill
                    label={`${pick.score.overall}% fit`}
                    tone={pick.score.overall >= 70 ? 'success' : pick.score.overall >= 55 ? 'accent' : 'warning'}
                  />
                </article>
              )) : (
                <article className="list-row">
                  <div>
                    <strong>Daily picks will appear here</strong>
                    <p>Upload a resume and save preferences first, then ApplyPilot can rank roles for you.</p>
                  </div>
                </article>
              )}
            </div>
          </SectionCard>

          <SectionCard
            actions={<Link className="ghost-link" href="/settings">Edit settings</Link>}
            description="Key profile signals used for job scoring"
            eyebrow="Profile"
            title={snapshot.profile?.fullName ?? 'Upload a resume'}
          >
            <p className="muted-copy">{snapshot.profile?.summary ?? 'No parsed profile yet.'}</p>
            <div className="tag-row">
              {(snapshot.profile?.skills ?? []).slice(0, 6).map((skill) => (
                <span className="tag" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          actions={<Link className="ghost-link" href="/runs">Open runs</Link>}
          description="Automation stays in the project as an experimental lab, while the mainline now stays recommendation-first."
          eyebrow="Optional"
          title="Automation lab"
        >
          <p className="muted-copy">{snapshot.summary.recentResult}</p>
          {snapshot.runs.slice(0, 3).map((run) => (
            <article className="list-row" key={run.id}>
              <div>
                <strong>{run.source.toUpperCase()} run</strong>
                <p>{run.notes}</p>
              </div>
              <StatusPill label={humanizeStatus(run.status)} tone="accent" />
            </article>
          ))}
        </SectionCard>
      </div>
    </AppShell>
  );
}
