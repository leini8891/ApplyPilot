import type { ApplicationStatus, RunStatus } from '@applypilot/domain';

export const applicationTone = (status: ApplicationStatus) => {
  switch (status) {
    case 'submitted':
    case 'viewed':
    case 'interview':
    case 'offer':
      return 'success' as const;
    case 'needs_review':
    case 'queued':
    case 'drafted':
      return 'warning' as const;
    case 'failed':
    case 'rejected':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
};

export const runTone = (status: RunStatus) => {
  switch (status) {
    case 'running':
      return 'accent' as const;
    case 'completed':
      return 'success' as const;
    case 'paused':
      return 'warning' as const;
    case 'failed':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
};

export const humanizeStatus = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

