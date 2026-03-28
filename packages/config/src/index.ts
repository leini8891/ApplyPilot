import { z } from 'zod';

export const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('applypilot-assets'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
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
