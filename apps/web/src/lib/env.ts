import { resolveWebEnv } from '@applypilot/config';

export const env = resolveWebEnv(process.env);

export const supabasePublicKey =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  null;

export const hasSupabaseConfig = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && supabasePublicKey,
);

export const hasSupabaseServiceRoleConfig = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL &&
  (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
);
