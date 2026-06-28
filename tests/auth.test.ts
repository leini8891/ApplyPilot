import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/server/auth';

const authMocks = vi.hoisted(() => ({
  requireRouteAuth: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    redirect: (url: string | URL, init?: number | ResponseInit) => {
      const status = typeof init === 'number' ? init : (init?.status ?? 307);

      return Response.redirect(url, status);
    },
  },
}));

vi.mock('@/server/auth', () => ({
  requireRouteAuth: authMocks.requireRouteAuth,
}));

import { withAuthenticatedRoute } from '../apps/web/src/app/api/_lib';
import {
  getDashboardData,
  savePreferences,
} from '../apps/web/src/server/services/app-service';
import { createAppStore, store } from '../apps/web/src/server/services/store';

const candidateId = `route-auth-test-${process.env.VITEST_WORKER_ID ?? '0'}`;

describe('authenticated API route wrapper', () => {
  beforeEach(() => {
    authMocks.requireRouteAuth.mockReset();
  });

  afterEach(async () => {
    await store.clearCandidateData(candidateId);
  });

  it('redirects unauthenticated requests before invoking the route callback', async () => {
    const redirectResponse = Response.redirect(
      new URL('/login', 'http://localhost/api/private'),
      307,
    );
    const callback = vi.fn();

    authMocks.requireRouteAuth.mockResolvedValue({
      auth: null,
      response: redirectResponse,
    });

    const response = await withAuthenticatedRoute(
      new Request('http://localhost/api/private'),
      callback,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
    expect(callback).not.toHaveBeenCalled();
  });

  it('runs authenticated callbacks inside the request store context', async () => {
    const appStore = createAppStore(null);
    const auth: AuthContext = {
      candidateId,
      email: 'person@example.com',
      isLocalMode: false,
      store: appStore,
      supabase: null,
    };

    authMocks.requireRouteAuth.mockResolvedValue({
      auth,
      response: null,
    });

    const response = await withAuthenticatedRoute(
      new Request('http://localhost/api/preferences'),
      async ({ candidateId: authedCandidateId }) => {
        await savePreferences({
          candidateId: authedCandidateId,
          input: {
            targetRoles: ['Product Manager'],
            keywords: ['workflow'],
          },
        });

        const snapshot = await getDashboardData(authedCandidateId);

        return {
          candidateId: authedCandidateId,
          targetRoles: snapshot.preference?.targetRoles,
        };
      },
    );

    await expect(response.json()).resolves.toEqual({
      candidateId,
      targetRoles: ['Product Manager'],
    });
  });
});
