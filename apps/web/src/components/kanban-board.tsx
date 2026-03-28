'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ApplicationAttempt, JobPosting } from '@applypilot/domain';
import { EmptyState, StatusPill } from '@applypilot/ui';

import { applicationTone, humanizeStatus } from './status-utils';

type ApplicationCard = {
  attempt: ApplicationAttempt;
  job: JobPosting | null;
};

type KanbanBoardProps = {
  items: ApplicationCard[];
};

const columns: Array<{ label: string; statuses: string[] }> = [
  { label: 'Queued', statuses: ['queued', 'drafted'] },
  { label: 'Submitted', statuses: ['submitted', 'viewed'] },
  { label: 'Review', statuses: ['needs_review', 'failed'] },
  { label: 'Interview', statuses: ['interview'] },
  { label: 'Outcome', statuses: ['offer', 'rejected'] },
];

export function KanbanBoard({ items }: KanbanBoardProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const updateStatus = async (applicationId: string, nextStatus: string) => {
    setPendingId(applicationId);
    await fetch(`/api/applications/${applicationId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: nextStatus,
      }),
    });
    setPendingId(null);
    router.refresh();
  };

  if (items.length === 0) {
    return (
      <EmptyState
        description="Start a run or score a LinkedIn role to populate the board."
        title="No applications yet"
      />
    );
  }

  return (
    <div className="kanban-grid">
      {columns.map((column) => {
        const cards = items.filter((item) =>
          column.statuses.includes(item.attempt.status),
        );

        return (
          <section className="kanban-column" key={column.label}>
            <div className="kanban-column-header">
              <h3>{column.label}</h3>
              <span>{cards.length}</span>
            </div>
            <div className="kanban-cards">
              {cards.map(({ attempt, job }) => (
                <article className="kanban-card" key={attempt.id}>
                  <div className="kanban-card-top">
                    <div>
                      <strong>
                        <Link href={`/applications/${attempt.id}`}>
                          {job?.title ?? attempt.metadata.title?.toString() ?? 'Application'}
                        </Link>
                      </strong>
                      <p>{job?.company ?? attempt.metadata.company?.toString() ?? 'Unknown company'}</p>
                    </div>
                    <StatusPill
                      label={humanizeStatus(attempt.status)}
                      tone={applicationTone(attempt.status)}
                    />
                  </div>
                  <p className="muted-copy">{attempt.reviewReason ?? 'No blocking notes.'}</p>
                  <select
                    className="status-select"
                    disabled={pendingId === attempt.id}
                    onChange={(event) => updateStatus(attempt.id, event.target.value)}
                    value={attempt.status}
                  >
                    {[
                      'queued',
                      'submitted',
                      'needs_review',
                      'interview',
                      'offer',
                      'rejected',
                      'failed',
                    ].map((status) => (
                      <option key={status} value={status}>
                        {humanizeStatus(status)}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
