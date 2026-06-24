'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function ManualJobForm() {
  const router = useRouter();
  const [formState, setFormState] = useState({
    source: 'linkedin',
    title: '',
    company: '',
    location: 'Singapore',
    salaryText: '',
    employmentType: '',
    url: '',
    description: '',
    easyApply: false,
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const update = (key: keyof typeof formState, value: string | boolean) =>
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('Saving role...');
    setError('');

    const response = await fetch('/api/jobs/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formState),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus('');
      setError(payload?.error ?? 'Could not save this job.');
      return;
    }

    setStatus('Role saved to your pool and application tracker.');
    setFormState({
      source: formState.source,
      title: '',
      company: '',
      location: 'Singapore',
      salaryText: '',
      employmentType: '',
      url: '',
      description: '',
      easyApply: false,
    });
    router.refresh();
  };

  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <div className="field-grid">
        <label className="field">
          <span>Source</span>
          <select onChange={(event) => update('source', event.target.value)} value={formState.source}>
            <option value="linkedin">LinkedIn</option>
            <option value="mycareersfuture">MyCareersFuture</option>
          </select>
        </label>
        <label className="field">
          <span>Location</span>
          <input onChange={(event) => update('location', event.target.value)} value={formState.location} />
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Job title</span>
          <input onChange={(event) => update('title', event.target.value)} required value={formState.title} />
        </label>
        <label className="field">
          <span>Company</span>
          <input onChange={(event) => update('company', event.target.value)} required value={formState.company} />
        </label>
      </div>

      <label className="field">
        <span>Job URL</span>
        <input
          onChange={(event) => update('url', event.target.value)}
          placeholder="https://www.linkedin.com/jobs/view/..."
          required
          type="url"
          value={formState.url}
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Salary</span>
          <input onChange={(event) => update('salaryText', event.target.value)} value={formState.salaryText} />
        </label>
        <label className="field">
          <span>Employment type</span>
          <input
            onChange={(event) => update('employmentType', event.target.value)}
            value={formState.employmentType}
          />
        </label>
      </div>

      <label className="field">
        <span>Short description</span>
        <textarea
          onChange={(event) => update('description', event.target.value)}
          placeholder="Paste the job summary or the most important requirements."
          rows={5}
          value={formState.description}
        />
      </label>

      <label className="field-inline">
        <input
          checked={formState.easyApply}
          onChange={(event) => update('easyApply', event.target.checked)}
          type="checkbox"
        />
        <span>Mark as easy apply / quick apply if the page supports it</span>
      </label>

      <button className="primary-button" type="submit">
        Save role to pool
      </button>
      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
