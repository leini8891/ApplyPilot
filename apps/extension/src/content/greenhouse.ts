import type {
  ExtensionMessage,
  PopupState,
  WorkerJobPlan,
} from '../shared/messages';
import {
  resolveChoiceQuestionAnswer,
  resolveTextQuestionAnswer,
} from './form-mapping';

type JobPlan = WorkerJobPlan;

type BootstrapPayload = {
  summary: {
    dailyTarget: number;
  };
  profile: {
    fullName: string;
    phone: string;
    email: string;
    location: string;
    yearsExperience?: number;
  } | null;
  preference?: {
    targetRoles?: string[];
    regions?: string[];
    minSalary?: number;
    salaryCurrency?: string;
    applicationSalaryAmount?: number;
    yearsExperienceOverride?: number | null;
    noticePeriodWeeks?: number | null;
    workAuthorization?: 'yes' | 'no' | 'unknown';
    requiresVisaSponsorship?: 'yes' | 'no' | 'unknown';
    willingToRelocate?: 'yes' | 'no' | 'unknown';
  } | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runState = {
  active: false,
  paused: false,
};

const contentScriptWindow = window as Window & {
  __applypilotGreenhouseListenerRegistered?: boolean;
  __applypilotGreenhouseAutoResumeStarted?: boolean;
};

const textOf = (element: Element | null | undefined) =>
  element?.textContent?.trim() ?? '';
const firstNonEmpty = (...values: Array<string | null | undefined>) =>
  values
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
const normalizeToken = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeDigits = (value: string) => value.replace(/[^\d]/g, '');

const isTransientRuntimeMessageError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /message channel closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(
    message,
  );
};

const sendRuntimeMessage = async <TResponse>(
  message: ExtensionMessage,
  retries = 2,
) => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return (await chrome.runtime.sendMessage(message)) as TResponse;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error('ApplyPilot runtime messaging failed.');
      if (!isTransientRuntimeMessageError(error) || attempt === retries) {
        throw lastError;
      }

      await sleep(250);
    }
  }

  throw lastError ?? new Error('ApplyPilot runtime messaging failed.');
};

const reportState = async (payload: Partial<PopupState>) => {
  try {
    await sendRuntimeMessage({
      type: 'applypilot:content-update',
      payload,
    } satisfies ExtensionMessage);
  } catch {
    // Keep the application flow moving even if popup state sync briefly drops.
  }
};

const fetchJson = async <T>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH'; body?: unknown },
) => {
  const response = (await sendRuntimeMessage({
    type: 'applypilot:api-request',
    path,
    method: init?.method,
    body: init?.body,
  } satisfies ExtensionMessage)) as
    | { ok?: true; data?: T }
    | { ok?: false; error?: string }
    | undefined;

  if (!response || response.ok !== true) {
    const errorMessage =
      response && 'error' in response ? response.error : undefined;
    throw new Error(errorMessage ?? 'ApplyPilot API request failed.');
  }

  return response.data as T;
};

const isVisible = (element: Element) => {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
};

const getApplicationForm = () =>
  document.querySelector<HTMLFormElement>(
    [
      'form#application-form',
      'form[action*="/jobs/"]',
      'form[action*="/job_applications"]',
      'form',
    ].join(', '),
  );

const getFormControls = () =>
  Array.from(
    (getApplicationForm() ?? document).querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input, select, textarea'),
  ).filter((element) => isVisible(element) && !element.disabled);

const getAssociatedLabelText = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) =>
  element.id
    ? textOf(document.querySelector(`label[for="${CSS.escape(element.id)}"]`))
    : '';

const getFieldContextText = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) =>
  normalizeToken(
    [
      getAssociatedLabelText(element),
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      textOf(element.closest('label')),
      textOf(element.closest('fieldset')?.querySelector('legend')),
      textOf(
        element.closest(
          '.field, .form-field, .application-question, .custom-question, .question, [data-qa*="question"]',
        ),
      ),
      element.name,
      element.id,
    ]
      .filter(Boolean)
      .join(' '),
  );

const setFieldValue = (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value',
  )?.set;
  descriptor?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
};

const triggerElementClick = (element: HTMLElement) => {
  element.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
  );
  element.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
  );
  element.click();
};

