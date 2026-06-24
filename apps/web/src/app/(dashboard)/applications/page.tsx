import { SectionCard } from '@applypilot/ui';

import { KanbanBoard } from '@/components/kanban-board';
import { getDashboardData } from '@/server/services/app-service';
import { store } from '@/server/services/store';

export default async function ApplicationsPage() {
  const snapshot = await getDashboardData();
  const items = snapshot.attempts.map((attempt) => ({ attempt }));
  const jobs = await store.listJobs();
  const jobMap = new Map(jobs.map((job) => [job.id, job]));

  return (
    <SectionCard
      description="Applications move between queue, review, interview, and outcome states."
      eyebrow="Kanban"
      title="Application tracker"
    >
      <KanbanBoard
        items={items.map((item) => ({
          ...item,
          job: jobMap.get(item.attempt.jobPostingId) ?? null,
        }))}
      />
    </SectionCard>
  );
}
