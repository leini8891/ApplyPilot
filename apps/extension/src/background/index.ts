import type { ExtensionMessage, PopupState, WorkerJobPlan } from '../shared/messages';
import { extensionEnv } from '../shared/env';
const SUPPORTED_JOB_HOSTS = ['linkedin.com/jobs', 'mycareersfuture.gov.sg'] as const;
const PENDING_WORKER_RUNS_KEY = 'applypilot-pending-worker-runs';

const defaultState: PopupState = {
  runStatus: 'idle',
  dailySubmitted: 0,
  pendingReviewCount: 0,
  recentResult: 'No activity yet',
  activeRunId: null,
};

const getState = async () => {
  const result = await chrome.storage.local.get(['applypilot-state']);
  return (result['applypilot-state'] as PopupState | undefined) ?? defaultState;
};

type PendingWorkerRun = {
  apiBaseUrl: string;
  sourceTabId: number;
  plan: WorkerJobPlan;
};

const getPendingWorkerRuns = async () => {
  const result = await chrome.storage.local.get([PENDING_WORKER_RUNS_KEY]);
  return (result[PENDING_WORKER_RUNS_KEY] as Record<string, PendingWorkerRun> | undefined) ?? {};
};

const savePendingWorkerRuns = async (runs: Record<string, PendingWorkerRun>) => {
  await chrome.storage.local.set({
    [PENDING_WORKER_RUNS_KEY]: runs,
  });
};

const setPendingWorkerRun = async (tabId: number, run: PendingWorkerRun) => {
  const runs = await getPendingWorkerRuns();
  runs[String(tabId)] = run;
  await savePendingWorkerRuns(runs);
};

const clearPendingWorkerRun = async (tabId: number) => {
  const runs = await getPendingWorkerRuns();
  delete runs[String(tabId)];
  await savePendingWorkerRuns(runs);
};

const saveState = async (patch: Partial<PopupState>) => {
  const nextState = {
    ...(await getState()),
    ...patch,
  };

  await chrome.storage.local.set({
    'applypilot-state': nextState,
  });

  await chrome.action.setBadgeText({
    text: nextState.pendingReviewCount > 0 ? String(nextState.pendingReviewCount) : '',
  });
  await chrome.action.setBadgeBackgroundColor({
    color: nextState.pendingReviewCount > 0 ? '#aa6a17' : '#1b6b5c',
  });

  return nextState;
};

