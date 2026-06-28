'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

import { StatusPill } from '@applypilot/ui';

import type { MockInterviewSession } from '@/server/services/mock-interview';

type MockInterviewPanelProps = {
  applications: Array<{
    id: string;
    label: string;
  }>;
};

const currentQuestion = (session: MockInterviewSession | null) =>
  session?.turns.find((turn) => !turn.answer) ?? null;

export function MockInterviewPanel({ applications }: MockInterviewPanelProps) {
  const router = useRouter();
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? '');
  const [session, setSession] = useState<MockInterviewSession | null>(null);
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const activeTurn = currentQuestion(session);
  const completedTurns = useMemo(
    () => session?.turns.filter((turn) => turn.answer) ?? [],
    [session],
  );

  const startSession = async () => {
    setIsBusy(true);
    setStatus('Starting mock interview...');
    setError('');

    const response = await fetch('/api/interviews/mock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      session?: MockInterviewSession;
      error?: string;
    } | null;

    setIsBusy(false);

    if (!response.ok || !payload?.session) {
      setStatus('');
      setError(payload?.error ?? 'Could not start mock interview.');
      return;
    }

    setSession(payload.session);
    setAnswer('');
    setStatus('Mock interview ready.');
  };

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session) {
      return;
    }

    setIsBusy(true);
    setStatus('Reviewing answer...');
    setError('');

    const response = await fetch('/api/interviews/mock/answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session,
        answer,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      session?: MockInterviewSession;
      error?: string;
    } | null;

    setIsBusy(false);

    if (!response.ok || !payload?.session) {
      setStatus('');
      setError(payload?.error ?? 'Could not review this answer.');
      return;
    }

    setSession(payload.session);
    setAnswer('');
    setStatus(
      payload.session.status === 'complete'
        ? 'Mock interview complete.'
        : 'Next question ready.',
    );
  };

  const saveSession = async () => {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setStatus('Saving mock interview...');
    setError('');

    const response = await fetch('/api/interviews/mock/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    setIsBusy(false);

    if (!response.ok) {
      setStatus('');
      setError(payload?.error ?? 'Could not save mock interview.');
      return;
    }

    setStatus('Mock interview saved.');
    router.refresh();
  };

  if (applications.length === 0) {
    return <p className="muted-copy">Create an application first.</p>;
  }

  return (
    <div className="stack-form">
      <div className="workflow-actions">
        <label className="field">
          <span>Application</span>
          <select
            disabled={Boolean(session) || isBusy}
            onChange={(event) => setApplicationId(event.target.value)}
            value={applicationId}
          >
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          disabled={isBusy || !applicationId}
          onClick={startSession}
          type="button"
        >
          {session ? 'Restart mock' : 'Start mock'}
        </button>
        {session ? (
          <StatusPill
            label={session.mode === 'openai' ? 'OpenAI' : 'Playbook fallback'}
            tone={session.mode === 'openai' ? 'accent' : 'warning'}
          />
        ) : null}
      </div>

      {session ? (
        <div className="stack-form">
          {activeTurn ? (
            <form className="stack-form" onSubmit={submitAnswer}>
              <div>
                <p className="panel-eyebrow">{activeTurn.focus}</p>
                <h3>{activeTurn.question}</h3>
              </div>
              <label className="field">
                <span>Answer</span>
                <textarea
                  disabled={isBusy}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={7}
                  value={answer}
                />
              </label>
              <button
                className="primary-button"
                disabled={isBusy || answer.trim().length === 0}
                type="submit"
              >
                Submit answer
              </button>
            </form>
          ) : (
            <div className="stack-form">
              <h3>Session complete</h3>
              <button
                className="primary-button"
                disabled={isBusy}
                onClick={saveSession}
                type="button"
              >
                Save to records
              </button>
            </div>
          )}

          {completedTurns.length > 0 ? (
            <div className="simple-list">
              {completedTurns.map((turn, index) => (
                <article className="list-row" key={turn.id}>
                  <div className="stack-form">
                    <strong>Round {index + 1}</strong>
                    <p>{turn.question}</p>
                    <p>{turn.answer}</p>
                    <p className="muted-copy">{turn.feedback}</p>
                    <p className="form-status">{turn.improvement}</p>
                  </div>
                  <StatusPill
                    label={`${turn.score ?? '-'} / 5`}
                    tone={(turn.score ?? 0) >= 4 ? 'success' : 'warning'}
                  />
                </article>
              ))}
            </div>
          ) : null}

          {session.knowledgeMatches.length > 0 ? (
            <div className="tag-row">
              {session.knowledgeMatches.slice(0, 4).map((match) => (
                <span className="tag" key={match.relativePath}>
                  {match.title}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {status ? <p className="form-status">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
