import Link from 'next/link';
import { redirect } from 'next/navigation';

import { hasSupabaseConfig } from '@/lib/env';
import { resolveSupabaseAuthContext } from '@/server/auth';

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string | string[];
  }>;
};

const normalizeMessage = (message?: string | string[]) =>
  Array.isArray(message) ? message[0] : message;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const auth = await resolveSupabaseAuthContext();

  if (auth && !auth.isLocalMode) {
    redirect('/');
  }

  const params = await searchParams;
  const message = normalizeMessage(params?.message);

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">ApplyPilot</p>
        <h1>Sign in to your workspace</h1>
        <p className="muted-copy">
          Each account gets its own profile, resumes, application tracker, and
          storage paths.
        </p>

        {hasSupabaseConfig ? (
          <form className="stack-form" method="post">
            <label className="field">
              <span>Email</span>
              <input autoComplete="email" name="email" required type="email" />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                minLength={6}
                name="password"
                required
                type="password"
              />
            </label>

            <div className="auth-actions">
              <button
                className="primary-button"
                formAction="/auth/login"
                type="submit"
              >
                Sign in
              </button>
              <button
                className="ghost-link"
                formAction="/auth/signup"
                type="submit"
              >
                Create account
              </button>
            </div>

            {message ? <p className="form-status">{message}</p> : null}
          </form>
        ) : (
          <div className="stack-form">
            <p className="form-status">
              Local single-user mode is active because Supabase env is not
              configured.
            </p>
            <Link className="primary-button" href="/">
              Open ApplyPilot
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
