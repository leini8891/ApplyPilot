'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RunControlCard() {
  const router = useRouter();
  const [targetCount, setTargetCount] = useState(10);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const startRun = async () => {
    setStatus('Starting run...');
    setError('');

    const response = await fetch('/api/runs/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'linkedin',
        targetCount,
      }),
    });

    if (!response.ok) {
      setStatus('');
      setError('Run could not be started.');
      return;
    }

    setStatus(
      'Run plan created. Open a LinkedIn Jobs tab and use the extension popup to execute submissions.',
    );
    router.refresh();
  };

  return (
    <div className="stack-form">
      <label className="field">
        <span>Run target</span>
        <input
          max={50}
          min={1}
          onChange={(event) => setTargetCount(Number(event.target.value))}
          type="number"
          value={targetCount}
        />
      </label>
      <button className="primary-button" onClick={startRun} type="button">
        Create run plan
      </button>
      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
