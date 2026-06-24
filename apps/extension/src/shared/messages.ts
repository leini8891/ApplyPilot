export type PopupState = {
  runStatus: 'idle' | 'running' | 'paused' | 'failed' | 'completed';
  dailySubmitted: number;
  pendingReviewCount: number;
  recentResult: string;
  activeRunId: string | null;
};

export type WorkerJobPlan = {
  attempt: {
    id: string;
    status: string;
    jobPostingId: string;
  };
  job: {
    id: string;
    externalJobId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    easyApply: boolean;
    detectedQuestions: string[];
  };
  tailoredResumeUrl: string | null;
  resumeUploadUrl: string | null;
  resumeFileName: string | null;
  reviewReasons: string[];
};

export type ExtensionMessage =
  | { type: 'applypilot:get-state' }
  | { type: 'applypilot:start-run'; targetCount: number }
  | { type: 'applypilot:pause-run' }
  | { type: 'applypilot:ping' }
  | {
      type: 'applypilot:api-request';
      path: string;
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
      body?: unknown;
    }
  | {
      type: 'applypilot:content-update';
      payload: Partial<PopupState>;
    }
  | {
      type: 'applypilot:request-screenshot';
    }
  | {
      type: 'applypilot:collect-run-plans-on-page';
      targetCount: number;
      apiBaseUrl: string;
    }
  | {
      type: 'applypilot:collect-current-job-on-page';
    }
  | {
      type: 'applypilot:start-run-on-page';
      targetCount: number;
      apiBaseUrl: string;
      sourceTabId: number;
    }
  | {
      type: 'applypilot:execute-plan-on-page';
      apiBaseUrl: string;
      plan: WorkerJobPlan;
    }
  | {
      type: 'applypilot:run-plan-in-worker-tab';
      apiBaseUrl: string;
      plan: WorkerJobPlan;
      sourceTabId: number;
    }
  | {
      type: 'applypilot:get-pending-worker-plan';
    }
  | {
      type: 'applypilot:worker-plan-finished';
      status: 'completed' | 'failed';
      error?: string;
    }
  | {
      type: 'applypilot:pause-run-on-page';
    };
