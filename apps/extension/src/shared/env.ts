import { resolveExtensionEnv } from '@applypilot/config';

export const extensionEnv = resolveExtensionEnv({
  VITE_DASHBOARD_URL: import.meta.env.VITE_DASHBOARD_URL,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_LINKEDIN_HOST_PATTERN: import.meta.env.VITE_LINKEDIN_HOST_PATTERN,
});

