'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { JobPreference } from '@applypilot/domain';

type PreferencesFormProps = {
  preference: JobPreference | null;
};

export function PreferencesForm({ preference }: PreferencesFormProps) {
  const router = useRouter();
  const [formState, setFormState] = useState({
    keywords: preference?.keywords.join(', ') ?? '',
    industries: preference?.industries.join(', ') ?? '',
    regions: preference?.regions.join(', ') ?? '',
    minSalary: String(preference?.minSalary ?? 120000),
    salaryCurrency: preference?.salaryCurrency ?? 'USD',
    dailyTarget: String(preference?.dailyTarget ?? 25),
    vipCompanies: preference?.vipCompanies.join(', ') ?? '',
    remotePolicy: preference?.remotePolicy ?? 'any',
    easyApplyOnly: preference?.easyApplyOnly ?? true,
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
    setStatus('Saving...');
    setError('');

    const response = await fetch('/api/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords: formState.keywords.split(',').map((item) => item.trim()).filter(Boolean),
        industries: formState.industries.split(',').map((item) => item.trim()).filter(Boolean),
        regions: formState.regions.split(',').map((item) => item.trim()).filter(Boolean),
        minSalary: Number(formState.minSalary),
        salaryCurrency: formState.salaryCurrency,
        dailyTarget: Number(formState.dailyTarget),
        vipCompanies: formState.vipCompanies.split(',').map((item) => item.trim()).filter(Boolean),
        remotePolicy: formState.remotePolicy,
        easyApplyOnly: formState.easyApplyOnly,
      }),
    });

    if (!response.ok) {
      setStatus('');
      setError('Could not save preferences.');
      return;
    }

    setStatus('Preferences saved.');
    router.refresh();
  };

  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Keywords</span>
        <textarea
          onChange={(event) => update('keywords', event.target.value)}
          rows={3}
          value={formState.keywords}
        />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Industries</span>
          <input
            onChange={(event) => update('industries', event.target.value)}
            value={formState.industries}
          />
        </label>
        <label className="field">
          <span>Regions</span>
          <input onChange={(event) => update('regions', event.target.value)} value={formState.regions} />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Minimum salary</span>
          <input
            min={0}
            onChange={(event) => update('minSalary', event.target.value)}
            type="number"
            value={formState.minSalary}
          />
        </label>
        <label className="field">
          <span>Currency</span>
          <input
            onChange={(event) => update('salaryCurrency', event.target.value)}
            value={formState.salaryCurrency}
          />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Daily target</span>
          <input
            max={50}
            min={1}
            onChange={(event) => update('dailyTarget', event.target.value)}
            type="number"
            value={formState.dailyTarget}
          />
        </label>
        <label className="field">
          <span>Remote policy</span>
          <select
            onChange={(event) => update('remotePolicy', event.target.value)}
            value={formState.remotePolicy}
          >
            <option value="any">Any</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>VIP companies</span>
        <input
          onChange={(event) => update('vipCompanies', event.target.value)}
          value={formState.vipCompanies}
        />
      </label>
      <label className="field-inline">
        <input
          checked={formState.easyApplyOnly}
          onChange={(event) => update('easyApplyOnly', event.target.checked)}
          type="checkbox"
        />
        <span>Easy Apply only</span>
      </label>
      <button className="primary-button" type="submit">
        Save preferences
      </button>
      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
