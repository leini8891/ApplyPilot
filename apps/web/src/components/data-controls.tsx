'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DataControls() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const clearData = async () => {
    setStatus('Clearing data...');
    setError('');

    const response = await fetch('/api/account/data', {
      method: 'DELETE',
    });

    if (!response.ok) {
      setStatus('');
      setError('Failed to clear data.');
      return;
    }

    setStatus('Data cleared.');
    router.refresh();
  };

  return (
    <div className="data-controls">
      <a className="ghost-link" href="/api/account/data" target="_blank">
        Export JSON
      </a>
      <button className="secondary-button" onClick={clearData} type="button">
        Clear data
      </button>
      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

