import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, hasSupabaseConfig } from './env';

let cachedClient: SupabaseClient | null = null;

export const getSupabaseAdminClient = () => {
  if (!hasSupabaseConfig) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return cachedClient;
};
