import type { ExtensionMessage, PopupState, WorkerJobPlan } from '../shared/messages';
import {
  detectMcfFlowStage,
  elementLabel,
  findPrimaryMcfFlowAction,
  isDisabledElement,
  isVisibleElement,
} from './mycareersfuture-flow';

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
  } | null;
  preference?: {
    regions?: string[];
    minSalary?: number;
    salaryCurrency?: string;
  } | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runState = {
  active: false,
  paused: false,
};

const contentScriptWindow = window as Window & {
  __applypilotMyCareersFutureListenerRegistered?: boolean;
  __applypilotMyCareersFutureAutoResumeStarted?: boolean;
};

const textOf = (element: Element | null | undefined) => element?.textContent?.trim() ?? '';
const firstNonEmpty = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
const normalizeToken = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeDigits = (value: string) => value.replace(/[^\d]/g, '');
const toAbsoluteUrl = (value: string) => {
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return '';
  }
};

const isVisible = isVisibleElement;
const isDisabled = isDisabledElement;

const isTransientRuntimeMessageError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /message channel closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(
    message,
  );
};

const sendRuntimeMessage = async <TResponse>(message: ExtensionMessage, retries = 2) => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return (await chrome.runtime.sendMessage(message)) as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('ApplyPilot runtime messaging failed.');
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
    // Keep the visible application flow moving even if the popup state sync drops briefly.
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
    const errorMessage = response && 'error' in response ? response.error : undefined;
    throw new Error(errorMessage ?? 'ApplyPilot API request failed.');
  }

  return response.data as T;
};

const triggerElementClick = (element: HTMLElement) => {
  element.scrollIntoView({
    block: 'center',
    inline: 'center',
  });
  element.focus?.();
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  element.click();
};

const getVisibleDialogs = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], .modal, .drawer, .chakra-modal__content'))
    .filter((dialog) => isVisible(dialog));

const getApplicationContainer = () => {
  const dialogs = getVisibleDialogs();
  if (dialogs.length > 0) {
    return dialogs.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    })[0] ?? null;
  }

  return (
    document.querySelector<HTMLElement>('main, form, [role="main"], article') ??
    document.body
  );
};

const getFormControlsFor = (container: ParentNode) =>
  Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ),
  ).filter((element) => isVisible(element) && !element.disabled);

const getFormControls = () => getFormControlsFor(getApplicationContainer() ?? document);

const getFieldContextText = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) =>
  normalizeToken(
    firstNonEmpty(
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.id ? textOf(document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) : '',
      textOf(element.closest('label')),
      textOf(element.closest('fieldset')?.querySelector('legend')),
      textOf(element.closest('[data-testid], [class*="field"], [class*="input"], [class*="question"]')),
      element.name,
    ),
  );

const setFieldValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  descriptor?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
};

const isRequiredControl = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) => element.required || element.getAttribute('aria-required') === 'true';

const fillStandardFields = (profile: BootstrapPayload['profile']) => {
  if (!profile) {
    return;
  }

  const controls = getFormControls();
  const fullName = profile.fullName?.trim() ?? '';
  const [firstName = '', ...restNames] = fullName.split(/\s+/);
  const lastName = restNames.join(' ');

  for (const control of controls) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      continue;
    }

    if (control.value) {
      continue;
    }

    const context = getFieldContextText(control);

    if (/email/.test(context) && profile.email) {
      setFieldValue(control, profile.email);
      continue;
    }

    if (/phone|mobile|contact number/.test(context) && profile.phone) {
      setFieldValue(control, profile.phone);
      continue;
    }

    if (/full name|name/.test(context) && fullName) {
      setFieldValue(control, fullName);
      continue;
    }

    if (/first name|given name/.test(context) && firstName) {
      setFieldValue(control, firstName);
      continue;
    }

    if (/last name|family name|surname/.test(context) && (lastName || firstName)) {
      setFieldValue(control, lastName || firstName);
      continue;
    }
  }
};

