import { resolveWebEnv } from '@applypilot/config';

export const env = resolveWebEnv(process.env);

export const hasSupabaseConfig = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL &&
    (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
);