const proxyApiRequest = async ({
  path,
  method = 'GET',
  body,
}: {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
}) => {
  const response = await fetch(`${extensionEnv.VITE_API_BASE_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response
    .json()
    .catch(() => ({ error: `Request failed: ${response.status}` }));

  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof payload?.error === 'string' ? payload.error : `Request failed: ${response.status}`,
    };
  }

  return {
    ok: true,
    data: payload,
  };
};

const apiRequest = async <T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
    body?: unknown;
  },
) => {
  const response = await proxyApiRequest({
    path,
    method: init?.method,
    body: init?.body,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data as T;
};

const isSupportedJobUrl = (url?: string | null) =>
  Boolean(url && SUPPORTED_JOB_HOSTS.some((host) => url.includes(host)));

const getActiveSupportedTab = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return isSupportedJobUrl(tab?.url) ? tab : null;
};

const startRunOnCurrentPage = async ({
  activeTabId,
  targetCount,
}: {
  activeTabId: number;
  targetCount: number;
}) => {
  const response = await sendMessageToTab<{ ok?: boolean; error?: string }>(activeTabId, {
    type: 'applypilot:start-run-on-page',
    targetCount,
    apiBaseUrl: extensionEnv.VITE_API_BASE_URL,
    sourceTabId: activeTabId,
  } satisfies ExtensionMessage);

  if (!response?.ok) {
    throw new Error(
      response?.error ?? 'ApplyPilot did not receive a start confirmation from the page.',
    );
  }
};

const startLocalRunWithRetry = async ({
  activeTabId,
  targetCount,
}: {
  activeTabId: number;
  targetCount: number;
}) => {
  try {
    await startRunOnCurrentPage({
      activeTabId,
      targetCount,
    });
  } catch (error) {
    if (!shouldReloadJobSiteTab(error)) {
      throw error;
    }

    await saveState({
      runStatus: 'running',
      recentResult: 'Refreshing the job site page to attach ApplyPilot...',
    });
    await chrome.tabs.reload(activeTabId);
    await waitForTabComplete(activeTabId);
    await startRunOnCurrentPage({
      activeTabId,
      targetCount,
    });
  }
};

const isSupportedJobTab = (tab: chrome.tabs.Tab | null | undefined) =>
  Boolean(tab?.id && isSupportedJobUrl(tab.url));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const matchesContentScriptPattern = (url: string, pattern: string) => {
  if (pattern === 'https://www.linkedin.com/jobs/*') {
    return url.startsWith('https://www.linkedin.com/jobs/');
  }

  if (pattern === 'https://www.mycareersfuture.gov.sg/*') {
    return url.startsWith('https://www.mycareersfuture.gov.sg/');
  }

  return false;
};

const getContentScriptFilesForUrl = (url: string) =>
  chrome.runtime
    .getManifest()
    .content_scripts?.filter((contentScript) =>
      (contentScript.matches ?? []).some((pattern) => matchesContentScriptPattern(url, pattern)),
    )
    .flatMap((contentScript) => contentScript.js ?? [])
    .filter((file): file is string => typeof file === 'string' && file.length > 0) ?? [];

const ensureContentScriptInjected = async (tabId: number) => {
  const tab = await chrome.tabs.get(tabId);
  const files = tab.url ? getContentScriptFilesForUrl(tab.url) : [];
  if (files.length === 0) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });
  await sleep(250);
};

const canRetryByInjecting = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /receiving end does not exist|could not establish connection/i.test(message);
};

const shouldReloadJobSiteTab = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return canRetryByInjecting(error) || /could not attach/i.test(message);
};

const waitForTabComplete = (tabId: number, timeoutMs = 15000) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error('Timed out while reloading the job site page.'));
    }, timeoutMs);

    const handleUpdate = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (updatedTabId !== tabId) {
        return;
      }

      if (changeInfo.status === 'complete' && isSupportedJobUrl(tab.url)) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(handleUpdate);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(handleUpdate);
  });

const sendMessageToTab = async <TResponse>(
  tabId: number,
  message: ExtensionMessage,
) => {
  let lastError: Error | null = null;
  let injectionAttempted = false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown tab messaging error');
      if (!injectionAttempted && canRetryByInjecting(error)) {
        injectionAttempted = true;

        try {
          await ensureContentScriptInjected(tabId);
          continue;
        } catch (injectError) {
          lastError =
            injectError instanceof Error ? injectError : new Error('Could not inject ApplyPilot into this tab.');
        }
      }

      await sleep(400);
    }
  }

  throw lastError ?? new Error('ApplyPilot could not attach to this job site page.');
};

const buildWorkerJobUrl = (plan: WorkerJobPlan, sourceTabUrl?: string) => {
  return plan.job.url?.startsWith('https://www.linkedin.com/jobs/')
    ? plan.job.url
    : sourceTabUrl && sourceTabUrl.includes('mycareersfuture.gov.sg')
      ? plan.job.url
      : `https://www.linkedin.com/jobs/view/${plan.job.externalJobId}/`;
};

const pendingWorkerCompletions = new Map<
  number,
  {
    resolve: (value: { ok: true }) => void;
    reject: (error: Error) => void;
  }
>();

const runPlanInWorkerTab = async ({
  apiBaseUrl,
  sourceTabId,
  plan,
}: {
  apiBaseUrl: string;
  sourceTabId: number;
  plan: WorkerJobPlan;
}) => {
  const sourceTab = await chrome.tabs.get(sourceTabId);
  const workerTab = await chrome.tabs.create({
    url: buildWorkerJobUrl(plan, sourceTab.url),
    active: true,
    windowId: sourceTab.windowId,
    index: typeof sourceTab.index === 'number' ? sourceTab.index + 1 : undefined,
  });

  if (!workerTab?.id) {
    throw new Error(`Could not open a worker tab for ${plan.job.title}.`);
  }
  const workerTabId = workerTab.id;

  await setPendingWorkerRun(workerTabId, {
    apiBaseUrl,
    sourceTabId,
    plan,
  });

  if (workerTab.windowId !== undefined) {
    await chrome.tabs.update(workerTabId, { active: true });
  }

  let completedSuccessfully = false;
  const completionPromise = new Promise<{ ok: true }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingWorkerCompletions.delete(workerTabId);
      reject(new Error(`Timed out while applying to ${plan.job.title}.`));
    }, 180000);

    pendingWorkerCompletions.set(workerTabId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
  });

  try {
    await waitForTabComplete(workerTabId);
    await completionPromise;
    completedSuccessfully = true;
  } finally {
    pendingWorkerCompletions.delete(workerTabId);
    await clearPendingWorkerRun(workerTabId);

    try {
      if (completedSuccessfully) {
        await chrome.tabs.remove(workerTabId);
      } else {
        await chrome.tabs.update(workerTabId, { active: true });
      }
    } catch {
      // Ignore tab focus/cleanup failures if the target tab disappeared.
    }

    if (completedSuccessfully) {
      try {
        await chrome.tabs.update(sourceTabId, { active: true });
      } catch {
        // Ignore refocus failures if the source tab disappeared.
      }
    }
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    'applypilot-state': defaultState,
  });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === 'applypilot:get-state') {
        sendResponse(await getState());
        return;
      }

      if (message.type === 'applypilot:ping') {
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'applypilot:api-request') {
        sendResponse(
          await proxyApiRequest({
            path: message.path,
            method: message.method,
            body: message.body,
          }),
        );
        return;
      }

      if (message.type === 'applypilot:content-update') {
        const current = await getState();
        sendResponse(
          await saveState({
            ...message.payload,
            dailySubmitted:
              typeof message.payload.dailySubmitted === 'number'
                ? current.dailySubmitted + message.payload.dailySubmitted
                : current.dailySubmitted,
            pendingReviewCount:
              typeof message.payload.pendingReviewCount === 'number'
                ? current.pendingReviewCount + message.payload.pendingReviewCount
                : current.pendingReviewCount,
          }),
        );
        return;
      }

      if (message.type === 'applypilot:request-screenshot') {
        const dataUrl = await chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, {
          format: 'png',
        });
        sendResponse({ dataUrl });
        return;
      }

      if (message.type === 'applypilot:start-run') {
        const activeTab = await getActiveSupportedTab();
        if (!isSupportedJobTab(activeTab)) {
          sendResponse({ ok: false, error: 'Open a LinkedIn or MyCareersFuture job page first.' });
          return;
        }
        const activeTabId = activeTab?.id;

        if (activeTabId === undefined) {
          sendResponse({ ok: false, error: 'Could not resolve the active job-site tab.' });
          return;
        }

        const targetCount = Math.max(1, Math.min(50, Math.round(message.targetCount || 1)));

        await saveState({
          runStatus: 'running',
          pendingReviewCount: 0,
          recentResult:
            targetCount > 1 ? `Preparing batch run for up to ${targetCount} jobs` : 'Preparing application run',
        });

        try {
          await startLocalRunWithRetry({
            activeTabId,
            targetCount,
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'ApplyPilot could not start this run.';
          await saveState({
            runStatus: 'failed',
            recentResult: messageText,
          });
          sendResponse({
            ok: false,
            error: messageText,
          });
          return;
        }

        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'applypilot:run-plan-in-worker-tab') {
        if (message.sourceTabId === undefined) {
          sendResponse({ ok: false, error: 'Could not determine the source job-site tab.' });
          return;
        }

        try {
          await runPlanInWorkerTab({
            apiBaseUrl: message.apiBaseUrl,
            sourceTabId: message.sourceTabId,
            plan: message.plan,
          });
          sendResponse({ ok: true });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'ApplyPilot could not run this job in a worker tab.';
          sendResponse({ ok: false, error: messageText });
        }
        return;
      }

      if (message.type === 'applypilot:get-pending-worker-plan') {
        const senderTabId = _sender.tab?.id;
        if (senderTabId === undefined) {
          sendResponse({ ok: false });
          return;
        }

        const runs = await getPendingWorkerRuns();
        const run = runs[String(senderTabId)];
        if (!run) {
          sendResponse({ ok: false });
          return;
        }

        sendResponse({
          ok: true,
          apiBaseUrl: run.apiBaseUrl,
          plan: run.plan,
          sourceTabId: run.sourceTabId,
        });
        return;
      }

      if (message.type === 'applypilot:worker-plan-finished') {
        const senderTabId = _sender.tab?.id;
        if (senderTabId === undefined) {
          sendResponse({ ok: false, error: 'Could not resolve the worker tab.' });
          return;
        }

        const completion = pendingWorkerCompletions.get(senderTabId);
        if (!completion) {
          sendResponse({ ok: false, error: 'No pending worker run was registered for this tab.' });
          return;
        }

        if (message.status === 'completed') {
          completion.resolve({ ok: true });
          sendResponse({ ok: true });
          return;
        }

        completion.reject(new Error(message.error ?? 'ApplyPilot worker run failed.'));
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'applypilot:pause-run') {
        const tabs = await chrome.tabs.query({
          currentWindow: true,
          url: ['https://www.linkedin.com/jobs/*', 'https://www.mycareersfuture.gov.sg/*'],
        });

        for (const tab of tabs) {
          if (!tab.id) {
            continue;
          }

          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'applypilot:pause-run-on-page',
            } satisfies ExtensionMessage);
          } catch {
            // Ignore missing content script when a run has already ended or the page re-rendered.
          }
        }

        sendResponse(
          await saveState({
            runStatus: 'paused',
            recentResult: 'Run paused from popup',
          }),
        );
        return;
      }

      sendResponse({ ok: false, error: 'Unsupported ApplyPilot message.' });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'ApplyPilot background handling failed unexpectedly.';
      try {
        sendResponse({ ok: false, error: messageText });
      } catch {
        // Ignore send failures after the channel has already closed.
      }
    }
  })();

  return true;
});
