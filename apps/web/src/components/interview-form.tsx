'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

type InterviewFormProps = {
  applications: Array<{
    id: string;
    label: string;
  }>;
};

export function InterviewForm({ applications }: InterviewFormProps) {
  const router = useRouter();
  const [formState, setFormState] = useState({
    applicationId: applications[0]?.id ?? '',
    scheduledAt: '',
    interviewerNames: '',
    stage: 'Phone screen',
    tags: '',
    notes: '',
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const setValue = (key: keyof typeof formState, value: string) =>
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('Saving interview note...');
    setError('');

    const response = await fetch('/api/interviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: formState.applicationId,
        scheduledAt: formState.scheduledAt ? new Date(formState.scheduledAt).toISOString() : null,
        interviewerNames: formState.interviewerNames
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        stage: formState.stage,
        tags: formState.tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        notes: formState.notes,
      }),
    });

    if (!response.ok) {
      setStatus('');
      setError('Could not save interview note.');
      return;
    }

    setStatus('Interview note saved.');
    router.refresh();
  };

  if (applications.length === 0) {
    return <p className="muted-copy">Create an application first to attach interview notes.</p>;
  }

  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Application</span>
        <select
          onChange={(event) => setValue('applicationId', event.target.value)}
          value={formState.applicationId}
        >
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Stage</span>
          <input onChange={(event) => setValue('stage', event.target.value)} value={formState.stage} />
        </label>
        <label className="field">
          <span>Scheduled time</span>
          <input
            onChange={(event) => setValue('scheduledAt', event.target.value)}
            type="datetime-local"
            value={formState.scheduledAt}
          />
        </label>
      </div>
      <label className="field">
        <span>Interviewers</span>
        <input
          onChange={(event) => setValue('interviewerNames', event.target.value)}
          value={formState.interviewerNames}
        />
      </label>
      <label className="field">
        <span>Tags</span>
        <input onChange={(event) => setValue('tags', event.target.value)} value={formState.tags} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea onChange={(event) => setValue('notes', event.target.value)} rows={6} value={formState.notes} />
      </label>
      <button className="primary-button" type="submit">
        Save note
      </button>
      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