const isRequiredControl = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) =>
  element.required ||
  element.getAttribute('aria-required') === 'true' ||
  Boolean(element.closest('.required')) ||
  /\*/.test(
    firstNonEmpty(
      getAssociatedLabelText(element),
      textOf(element.closest('.field, .form-field')),
    ),
  );

const resolveGreenhouseTextAnswer = (
  context: string,
  preference?: BootstrapPayload['preference'] | null,
) =>
  resolveTextQuestionAnswer(context, preference, {
    salaryFallbackPeriod: 'annual',
  });

const getPreferredLocationValue = ({
  profile,
  preference,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
}) => firstNonEmpty(preference?.regions?.[0], profile?.location);

const fillStandardFields = (profile: BootstrapPayload['profile']) => {
  if (!profile) {
    return;
  }

  const fullName = profile.fullName?.trim() ?? '';
  const [firstName = '', ...restNames] = fullName.split(/\s+/);
  const lastName = restNames.join(' ');

  for (const control of getFormControls()) {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement
      ) ||
      control.value
    ) {
      continue;
    }

    const context = getFieldContextText(control);

    if (/email/.test(context) && profile.email) {
      setFieldValue(control, profile.email);
      continue;
    }

    if (/phone|mobile|telephone/.test(context) && profile.phone) {
      setFieldValue(control, profile.phone);
      continue;
    }

    if (/first name|given name/.test(context) && firstName) {
      setFieldValue(control, firstName);
      continue;
    }

    if (
      /last name|family name|surname/.test(context) &&
      (lastName || firstName)
    ) {
      setFieldValue(control, lastName || firstName);
      continue;
    }

    if (/full name|name/.test(context) && fullName) {
      setFieldValue(control, fullName);
    }
  }
};

const fillMappedTextFields = ({
  profile,
  preference,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
}) => {
  const preferredLocation = getPreferredLocationValue({ profile, preference });

  for (const control of getFormControls()) {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement
      ) ||
      control.value
    ) {
      continue;
    }

    if (control.type === 'file') {
      continue;
    }

    const context = getFieldContextText(control);

    if (/location|city|area/.test(context) && preferredLocation) {
      setFieldValue(control, preferredLocation);
      continue;
    }

    const inferred = resolveGreenhouseTextAnswer(context, preference);
    if (
      inferred.outcome === 'answer' &&
      /^(number|text|tel|search|url|email)?$/i.test(control.type || 'text')
    ) {
      setFieldValue(control, inferred.value);
    }
  }
};

const getRadioGroups = () => {
  const radios = getFormControls().filter(
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement && element.type === 'radio',
  );
  const groups = new Map<string, HTMLInputElement[]>();

  for (const radio of radios) {
    const groupKey =
      firstNonEmpty(
        radio.name,
        textOf(radio.closest('fieldset')?.querySelector('legend')),
        textOf(
          radio.closest(
            '.field, .form-field, .application-question, .custom-question',
          ),
        ),
        radio.id,
      ) || `radio-group-${groups.size}`;

    const current = groups.get(groupKey) ?? [];
    current.push(radio);
    groups.set(groupKey, current);
  }

  return Array.from(groups.values());
};

const getRadioLabelText = (radio: HTMLInputElement) =>
  normalizeToken(
    firstNonEmpty(
      textOf(radio.closest('label')),
      radio.id
        ? textOf(document.querySelector(`label[for="${CSS.escape(radio.id)}"]`))
        : '',
      radio.getAttribute('aria-label'),
      radio.value,
    ),
  );

const getRadioQuestionText = (radios: HTMLInputElement[]) =>
  normalizeToken(
    firstNonEmpty(
      textOf(radios[0]?.closest('fieldset')?.querySelector('legend')),
      textOf(
        radios[0]?.closest(
          '.field, .form-field, .application-question, .custom-question',
        ),
      ),
      radios[0]?.name,
    ),
  );

