import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'ApplyPilot',
  version: '0.1.0',
  description: 'Job application copilot for LinkedIn and MyCareersFuture',
  permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'cookies'],
  host_permissions: [
    'https://www.linkedin.com/*',
    'https://www.mycareersfuture.gov.sg/*',
    'https://agent.tinyfish.ai/*',
    'http://localhost:3000/*',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_title: 'ApplyPilot',
    default_popup: 'src/popup/index.html',
  },
  content_scripts: [
    {
      matches: ['https://www.linkedin.com/jobs/*'],
      js: ['src/content/linkedin.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://www.mycareersfuture.gov.sg/*'],
      js: ['src/content/mycareersfuture.ts'],
      run_at: 'document_idle',
    },
  ],
});
