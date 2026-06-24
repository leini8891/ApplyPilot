import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SectionCard, StatusPill } from '@applypilot/ui';

import { applicationTone, humanizeStatus } from '@/components/status-utils';
import { formatDateTime } from '@/lib/utils';
import { getApplicationDetail } from '@/server/services/app-service';

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApplicationDetail('demo-user', id);

  if (!detail) {
    notFound();
  }

  return (
    <div className="page-grid">
      <SectionCard
        actions={<Link className="ghost-link" href="/applications">Back to board</Link>}
        description="Job details, review notes, and linked interview context."
        eyebrow="Application"
        title={detail.job?.title ?? detail.attempt.metadata.title?.toString() ?? 'Application detail'}
      >
        <div className="detail-grid">
          <div>
            <p className="detail-label">Company</p>
            <strong>{detail.job?.company ?? detail.attempt.metadata.company?.toString() ?? 'Unknown'}</strong>
          </div>
          <div>
            <p className="detail-label">Status</p>
            <StatusPill
              label={humanizeStatus(detail.attempt.status)}
              tone={applicationTone(detail.attempt.status)}
            />
          </div>
          <div>
            <p className="detail-label">Submitted</p>
            <strong>{formatDateTime(detail.attempt.submittedAt)}</strong>
          </div>
          <div>
            <p className="detail-label">Review note</p>
            <strong>{detail.attempt.reviewReason ?? 'None'}</strong>
          </div>
        </div>
      </SectionCard>

      <div className="two-column-grid">
        <SectionCard eyebrow="Job description" title="Scraped role summary">
          <p className="muted-copy">{detail.job?.description ?? 'No job description stored.'}</p>
        </SectionCard>

        <SectionCard eyebrow="Review queue" title="Blocking reasons">
          <div className="simple-list">
            {detail.reviewItems.length === 0 ? (
              <p className="muted-copy">No review items linked to this application.</p>
            ) : (
              detail.reviewItems.map((item) => (
                <article className="list-row" key={item.id}>
                  <div>
                    <strong>{item.reason}</strong>
                    <p>{formatDateTime(item.createdAt)}</p>
                  </div>
                  <StatusPill label={item.priority} tone="warning" />
                </article>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Interviews" title="Interview notes">
        <div className="simple-list">
          {detail.interviews.length === 0 ? (
            <p className="muted-copy">No interview notes yet.</p>
          ) : (
            detail.interviews.map((interview) => (
              <article className="list-row" key={interview.id}>
                <div>
                  <strong>{interview.stage}</strong>
                  <p>{interview.notes}</p>
                </div>
                <span className="muted-copy">{formatDateTime(interview.scheduledAt)}</span>
              </article>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

