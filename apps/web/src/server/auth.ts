import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { demoCandidateProfile } from '@applypilot/domain';

import { env, hasSupabaseConfig, supabasePublicKey } from '@/lib/env';
import { createAppStore, type AppStore } from '@/server/services/store';

export type AuthContext = {
  candidateId: string;
  email: string | null;
  isLocalMode: boolean;
  store: AppStore;
  supabase: SupabaseClient | null;
};

export const localModeCandidateId = demoCandidateProfile.id;

const getSupabaseUrlAndKey = () => {
  if (
    !hasSupabaseConfig ||
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !supabasePublicKey
  ) {
    return null;
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: supabasePublicKey,
  };
};

export const createServerSupabaseClient = async () => {
  const config = getSupabaseUrlAndKey();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always set cookies; middleware refreshes sessions.
        }
      },
    },
  });
};

const getLocalAuthContext = (): AuthContext => ({
  candidateId: localModeCandidateId,
  email: null,
  isLocalMode: true,
  store: createAppStore(null),
  supabase: null,
});

export const resolveSupabaseAuthContext =
  async (): Promise<AuthContext | null> => {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return getLocalAuthContext();
    }

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return null;
    }

    return {
      candidateId: data.claims.sub,
      email: typeof data.claims.email === 'string' ? data.claims.email : null,
      isLocalMode: false,
      store: createAppStore(supabase),
      supabase,
    };
  };

export const requirePageAuth = async () => {
  const auth = await resolveSupabaseAuthContext();

  if (!auth) {
    redirect('/login');
  }

  return auth;
};

export const requireRouteAuth = async (request: Request) => {
  const auth = await resolveSupabaseAuthContext();

  if (!auth) {
    return {
      auth: null,
      response: NextResponse.redirect(new URL('/login', request.url)),
    };
  }

  return {
    auth,
    response: null,
  };
};
