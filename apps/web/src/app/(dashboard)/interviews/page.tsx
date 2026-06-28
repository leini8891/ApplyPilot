import { SectionCard } from '@applypilot/ui';

import { InterviewForm } from '@/components/interview-form';
import { formatDateTime } from '@/lib/utils';
import { requirePageAuth } from '@/server/auth';
import { getDashboardData, withAppStore } from '@/server/services/app-service';

export default async function InterviewsPage() {
  const auth = await requirePageAuth();

  return withAppStore(auth.store, async () => {
    const snapshot = await getDashboardData(auth.candidateId);
    const applicationOptions = snapshot.attempts.map((attempt) => ({
      id: attempt.id,
      label: `${attempt.metadata.company?.toString() ?? 'Company'} - ${attempt.metadata.title?.toString() ?? 'Role'}`,
    }));

    return (
      <div className="two-column-grid">
        <SectionCard
          description="Capture scheduling, interviewer names, and post-interview reflections."
          eyebrow="Notes"
          title="Add interview record"
        >
          <InterviewForm applications={applicationOptions} />
        </SectionCard>

        <SectionCard eyebrow="Library" title="Saved interview notes">
          <div className="simple-list">
            {snapshot.interviews.map((interview) => (
              <article className="list-row" key={interview.id}>
                <div>
                  <strong>{interview.stage}</strong>
                  <p>{interview.notes}</p>
                </div>
                <span className="muted-copy">
                  {formatDateTime(interview.scheduledAt)}
                </span>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  });
}
