import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().optional(),
);

const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().url().optional(),
);

export const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.string().default('applypilot-assets'),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  ADZUNA_APP_ID: optionalString,
  ADZUNA_APP_KEY: optionalString,
  ADZUNA_COUNTRY: z
    .preprocess(emptyStringToUndefined, z.string().min(2).max(2).default('sg'))
    .transform((value) => value.toLowerCase()),
  ADZUNA_BASE_URL: z
    .preprocess(
      emptyStringToUndefined,
      z.string().url().default('https://api.adzuna.com/v1/api'),
    )
    .transform((value) => value.replace(/\/+$/, '')),
  APPLYPILOT_LOCAL_STORE_PATH: optionalString,
  ENABLE_DEMO_DATA: z.string().optional().transform((value) => value !== 'false'),
});

export const extensionEnvSchema = z.object({
  VITE_DASHBOARD_URL: z.string().url().default('http://localhost:3000'),
  VITE_API_BASE_URL: z.string().url().default('http://localhost:3000'),
  VITE_LINKEDIN_HOST_PATTERN: z.string().default('https://www.linkedin.com/*'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type ExtensionEnv = z.infer<typeof extensionEnvSchema>;

export const resolveWebEnv = (source: Record<string, string | undefined>): WebEnv =>
  webEnvSchema.parse(source);

export const resolveExtensionEnv = (source: Record<string, string | undefined>): ExtensionEnv =>
  extensionEnvSchema.parse(source);
