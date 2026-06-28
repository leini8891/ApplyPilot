'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function ResumeUploadForm() {
  const router = useRouter();
  const [label, setLabel] = useState('Master Resume');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!file) {
      setError('Choose a PDF or DOCX resume first.');
      return;
    }

    setStatus('Uploading and parsing...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('label', label);

    const uploadResponse = await fetch('/api/resumes/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      setError('Resume upload failed.');
      setStatus('');
      return;
    }

    const uploaded = (await uploadResponse.json()) as { resume: { id: string } };
    const parseResponse = await fetch('/api/profile/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resumeId: uploaded.resume.id,
      }),
    });

    if (!parseResponse.ok) {
      setError('Resume uploaded, but profile parsing failed.');
      setStatus('');
      return;
    }

    setStatus('Searching matching jobs...');
    const searchResponse = await fetch('/api/jobs/search-from-resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resumeId: uploaded.resume.id,
      }),
    });

    if (!searchResponse.ok) {
      setStatus('Resume uploaded and profile parsed. Save preferences to search matching jobs.');
      router.refresh();
      return;
    }

    const searchResult = (await searchResponse.json()) as {
      search: {
        enabled: boolean;
        savedCount: number;
        disabledReason?: string;
      };
    };

    if (!searchResult.search.enabled) {
      setStatus(
        'Resume uploaded and profile parsed. Job search is disabled until Adzuna API credentials are configured.',
      );
      router.refresh();
      return;
    }

    setStatus(
      searchResult.search.savedCount > 0
        ? `Resume uploaded and ${searchResult.search.savedCount} matching jobs added to the tracker.`
        : 'Resume uploaded and parsed. No matching jobs returned yet.',
    );
    router.refresh();
  };

  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Label</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="field">
        <span>Resume file</span>
        <input
          accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <button className="primary-button" type="submit">
        Upload resume
      </button>
      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
