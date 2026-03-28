import { SectionCard, StatusPill } from '@applypilot/ui';

import { RunControlCard } from '@/components/run-control-card';
import { humanizeStatus, runTone } from '@/components/status-utils';
import { formatDateTime } from '@/lib/utils';
import { getDashboardData } from '@/server/services/app-service';

export default async function RunsPage() {
  const snapshot = await getDashboardData();

  return (
    <div className="two-column-grid">
      <SectionCard
        description="Automation is now an experimental lab. The recommendation-first flow lives in Daily Picks."
        eyebrow="Automation lab"
        title="Prepare an experimental batch"
      >
        <RunControlCard />
      </SectionCard>

      <SectionCard eyebrow="History" title="Recent runs">
        <div className="simple-list">
          {snapshot.runs.map((run) => (
            <article className="list-row" key={run.id}>
              <div>
                <strong>{run.source.toUpperCase()} run</strong>
                <p>
                  Started {formatDateTime(run.startedAt)} · target {run.targetCount} · processed{' '}
                  {run.processedCount}
                </p>
              </div>
              <StatusPill label={humanizeStatus(run.status)} tone={runTone(run.status)} />
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