const getPreferredLocationValue = ({
  profile,
  preference,
  jobLocation,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) =>
  firstNonEmpty(
    preference?.regions?.[0],
    jobLocation,
    profile?.location,
    'Singapore',
  );

const getPreferredSalaryValue = (preference?: BootstrapPayload['preference'] | null) => {
  if (typeof preference?.minSalary === 'number') {
    return String(preference.minSalary);
  }

  return '10000';
};

const inferYearsAnswer = (context: string) => {
  const normalized = normalizeToken(context);
  if (!normalized) {
    return '';
  }

  if (/notice period/.test(normalized)) {
    return '2';
  }

  if (/salary|pay|compensation/.test(normalized)) {
    return '10000';
  }

  if (/year|experience/.test(normalized)) {
    return '5';
  }

  return '1';
};

const fillKnownTextFields = ({
  profile,
  preference,
  jobLocation,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) => {
  const preferredLocation = getPreferredLocationValue({ profile, preference, jobLocation });
  const preferredSalary = getPreferredSalaryValue(preference);

  for (const control of getFormControls()) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      continue;
    }

    if (control.value) {
      continue;
    }

    const context = getFieldContextText(control);

    if (/location|city|area/.test(context) && preferredLocation) {
      setFieldValue(control, preferredLocation);
      continue;
    }

    if (/salary|pay|compensation|notice period/.test(context)) {
      setFieldValue(
        control,
        /notice period/.test(context) ? '2' : preferredSalary,
      );
      continue;
    }

    const inferred = inferYearsAnswer(context);
    if (inferred && /^(number|text|tel|search|url|email)?$/i.test(control.type || 'text')) {
      setFieldValue(control, inferred);
    }
  }
};

const getRadioGroups = () => {
  const radios = getFormControls().filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement && element.type === 'radio',
  );
  const groups = new Map<string, HTMLInputElement[]>();

  for (const radio of radios) {
    const groupKey =
      firstNonEmpty(
        radio.name,
        textOf(radio.closest('fieldset')?.querySelector('legend')),
        textOf(radio.closest('[data-testid], [class*="question"], [class*="field"]')),
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
      radio.id ? textOf(document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)) : '',
      radio.getAttribute('aria-label'),
      radio.value,
    ),
  );

const chooseRadioCandidate = (radios: HTMLInputElement[]) => {
  const questionText = normalizeToken(
    firstNonEmpty(
      textOf(radios[0]?.closest('fieldset')),
      textOf(radios[0]?.closest('[data-testid], [class*="question"], [class*="field"]')),
      radios[0]?.name,
    ),
  );

  const preferredTokens = /sponsor|sponsorship|visa|work authorization|work authorisation/.test(questionText)
    ? ['no']
    : /comfortable|onsite|on-site|willing|degree|education|completed/.test(questionText)
      ? ['yes', 'no']
      : ['yes', 'no'];

  for (const token of preferredTokens) {
    const candidate = radios.find((radio) => new RegExp(`\\b${token}\\b`).test(getRadioLabelText(radio)));
    if (candidate) {
      return candidate;
    }
  }

  return radios[0] ?? null;
};

