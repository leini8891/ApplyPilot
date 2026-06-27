import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SectionCard, StatusPill } from '@applypilot/ui';

import { ApplicationWorkflowActions } from '@/components/application-workflow-actions';
import { applicationTone, humanizeStatus } from '@/components/status-utils';
import { formatDateTime } from '@/lib/utils';
import { getApplicationDetail, getApplicationWorkflow } from '@/server/services/app-service';

const checklistTone = (state: string): 'success' | 'danger' | 'warning' => {
  if (state === 'ready') {
    return 'success';
  }

  if (state === 'blocked') {
    return 'danger';
  }

  return 'warning';
};

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

  let workflow: Awaited<ReturnType<typeof getApplicationWorkflow>> | null = null;
  let workflowError = '';

  if (detail.job) {
    try {
      workflow = await getApplicationWorkflow({
        candidateId: 'demo-user',
        applicationId: id,
      });
    } catch (error) {
      workflowError = error instanceof Error ? error.message : 'Application workflow is not available.';
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        actions={<Link className="ghost-link" href="/applications">Back to board</Link>}
        description="Job details, matched materials, checklist, and tracker state."
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
          <div>
            <p className="detail-label">Prepared</p>
            <strong>{formatDateTime(workflow?.preparedAt)}</strong>
          </div>
        </div>
        {workflow ? (
          <ApplicationWorkflowActions
            applicationId={detail.attempt.id}
            currentStatus={detail.attempt.status}
            preparedAt={workflow.preparedAt}
          />
        ) : null}
        {workflowError ? <p className="form-error">{workflowError}</p> : null}
      </SectionCard>

      {workflow ? (
        <SectionCard
          description={`${workflow.score.overall}% match. ${workflow.score.recommendedAction} recommended by the current scoring model.`}
          eyebrow="Workflow"
          title="Application checklist"
        >
          <div className="workflow-checklist">
            {workflow.checklist.map((item) => (
              <article className="workflow-checklist-item" key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <p className="muted-copy">{item.detail}</p>
                </div>
                <StatusPill label={item.state.replace('_', ' ')} tone={checklistTone(item.state)} />
              </article>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <div className="two-column-grid">
        <SectionCard eyebrow="Job description" title="Scraped role summary">
          <p className="muted-copy">{detail.job?.description ?? 'No job description stored.'}</p>
        </SectionCard>

        <SectionCard eyebrow="Next actions" title="Application moves">
          <div className="simple-list">
            {workflow ? (
              workflow.nextActions.map((action) => (
                <article className="list-row" key={action}>
                  <strong>{action}</strong>
                </article>
              ))
            ) : (
              <p className="muted-copy">No workflow generated yet.</p>
            )}
          </div>
        </SectionCard>
      </div>

      {workflow ? (
        <div className="two-column-grid">
          <SectionCard eyebrow="Resume evidence" title="Matched proof points">
            <div className="prep-match-list">
              {workflow.resumeMatches.length === 0 ? (
                <p className="muted-copy">No resume evidence matched this role yet.</p>
              ) : (
                workflow.resumeMatches.map((match) => (
                  <article className="prep-match-row" key={`${match.sourceLabel}-${match.title}`}>
                    <div>
                      <p className="panel-eyebrow">{match.sourceLabel}</p>
                      <h4>{match.title}</h4>
                      <p className="muted-copy">{match.reason}</p>
                    </div>
                    <ul className="signal-list">
                      {match.highlights.map((highlight) => (
                        <li className="signal-positive" key={highlight}>
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Story assets" title="Knowledge matches">
            <div className="prep-match-list">
              {workflow.knowledgeMatches.length === 0 ? (
                <p className="muted-copy">No story or playbook assets matched this role yet.</p>
              ) : (
                workflow.knowledgeMatches.map((match) => (
                  <article className="prep-match-row" key={match.relativePath}>
                    <div>
                      <p className="panel-eyebrow">{match.kindLabel}</p>
                      <h4>{match.title}</h4>
                      <p className="muted-copy">{match.reason}</p>
                    </div>
                    <ul className="signal-list">
                      {match.answerPoints.map((point) => (
                        <li className="signal-positive" key={point}>
                          {point}
                        </li>
                      ))}
                    </ul>
                    <p className="knowledge-source">{match.relativePath}</p>
                  </article>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}

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
