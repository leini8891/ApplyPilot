import { SectionCard } from '@applypilot/ui';

import { KanbanBoard } from '@/components/kanban-board';
import { requirePageAuth } from '@/server/auth';
import { getDashboardData, withAppStore } from '@/server/services/app-service';

export default async function ApplicationsPage() {
  const auth = await requirePageAuth();

  return withAppStore(auth.store, async () => {
    const snapshot = await getDashboardData(auth.candidateId);
    const items = snapshot.attempts.map((attempt) => ({ attempt }));
    const jobs = await auth.store.listJobs(auth.candidateId);
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
  });
}