const answerQuestions = () => {
  const controls = getFormControls();

  controls.forEach((element) => {
    if (element instanceof HTMLSelectElement && isRequiredControl(element) && !element.value) {
      element.selectedIndex = element.options.length > 1 ? 1 : 0;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  getRadioGroups().forEach((radios) => {
    if (radios.some((radio) => radio.checked)) {
      return;
    }

    const candidate = chooseRadioCandidate(radios);
    candidate?.click();
  });

  controls.forEach((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return;
    }

    if (element.value || element.type === 'file') {
      return;
    }

    const inferred = inferYearsAnswer(getFieldContextText(element));
    if (inferred) {
      setFieldValue(element, inferred);
    }
  });

  return controls.every((element) => {
    if (!isRequiredControl(element)) {
      return true;
    }

    if (element instanceof HTMLInputElement && ['radio', 'checkbox', 'file'].includes(element.type)) {
      return true;
    }

    return element.value.trim().length > 0;
  });
};

const fillCurrentStep = ({
  profile,
  preference,
  jobLocation,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) => {
  fillStandardFields(profile);
  fillKnownTextFields({ profile, preference, jobLocation });
  return answerQuestions();
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

  const container = getApplicationContainer() ?? document.body;
  const containerText = normalizeToken(textOf(container));
  const visibleActionLabels = Array.from(
    container.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
  )
    .filter((button) => isVisible(button))
    .map((button) => elementLabel(button))
    .join('|');

  const hasExistingResumeSelected =
    /select an existing resume/.test(containerText) &&
    (/\.pdf|\.docx?|uploaded|last used/.test(containerText) ||
      /next, review application|review application|next/.test(visibleActionLabels));
  const hasDuplicateResumeWarning = /file with the same name already exists|rename or upload a different file/.test(
    containerText,
  );

  if (hasExistingResumeSelected || hasDuplicateResumeWarning) {
    return;
  }

  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput || fileInput.files?.length) {
    return;
  }

  const response = await fetch(resumeUrl);
  const blob = await response.blob();
  const file = new File([blob], resumeFileName ?? `${jobTitle}.pdf`, {
    type: blob.type || 'application/pdf',
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(800);
};

const getVisibleActionButtons = (container: ParentNode = getApplicationContainer() ?? document.body) =>
  Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button) && !isDisabled(button))
    .filter((button) => !isNavigationLikeContainer(button));

const getResumeSelectionCandidate = ({
  resumeFileName,
}: {
  resumeFileName: string | null;
}) => {
  const container = getApplicationContainer() ?? document.body;
  const baseName = normalizeToken((resumeFileName ?? '').replace(/\.[a-z0-9]+$/i, ''));

  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>('label, button, [role="button"], li, div, article'),
  )
    .filter((element) => isVisible(element))
    .filter((element) => !isNavigationLikeContainer(element))
    .map((element) => {
      const label = normalizeToken(textOf(element));
      if (!label || label.length < 5) {
        return null;
      }

      const matchesFile =
        (baseName && label.includes(baseName)) ||
        /\.pdf|\.docx?|last used|uploaded/.test(label);
      if (!matchesFile) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        element,
        area: rect.width * rect.height,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => right.area - left.area);

  return candidates[0]?.element ?? null;
};

const ensureExistingResumeSelected = async ({
  resumeFileName,
}: {
  resumeFileName: string | null;
}) => {
  const container = getApplicationContainer() ?? document.body;
  const containerText = normalizeToken(textOf(container));
  if (!/upload resume|select an existing resume|resume/.test(containerText)) {
    return;
  }

  const nextButton = rankActionButtons(getVisibleActionButtons(container), [
    /^next,?\s*review application$/,
    /^next$/,
    /review application/,
    /continue/,
  ])[0]?.button;

  if (nextButton && !isDisabled(nextButton)) {
    return;
  }

  const candidate = getResumeSelectionCandidate({ resumeFileName });
  if (!candidate) {
    return;
  }

  triggerElementClick(candidate);
  await sleep(600);
};

const getExternalJobIdFromUrl = (value: string) => {
  try {
    const url = new URL(value, window.location.origin);
    const pathPart = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(-1)[0];

    return firstNonEmpty(
      url.searchParams.get('jobId'),
      pathPart,
      String(Date.now()),
    );
  } catch {
    return String(Date.now());
  }
};

const getCurrentJobExternalId = () => {
  const pathPart = window.location.pathname
    .split('/')
    .filter(Boolean)
    .slice(-1)[0];

  return firstNonEmpty(
    new URL(window.location.href).searchParams.get('jobId'),
    pathPart,
    String(Date.now()),
  );
};

const isSearchResultsPage = () => /\/search\/?$/.test(window.location.pathname);

const extractJobsFromSearchResults = (targetCount: number) => {
  const cards = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      [
        'a[data-testid="job-card-link"]',
        'a[class*="JobCard__card"]',
        'a[href*="/job/"]',
      ].join(', '),
    ),
  )
    .filter((card) => isVisible(card))
    .map((card) => {
      const url = toAbsoluteUrl(card.getAttribute('href') ?? card.href);
      if (!/mycareersfuture\.gov\.sg\/job\//i.test(url)) {
        return null;
      }

      const title = firstNonEmpty(
        textOf(card.querySelector('[data-testid="job-card__job-title"]')),
        textOf(card.querySelector('[class*="jobtitle"]')),
      );
      const company = firstNonEmpty(
        textOf(card.querySelector('[data-testid="company-hire-info"]')),
        textOf(card.querySelector('p')),
      );
      const location = firstNonEmpty(
        textOf(card.querySelector('[data-testid="job-card__location"]')),
        textOf(card.querySelector('[class*="location"]')),
      );
      const description = normalizeToken(textOf(card)).slice(0, 1200);

      if (!title) {
        return null;
      }

      return {
        source: 'mycareersfuture' as const,
        externalJobId: getExternalJobIdFromUrl(url),
        title,
        company: company || 'Unknown company',
        location,
        url,
        description,
        easyApply: true,
        detectedQuestions: [],
      };
    })
    .filter((job): job is NonNullable<typeof job> => Boolean(job));

  const deduped = Array.from(new Map(cards.map((job) => [job.url, job])).values());
  return deduped.slice(0, Math.max(targetCount, 1));
};

