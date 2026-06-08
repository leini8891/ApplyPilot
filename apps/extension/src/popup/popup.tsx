import { useEffect, useState } from 'react';

import { extensionEnv } from '../shared/env';
import type { ExtensionMessage, PopupState } from '../shared/messages';
import { getTinyFishApiKey, saveTinyFishApiKey } from '../tinyfish/client';

const defaultState: PopupState = {
  runStatus: 'idle',
  dailySubmitted: 0,
  pendingReviewCount: 0,
  recentResult: 'No activity yet',
  activeRunId: null,
};

type DashboardSummary = {
  summary: {
    todaySubmitted: number;
    dailyTarget: number;
    pendingReviewCount: number;
    recentResult: string;
  };
};

export function PopupApp() {
  const [extensionState, setExtensionState] = useState<PopupState>(defaultState);
  const [summary, setSummary] = useState<DashboardSummary['summary'] | null>(null);
  const [targetCount, setTargetCount] = useState(10);
  const [tinyFishApiKey, setTinyFishApiKey] = useState('');
  const [tinyFishSaved, setTinyFishSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const state = (await chrome.runtime.sendMessage({
          type: 'applypilot:get-state',
        } satisfies ExtensionMessage)) as PopupState;
        setExtensionState(state);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not read ApplyPilot state.');
      }

      try {
        const response = await fetch(`${extensionEnv.VITE_API_BASE_URL}/api/dashboard/summary`);
        const data = (await response.json()) as DashboardSummary;
        setSummary(data.summary);
      } catch {
        setError('Dashboard API is unavailable.');
      }

      try {
        const savedApiKey = await getTinyFishApiKey();
        setTinyFishApiKey(savedApiKey);
        setTinyFishSaved(true);
      } catch {
        setTinyFishSaved(false);
      }
    };

    void bootstrap();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes['applypilot-state']?.newValue) {
        return;
      }

      setExtensionState(changes['applypilot-state'].newValue as PopupState);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const prefersLiveRunMetrics = Boolean(extensionState.activeRunId) || extensionState.runStatus === 'running';
  const submittedToday = prefersLiveRunMetrics
    ? extensionState.dailySubmitted
    : summary?.todaySubmitted ?? extensionState.dailySubmitted;
  const pendingReview = prefersLiveRunMetrics
    ? extensionState.pendingReviewCount
    : summary?.pendingReviewCount ?? extensionState.pendingReviewCount;

  const startRun = async () => {
    setError('');
    let response:
      | {
          ok?: boolean;
          error?: string;
        }
      | undefined;

    try {
      response = (await chrome.runtime.sendMessage({
        type: 'applypilot:start-run',
        targetCount,
      } satisfies ExtensionMessage)) as { ok?: boolean; error?: string } | undefined;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start run.');
      return;
    }

    if (!response?.ok) {
      setError(response?.error ?? 'Could not start run.');
      return;
    }

    setExtensionState((current) => ({
      ...current,
      runStatus: 'running',
    }));
  };

  const pauseRun = async () => {
    try {
      const next = (await chrome.runtime.sendMessage({
        type: 'applypilot:pause-run',
      } satisfies ExtensionMessage)) as PopupState;
      setExtensionState(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not pause run.');
    }
  };

  const saveTinyFishKey = async () => {
    setError('');
    try {
      await saveTinyFishApiKey(tinyFishApiKey);
      setTinyFishSaved(true);
    } catch (error) {
      setTinyFishSaved(false);
      setError(error instanceof Error ? error.message : 'Could not save the TinyFish API key.');
    }
  };

  return (
    <div className="popup-root">
      <div className="hero">
        <p className="hero-eyebrow">ApplyPilot</p>
        <h1>Visible application runs</h1>
        <p>
          Open a LinkedIn jobs search, set a target, and ApplyPilot works down the results list. Risky and
          VIP roles are routed to review instead of auto-submitted.
        </p>
      </div>

      <div className="popup-grid">
        <article className="metric-card">
          <span>Submitted today</span>
          <strong>{submittedToday}</strong>
        </article>
        <article className="metric-card">
          <span>Daily target</span>
          <strong>{summary?.dailyTarget ?? targetCount}</strong>
        </article>
        <article className="metric-card">
          <span>Pending review</span>
          <strong>{pendingReview}</strong>
        </article>
      </div>

      <label className="popup-field">
        <span>Run target (jobs to apply this run)</span>
        <input
          max={50}
          min={1}
          onChange={(event) => setTargetCount(Number(event.target.value))}
          type="number"
          value={targetCount}
        />
      </label>

      <label className="popup-field">
        <span>TinyFish API key</span>
        <input
          onChange={(event) => {
            setTinyFishApiKey(event.target.value);
            setTinyFishSaved(false);
          }}
          placeholder="Paste your TinyFish key"
          type="password"
          value={tinyFishApiKey}
        />
      </label>

      <div className="actions">
        <button className="secondary" onClick={saveTinyFishKey} type="button">
          {tinyFishSaved ? 'Saved' : 'Save TinyFish key'}
        </button>
      </div>

      <div className="actions">
        <button className="primary" onClick={startRun} type="button">
          Start run
        </button>
        <button className="secondary" onClick={pauseRun} type="button">
          Pause
        </button>
      </div>

      <div className="status-panel">
        <p className="hero-eyebrow">Status</p>
        <strong>{extensionState.runStatus}</strong>
        <p>{extensionState.recentResult}</p>
      </div>

      <a className="dashboard-link" href={extensionEnv.VITE_DASHBOARD_URL} target="_blank">
        Open dashboard
      </a>

      {error ? <p className="popup-error">{error}</p> : null}
    </div>
  );
}