const fillMappedChoiceFields = (
  preference?: BootstrapPayload['preference'] | null,
) => {
  for (const control of getFormControls()) {
    if (!(control instanceof HTMLSelectElement) || control.value) {
      continue;
    }

    const answer = resolveChoiceQuestionAnswer({
      questionText: getFieldContextText(control),
      choiceLabels: Array.from(control.options).map((option) =>
        firstNonEmpty(option.label, option.text, option.value),
      ),
      preference,
      salaryFallbackPeriod: 'annual',
    });

    if (answer.outcome === 'answer' && control.options[answer.optionIndex]) {
      control.selectedIndex = answer.optionIndex;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  for (const radios of getRadioGroups()) {
    if (radios.some((radio) => radio.checked)) {
      continue;
    }

    const answer = resolveChoiceQuestionAnswer({
      questionText: getRadioQuestionText(radios),
      choiceLabels: radios.map(getRadioLabelText),
      preference,
      salaryFallbackPeriod: 'annual',
    });

    const radio =
      answer.outcome === 'answer' ? radios[answer.optionIndex] : null;
    if (radio) {
      triggerElementClick(radio);
    }
  }
};

const fillCurrentForm = ({
  profile,
  preference,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
}) => {
  fillStandardFields(profile);
  fillMappedTextFields({ profile, preference });
  fillMappedChoiceFields(preference);

  const unresolvedRequiredControls = getFormControls().filter((element) => {
    if (!isRequiredControl(element)) {
      return false;
    }

    if (element instanceof HTMLInputElement && element.type === 'radio') {
      return false;
    }

    if (element instanceof HTMLInputElement && element.type === 'file') {
      return !element.files?.length;
    }

    return (
      normalizeDigits(element.value).length === 0 &&
      element.value.trim().length === 0
    );
  });

  const unresolvedRequiredRadioGroups = getRadioGroups().filter(
    (radios) =>
      radios.some((radio) => isRequiredControl(radio)) &&
      !radios.some((radio) => radio.checked),
  );

  return (
    unresolvedRequiredControls.length === 0 &&
    unresolvedRequiredRadioGroups.length === 0
  );
};

const downloadResumeFile = async (url: string, preferredFileName: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  const fallbackName = `${preferredFileName.replace(/[^a-z0-9.]+/gi, '-').toLowerCase() || 'resume'}`;
  const fileName =
    fallbackName.endsWith('.pdf') || fallbackName.endsWith('.docx')
      ? fallbackName
      : `${fallbackName}.pdf`;

  return new File([blob], fileName, {
    type: blob.type || 'application/pdf',
  });
};

const uploadResumeIfNeeded = async ({
  resumeUrl,
  resumeFileName,
  jobTitle,
}: {
  resumeUrl: string | null;
  resumeFileName: string | null;
  jobTitle: string;
}) => {
  if (!resumeUrl) {
    return;
  }

  const fileInput =
    getApplicationForm()?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput || fileInput.files?.length) {
    return;
  }

  const file = await downloadResumeFile(resumeUrl, resumeFileName ?? jobTitle);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(800);
};

const findSubmitButton = () =>
  Array.from(
    (getApplicationForm() ?? document).querySelectorAll<HTMLElement>(
      'button[type="submit"], input[type="submit"], #submit_app',
    ),
  ).find(
    (element) => isVisible(element) && !element.hasAttribute('disabled'),
  ) ?? null;

const hasSuccessState = () =>
  /thank you for applying|application submitted|we have received your application|application received/i.test(
    textOf(document.body),
  );

const fetchBootstrap = () =>
  fetchJson<BootstrapPayload>('/api/dashboard/summary');

const postReview = async (attemptId: string, reason: string) => {
  await fetchJson(`/api/applications/${attemptId}/review`, {
    method: 'POST',
    body: { reason },
  });
};

const postStatus = async (attemptId: string, status: string) => {
  await fetchJson(`/api/applications/${attemptId}/status`, {
    method: 'PATCH',
    body: { status },
  });
};

const postReceipt = async (attemptId: string) => {
  const screenshot = (await sendRuntimeMessage<{
    dataUrl?: string;
  }>({
    type: 'applypilot:request-screenshot',
  } satisfies ExtensionMessage)) as { dataUrl?: string } | undefined;

  if (!screenshot?.dataUrl) {
    return;
  }

  await fetchJson(`/api/applications/${attemptId}/receipt`, {
    method: 'POST',
    body: {
      dataUrl: screenshot.dataUrl,
    },
  });
};

const processPlan = async ({
  plan,
  profile,
  preference,
}: {
  plan: JobPlan;
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
}) => {
  const form = getApplicationForm();
  if (!form) {
    const reason = 'Greenhouse application form was not found.';
    await postReview(plan.attempt.id, reason);
    await reportState({
      pendingReviewCount: 1,
      recentResult: reason,
    });
    return { ok: false as const, reason };
  }

  fillCurrentForm({ profile, preference });
  await uploadResumeIfNeeded({
    resumeUrl: plan.resumeUploadUrl ?? plan.tailoredResumeUrl,
    resumeFileName: plan.resumeFileName,
    jobTitle: plan.job.title,
  });

  const resolved = fillCurrentForm({ profile, preference });
  if (!resolved) {
    const reason = `Paused on Greenhouse required questions for ${plan.job.company}`;
    await postReview(plan.attempt.id, 'Unresolved required questions');
    await reportState({
      pendingReviewCount: 1,
      recentResult: reason,
    });
    return { ok: false as const, reason };
  }

  const submitButton = findSubmitButton();
  if (!submitButton) {
    const reason = 'Greenhouse submit action was not found.';
    await postReview(plan.attempt.id, reason);
    await reportState({
      pendingReviewCount: 1,
      recentResult: reason,
    });
    return { ok: false as const, reason };
  }

  triggerElementClick(submitButton);
  await sleep(2500);

  if (!hasSuccessState()) {
    const reason = `Manual Greenhouse finish needed for ${plan.job.company}`;
    await postReview(plan.attempt.id, reason);
    await reportState({
      pendingReviewCount: 1,
      recentResult: reason,
    });
    return { ok: false as const, reason };
  }

  await postStatus(plan.attempt.id, 'submitted');
  await postReceipt(plan.attempt.id);
  await reportState({
    dailySubmitted: 1,
    recentResult: `Submitted ${plan.job.title} at ${plan.job.company}`,
  });
  return { ok: true as const };
};

const slugify = (value: string) =>
  normalizeToken(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'greenhouse-role';

const extractCurrentJob = () => {
  const title = firstNonEmpty(
    textOf(document.querySelector('h1')),
    textOf(document.querySelector('[data-qa="job-title"]')),
    document.title.split('|')[0],
  );
  const company = firstNonEmpty(
    document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')
      ?.content,
    textOf(
      document.querySelector(
        '[data-qa="company-name"], .company-name, .app-title',
      ),
    ),
    document.title.split('|')[1],
    'Greenhouse company',
  );
  const location = firstNonEmpty(
    textOf(
      document.querySelector(
        '[data-qa="job-location"], .location, .job__location',
      ),
    ),
    textOf(document.querySelector('[class*="location"]')),
  );
  const description = firstNonEmpty(
    textOf(
      document.querySelector(
        '[data-qa="job-description"], .job__description, #content, main',
      ),
    ),
    textOf(document.body),
  );
  const externalJobId =
    window.location.pathname.match(/\/jobs\/([A-Za-z0-9-]+)/i)?.[1] ??
    new URLSearchParams(window.location.search).get('gh_jid') ??
    slugify(title);

  return {
    source: 'greenhouse' as const,
    externalJobId,
    title: title || 'Greenhouse role',
    company,
    location,
    url: window.location.href,
    description,
    easyApply: true,
    detectedQuestions: [],
  };
};

const startServerRun = async ({
  jobs,
  targetCount,
}: {
  jobs: Array<ReturnType<typeof extractCurrentJob>>;
  targetCount: number;
}) =>
  fetchJson<{
    run: { id: string };
    plans: JobPlan[];
  }>('/api/runs/start', {
    method: 'POST',
    body: {
      source: 'greenhouse',
      targetCount,
      jobs,
    },
  });

const runOnPage = async ({ targetCount }: { targetCount: number }) => {
  runState.active = true;
  runState.paused = false;

  await reportState({
    runStatus: 'running',
    recentResult: 'Scanning Greenhouse application page...',
  });

  const job = extractCurrentJob();
  const { run, plans } = await startServerRun({
    jobs: [job],
    targetCount: 1,
  });
  const plan = plans[0] ?? null;

  if (!plan) {
    throw new Error('No Greenhouse job could be queued from this page.');
  }

  await reportState({
    activeRunId: run.id,
    runStatus: 'running',
    recentResult: `Queued ${plan.job.title} on Greenhouse`,
  });

  const bootstrap = await fetchBootstrap();
  const result = await processPlan({
    plan,
    profile: bootstrap.profile,
    preference: bootstrap.preference,
  });

  await reportState({
    activeRunId: null,
    runStatus: result.ok ? 'completed' : 'failed',
    recentResult: result.ok ? 'Run completed' : result.reason,
  });
};

const executePlanOnCurrentPage = async ({
  plan,
}: {
  apiBaseUrl: string;
  plan: JobPlan;
}) => {
  const bootstrap = await fetchBootstrap();
  return processPlan({
    plan,
    profile: bootstrap.profile,
    preference: bootstrap.preference,
  });
};

const maybeResumePendingWorkerPlan = async () => {
  if (contentScriptWindow.__applypilotGreenhouseAutoResumeStarted) {
    return;
  }
  contentScriptWindow.__applypilotGreenhouseAutoResumeStarted = true;

  try {
    const pending = (await sendRuntimeMessage<{
      ok?: boolean;
      apiBaseUrl?: string;
      plan?: JobPlan;
    }>({
      type: 'applypilot:get-pending-worker-plan',
    } satisfies ExtensionMessage)) as
      | { ok?: boolean; apiBaseUrl?: string; plan?: JobPlan }
      | undefined;

    if (!pending?.ok || !pending.apiBaseUrl || !pending.plan) {
      return;
    }

    await reportState({
      runStatus: 'running',
      recentResult: `Continuing ${pending.plan.job.title} on Greenhouse`,
    });

    const result = await executePlanOnCurrentPage({
      apiBaseUrl: pending.apiBaseUrl,
      plan: pending.plan,
    });

    if (!result.ok) {
      throw new Error(result.reason);
    }

    await sendRuntimeMessage({
      type: 'applypilot:worker-plan-finished',
      status: 'completed',
    } satisfies ExtensionMessage);
  } catch (error) {
    const messageText =
      error instanceof Error
        ? error.message
        : 'Greenhouse worker run failed unexpectedly.';

    try {
      await sendRuntimeMessage({
        type: 'applypilot:worker-plan-finished',
        status: 'failed',
        error: messageText,
      } satisfies ExtensionMessage);
    } catch {
      // Keep the worker tab visible for manual recovery if the background channel tears down.
    }
  }
};

if (!contentScriptWindow.__applypilotGreenhouseListenerRegistered) {
  contentScriptWindow.__applypilotGreenhouseListenerRegistered = true;

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      void (async () => {
        if (message.type === 'applypilot:ping') {
          sendResponse({ ok: true });
          return;
        }

        if (message.type === 'applypilot:collect-current-job-on-page') {
          sendResponse({ ok: true, job: extractCurrentJob() });
          return;
        }

        if (message.type === 'applypilot:start-run-on-page') {
          try {
            await runOnPage({
              targetCount: message.targetCount,
            });
            sendResponse({ ok: true });
          } catch (error) {
            const messageText =
              error instanceof Error
                ? error.message
                : 'ApplyPilot could not run on this Greenhouse page.';
            await reportState({
              runStatus: 'failed',
              recentResult: messageText,
            });
            sendResponse({ ok: false, error: messageText });
          }
          return;
        }

        if (message.type === 'applypilot:execute-plan-on-page') {
          try {
            const result = await executePlanOnCurrentPage({
              apiBaseUrl: message.apiBaseUrl,
              plan: message.plan,
            });
            sendResponse(
              result.ok ? { ok: true } : { ok: false, error: result.reason },
            );
          } catch (error) {
            sendResponse({
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Greenhouse execution failed.',
            });
          }
          return;
        }

        if (message.type === 'applypilot:pause-run-on-page') {
          runState.paused = true;
          runState.active = false;
          sendResponse({ ok: true });
          return;
        }
      })();

      return true;
    },
  );
}

void maybeResumePendingWorkerPlan();