const getVisibleHeadings = () =>
  Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3')).filter((heading) => {
    const label = normalizeToken(textOf(heading));
    return isVisible(heading) && label.length > 3 && !/mycareersfuture|search|jobs/.test(label);
  });

const extractCurrentJob = () => {
  const headings = getVisibleHeadings();
  const titleHeading = headings[0] ?? null;
  const title = firstNonEmpty(textOf(titleHeading), document.title.replace(' | MyCareersFuture Singapore', ''), 'Untitled role');
  const company = firstNonEmpty(
    textOf(document.querySelector('a[href*="/companies/"]')),
    textOf(titleHeading?.parentElement?.querySelector('a, span, div')),
    'Unknown company',
  );
  const location = firstNonEmpty(
    textOf(
      Array.from(document.querySelectorAll<HTMLElement>('span, div, p')).find((node) =>
        isVisible(node) && /singapore|remote|hybrid|on-site|onsite/i.test(textOf(node)),
      ),
    ),
    '',
  );
  const description = firstNonEmpty(
    textOf(
      document.querySelector(
        'main, article, [role="main"], [data-testid*="job-description"], [class*="job-description"]',
      ),
    ),
    '',
  );

  return {
    source: 'mycareersfuture' as const,
    externalJobId: getCurrentJobExternalId(),
    title,
    company,
    location,
    url: window.location.href,
    description,
    easyApply: true,
    detectedQuestions: [],
  };
};

const fetchBootstrap = () => fetchJson<BootstrapPayload>('/api/dashboard/summary');

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
      source: 'mycareersfuture',
      targetCount,
      jobs,
    },
  });

const getPageFingerprint = () =>
  [window.location.href, textOf(document.querySelector('h1')), textOf(document.querySelector('[role="dialog"]'))].join('::');

const getFlowFingerprint = () => {
  const container = getApplicationContainer() ?? document.body;
  const title = firstNonEmpty(
    textOf(container.querySelector('h1')),
    textOf(container.querySelector('h2')),
  );
  const progress = Array.from(container.querySelectorAll('span, div'))
    .map((node) => textOf(node))
    .find((value) => /\d+\s*%/.test(value)) ?? '';
  const buttons = Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button))
    .map((button) => elementLabel(button))
    .join('|');

  return `${window.location.href}::${title}::${progress}::${buttons}`;
};

const waitForFlowChange = async (previousFingerprint: string, timeoutMs = 3500) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(250);
    const next = getFlowFingerprint();
    if (next !== previousFingerprint) {
      return next;
    }
  }

  return getFlowFingerprint();
};

const isJobDetailApplyLabel = (label: string) =>
  /^(apply|apply now|register interest|apply on company site)$/.test(normalizeToken(label));

const isNavigationLikeContainer = (element: HTMLElement) =>
  Boolean(
    element.closest(
      [
        'header',
        'nav',
        '[role="navigation"]',
        '[class*="header"]',
        '[class*="nav"]',
        '[class*="menu"]',
        '[class*="cookie"]',
        '[class*="banner"]',
      ].join(', '),
    ),
  );

