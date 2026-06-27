'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ApplicationStatus } from '@applypilot/domain';

import { humanizeStatus } from './status-utils';

const statusOptions: ApplicationStatus[] = [
  'drafted',
  'queued',
  'submitted',
  'viewed',
  'needs_review',
  'interview',
  'offer',
  'rejected',
  'failed',
];

export function ApplicationWorkflowActions({
  applicationId,
  currentStatus,
  preparedAt,
}: {
  applicationId: string;
  currentStatus: ApplicationStatus;
  preparedAt: string | null;
}) {
  const router = useRouter();
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState('');

  const prepareWorkflow = async () => {
    setIsPreparing(true);
    setError('');

    const response = await fetch(`/api/applications/${applicationId}/workflow`, {
      method: 'POST',
    });

    setIsPreparing(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? 'Could not prepare this application.');
      return;
    }

    router.refresh();
  };

  const updateStatus = async (status: ApplicationStatus) => {
    setIsUpdatingStatus(true);
    setError('');

    const response = await fetch(`/api/applications/${applicationId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    setIsUpdatingStatus(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? 'Could not update this application.');
      return;
    }

    router.refresh();
  };

  return (
    <div className="workflow-actions">
      <button className="primary-button" disabled={isPreparing} onClick={prepareWorkflow} type="button">
        {preparedAt ? 'Refresh checklist' : 'Prepare checklist'}
      </button>
      <select
        className="status-select workflow-status-select"
        disabled={isUpdatingStatus}
        onChange={(event) => updateStatus(event.target.value as ApplicationStatus)}
        value={currentStatus}
      >
        {statusOptions.map((status) => (
          <option key={status} value={status}>
            {humanizeStatus(status)}
          </option>
        ))}
      </select>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