const getApplyEntryButton = () => {
  const scopes = [
    document.querySelector<HTMLElement>('main article'),
    document.querySelector<HTMLElement>('main aside'),
    document.querySelector<HTMLElement>('main'),
    document.body,
  ].filter((scope): scope is HTMLElement => scope instanceof HTMLElement);

  for (const scope of scopes) {
    const candidates = Array.from(scope.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
      .filter((button) => isVisible(button) && !isDisabled(button))
      .filter((button) => !isNavigationLikeContainer(button))
      .filter((button) => isJobDetailApplyLabel(elementLabel(button)))
      .map((button) => {
        const label = normalizeToken(elementLabel(button));
        const rect = button.getBoundingClientRect();
        const score =
          Math.min(label.length, 100) +
          Math.min((rect.width * rect.height) / 100, 500) -
          rect.left / 10 -
          rect.top / 20;

        return { button, score };
      })
      .sort((left, right) => left.score - right.score);

    if (candidates[0]?.button) {
      return candidates[0].button;
    }
  }

  return null;
};

const isAlreadyInApplicationFlow = () => {
  const container = getApplicationContainer() ?? document.body;
  const text = normalizeToken(textOf(container)).slice(0, 6000);

  if (
    /applying for|step \d+ of \d+|review application|upload resume|next, review application|submit/i.test(
      text,
    )
  ) {
    return true;
  }

  return Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button))
    .some((button) =>
      /next, review application|review application|submit|change|upload resume|next/i.test(
        elementLabel(button),
      ),
    );
};

const waitForApplyEntryButton = async (timeoutMs = 12000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const button = getApplyEntryButton();
    if (button) {
      return button;
    }

    await sleep(300);
  }

  return getApplyEntryButton();
};

const ensureApplicationStarted = async () => {
  if (isAlreadyInApplicationFlow()) {
    return true;
  }

  const button = await waitForApplyEntryButton();
  if (!button) {
    return false;
  }

  const previousFingerprint = getPageFingerprint();
  triggerElementClick(button);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(400);
    if (getVisibleDialogs().length > 0 || getFormControls().length > 0 || getPageFingerprint() !== previousFingerprint) {
      return true;
    }
  }

  return false;
};

const rankActionButtons = (buttons: HTMLElement[], patterns: RegExp[]) =>
  buttons
    .map((button) => {
      const label = normalizeToken(elementLabel(button));
      const rect = button.getBoundingClientRect();
      const patternIndex = patterns.findIndex((pattern) => pattern.test(label));
      if (patternIndex === -1) {
        return null;
      }

      return {
        button,
        label,
        patternIndex,
        rect,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => {
      if (left.patternIndex !== right.patternIndex) {
        return left.patternIndex - right.patternIndex;
      }

      const verticalDelta = right.rect.top - left.rect.top;
      if (Math.abs(verticalDelta) > 8) {
        return verticalDelta;
      }

      return right.rect.left - left.rect.left;
    });

const clickPrimaryFlowAction = () => {
  const container = getApplicationContainer();
  if (!container) {
    return null;
  }
  const action = findPrimaryMcfFlowAction(container);
  if (!action) {
    return null;
  }

  return {
    button: action.button,
    kind: action.kind,
    stage: action.stage,
    rect: action.button.getBoundingClientRect(),
  };
};

const waitForPrimaryFlowAction = async ({
  resumeFileName,
  timeoutMs = 12000,
}: {
  resumeFileName: string | null;
  timeoutMs?: number;
}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const container = getApplicationContainer() ?? document.body;
    await ensureExistingResumeSelected({
      resumeFileName,
    });

    const action = clickPrimaryFlowAction();
    if (action) {
      return action;
    }

    // Sticky footer actions on MyCareersFuture often appear only after the page
    // settles and the viewport reaches the lower portion of the current step.
    if (container instanceof HTMLElement) {
      container.scrollTop = container.scrollHeight;
    }
    window.scrollTo(0, document.body.scrollHeight);

    await sleep(350);
  }

  return null;
};

const hasSuccessState = () => detectMcfFlowStage(getApplicationContainer() ?? document.body) === 'success';

const dismissSuccessState = async () => {
  const container = getApplicationContainer() ?? document.body;
  const button = Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .find((candidate) => isVisible(candidate) && /done|finish|close|完成|关闭/.test(elementLabel(candidate)));

  if (button) {
    triggerElementClick(button);
    await sleep(600);
  }
};

const postStatus = async (apiBaseUrl: string, attemptId: string, status: string) => {
  await fetchJson(`/api/applications/${attemptId}/status`, {
    method: 'PATCH',
    body: { status },
  });
};

const postReview = async (apiBaseUrl: string, attemptId: string, reason: string) => {
  await fetchJson(`/api/applications/${attemptId}/review`, {
    method: 'POST',
    body: { reason },
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
  apiBaseUrl,
  plan,
  profile,
  preference,
}: {
  apiBaseUrl: string;
  plan: JobPlan;
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
}) => {
  const flowStarted = await ensureApplicationStarted();
  if (!flowStarted) {
    const reason = 'MyCareersFuture apply flow did not open.';
    await postReview(apiBaseUrl, plan.attempt.id, reason);
    await reportState({
      runStatus: 'failed',
      pendingReviewCount: 1,
      recentResult: reason,
    });
    return {
      ok: false as const,
      reason,
    };
  }

  for (let step = 0; step < 8; step += 1) {
    fillCurrentStep({
      profile,
      preference,
      jobLocation: plan.job.location,
    });
    await uploadResumeIfNeeded({
      resumeUrl: plan.resumeUploadUrl ?? plan.tailoredResumeUrl,
      resumeFileName: plan.resumeFileName,
      jobTitle: plan.job.title,
    });

    if (hasSuccessState()) {
      await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
      await postReceipt(plan.attempt.id);
      await dismissSuccessState();
      await reportState({
        activeRunId: null,
        runStatus: 'completed',
        dailySubmitted: 1,
        recentResult: `Submitted ${plan.job.title} on MyCareersFuture`,
      });
      return {
        ok: true as const,
      };
    }

    const previousFingerprint = getFlowFingerprint();
    const action = await waitForPrimaryFlowAction({
      resumeFileName: plan.resumeFileName,
    });

    if (!action) {
      break;
    }

    triggerElementClick(action.button);

    await reportState({
      runStatus: 'running',
      recentResult:
        action.stage === 'resume'
          ? `Advancing ${plan.job.title}: Next, review application`
          : action.stage === 'review'
            ? `Advancing ${plan.job.title}: Submit`
            : `Advancing ${plan.job.title} on MyCareersFuture`,
    });

    const nextFingerprint = await waitForFlowChange(previousFingerprint, action.kind === 'submit' ? 5000 : 3500);
    if (nextFingerprint === previousFingerprint && action.kind !== 'submit') {
      fillCurrentStep({
        profile,
        preference,
        jobLocation: plan.job.location,
      });
      await sleep(500);
      const retryAction = await waitForPrimaryFlowAction({
        resumeFileName: plan.resumeFileName,
        timeoutMs: 5000,
      });
      if (retryAction) {
        triggerElementClick(retryAction.button);
        await waitForFlowChange(previousFingerprint, retryAction.kind === 'submit' ? 5000 : 3500);
      }
    }
  }

  if (hasSuccessState()) {
    await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
    await postReceipt(plan.attempt.id);
    await dismissSuccessState();
    await reportState({
      activeRunId: null,
      runStatus: 'completed',
      dailySubmitted: 1,
      recentResult: `Submitted ${plan.job.title} on MyCareersFuture`,
    });
    return {
      ok: true as const,
    };
  }

  const reason = `Manual finish needed for ${plan.job.title} on MyCareersFuture`;
  await postReview(apiBaseUrl, plan.attempt.id, reason);
  await reportState({
    activeRunId: null,
    runStatus: 'failed',
    pendingReviewCount: 1,
    recentResult: reason,
  });
  return {
    ok: false as const,
    reason,
  };
};

const executePlansInWorkerTabs = async ({
  apiBaseUrl,
  sourceTabId,
  plans,
}: {
  apiBaseUrl: string;
  sourceTabId: number;
  plans: JobPlan[];
}) => {
  for (const plan of plans) {
    await reportState({
      runStatus: 'running',
      recentResult: `Opening ${plan.job.title} on MyCareersFuture`,
    });

    const response = await sendRuntimeMessage<{ ok?: boolean; error?: string }>({
      type: 'applypilot:run-plan-in-worker-tab',
      apiBaseUrl,
      plan,
      sourceTabId,
    } satisfies ExtensionMessage);

    if (!response?.ok) {
      throw new Error(response?.error ?? `ApplyPilot could not open ${plan.job.title}.`);
    }
  }
};

const executePlanOnCurrentPage = async ({
  apiBaseUrl,
  plan,
}: {
  apiBaseUrl: string;
  plan: JobPlan;
}) => {
  const bootstrap = await fetchBootstrap();
  return processPlan({
    apiBaseUrl,
    plan,
    profile: bootstrap.profile,
    preference: bootstrap.preference,
  });
};

const maybeResumePendingWorkerPlan = async () => {
  if (contentScriptWindow.__applypilotMyCareersFutureAutoResumeStarted) {
    return;
  }
  contentScriptWindow.__applypilotMyCareersFutureAutoResumeStarted = true;

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
      recentResult: `Continuing ${pending.plan.job.title} on MyCareersFuture`,
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
      error instanceof Error ? error.message : 'MyCareersFuture worker run failed unexpectedly.';

    try {
      await sendRuntimeMessage({
        type: 'applypilot:worker-plan-finished',
        status: 'failed',
        error: messageText,
      } satisfies ExtensionMessage);
    } catch {
      // Ignore runtime channel errors during teardown; the worker tab will remain visible for manual recovery.
    }
  }
};

const runOnPage = async ({
  apiBaseUrl,
  targetCount,
  sourceTabId,
}: {
  apiBaseUrl: string;
  targetCount: number;
  sourceTabId: number;
}) => {
  runState.active = true;
  runState.paused = false;

  if (isSearchResultsPage()) {
    await reportState({
      runStatus: 'running',
      recentResult: 'Scanning MyCareersFuture search results...',
    });

    const jobs = extractJobsFromSearchResults(targetCount);
    if (jobs.length === 0) {
      throw new Error('No MyCareersFuture job cards could be extracted from this search page.');
    }

    const { run, plans } = await startServerRun({
      jobs,
      targetCount: jobs.length,
    });

    if (plans.length === 0) {
      throw new Error('No MyCareersFuture jobs could be queued from this search page.');
    }

    await reportState({
      activeRunId: run.id,
      runStatus: 'running',
      recentResult: `Queued ${plans.length} MyCareersFuture job${plans.length === 1 ? '' : 's'}`,
    });

    await executePlansInWorkerTabs({
      apiBaseUrl,
      sourceTabId,
      plans,
    });
    return;
  }

  await reportState({
    runStatus: 'running',
    recentResult: 'Scanning MyCareersFuture job page...',
  });

  const job = extractCurrentJob();
  const { run, plans } = await startServerRun({
    jobs: [job],
    targetCount: 1,
  });
  const plan = plans[0] ?? null;

  if (!plan) {
    throw new Error('No MyCareersFuture job could be queued from this page.');
  }

  await reportState({
    activeRunId: run.id,
    runStatus: 'running',
    recentResult: `Queued ${plan.job.title} on MyCareersFuture`,
  });

  const bootstrap = await fetchBootstrap();
  await processPlan({
    apiBaseUrl,
    plan,
    profile: bootstrap.profile,
    preference: bootstrap.preference,
  });
};

if (!contentScriptWindow.__applypilotMyCareersFutureListenerRegistered) {
  contentScriptWindow.__applypilotMyCareersFutureListenerRegistered = true;

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    void (async () => {
      if (message.type === 'applypilot:ping') {
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'applypilot:start-run-on-page') {
        try {
          await runOnPage({
            apiBaseUrl: message.apiBaseUrl,
            targetCount: message.targetCount,
            sourceTabId: message.sourceTabId,
          });
          sendResponse({ ok: true });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'MyCareersFuture run failed unexpectedly.';
          await reportState({
            activeRunId: null,
            runStatus: 'failed',
            recentResult: messageText,
          });
          sendResponse({ ok: false, error: messageText });
        }
        return;
      }

      if (message.type === 'applypilot:execute-plan-on-page') {
        try {
          await executePlanOnCurrentPage({
            apiBaseUrl: message.apiBaseUrl,
            plan: message.plan,
          });
          sendResponse({ ok: true });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'MyCareersFuture execution failed unexpectedly.';
          await reportState({
            activeRunId: null,
            runStatus: 'failed',
            recentResult: messageText,
          });
          sendResponse({ ok: false, error: messageText });
        }
        return;
      }

      if (message.type === 'applypilot:pause-run-on-page') {
        runState.paused = true;
        runState.active = false;
        await reportState({
          activeRunId: null,
          runStatus: 'paused',
          recentResult: 'Run paused',
        });
        sendResponse({ ok: true });
      }
    })();

    return true;
  });
}

void maybeResumePendingWorkerPlan();
