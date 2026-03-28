import type { ExtensionMessage, PopupState, WorkerJobPlan } from '../shared/messages';

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
  __applypilotLinkedInListenerRegistered?: boolean;
  __applypilotLinkedInAutoResumeStarted?: boolean;
};

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'value',
)?.set;
const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  'value',
)?.set;

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
    // Keep the application flow moving even if the popup state sync channel briefly drops.
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

const textOf = (element: Element | null | undefined) => element?.textContent?.trim() ?? '';
const firstNonEmpty = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
const normalizeToken = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeDigits = (value: string) => value.replace(/[^\d]/g, '');
const GENERIC_CARD_LINE_PATTERN =
  /^(easy apply|快速申请|抢先申请|保存|save|已查看|viewed|积极审核申请者|actively reviewing applicants|由招聘者推广|promoted|超过.*位申请者|over \d+ applicants|申请已提交|已申请|apply|混合办公|现场办公|远程办公|全职|兼职|contract|full-time|part-time|hybrid|remote|on-site)$/i;

const isVisible = (element: Element) => {
  const rect = element.getBoundingClientRect();
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};

const getHeuristicDialogContainers = () => {
  const candidates = new Set<HTMLElement>();
  const actionPattern = /next|review|continue|preview|submit|done|下一|继续|审核|预览|查看|提交|完成/i;
  const fieldPattern = /email|phone|mobile|联系电话|联系方式/i;

  Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button))
    .forEach((button) => {
      const label = firstNonEmpty(
        textOf(button),
        button.getAttribute('aria-label'),
        button.getAttribute('data-control-name'),
      );
      if (!actionPattern.test(label)) {
        return;
      }

      const container =
        button.closest<HTMLElement>(
          [
            '[role="dialog"]',
            '.artdeco-modal',
            '.artdeco-modal__content',
            '.jobs-easy-apply-modal',
            '.jobs-easy-apply-modal__content',
            '.jobs-easy-apply-content',
            '.jobs-easy-apply-content__questions',
            'form',
            'section',
            'main',
          ].join(', '),
        ) ??
        button.parentElement;

      if (
        container &&
        isVisible(container) &&
        container.getBoundingClientRect().width > 240 &&
        container.getBoundingClientRect().height > 160
      ) {
        candidates.add(container);
      }
    });

  Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .filter((field) => isVisible(field))
    .forEach((field) => {
      const context = firstNonEmpty(
        field.getAttribute('aria-label'),
        field.getAttribute('name'),
        field.getAttribute('placeholder'),
        textOf(field.closest('label')),
        field.id ? textOf(document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) : '',
      );
      if (!fieldPattern.test(context)) {
        return;
      }

      const container =
        field.closest<HTMLElement>(
          [
            '[role="dialog"]',
            '.artdeco-modal',
            '.artdeco-modal__content',
            '.jobs-easy-apply-modal',
            '.jobs-easy-apply-modal__content',
            '.jobs-easy-apply-content',
            '.jobs-easy-apply-content__questions',
            'form',
            'section',
            'main',
          ].join(', '),
        ) ??
        field.parentElement;

      if (
        container &&
        isVisible(container) &&
        container.getBoundingClientRect().width > 240 &&
        container.getBoundingClientRect().height > 160
      ) {
        candidates.add(container);
      }
    });

  return Array.from(candidates);
};

const getVisibleDialogCandidates = () => {
  const selectors = [
    '[role="dialog"]',
    '.artdeco-modal',
    '.artdeco-modal__content',
    '.jobs-easy-apply-modal',
    '.jobs-easy-apply-modal__content',
    '.jobs-easy-apply-content',
    '.jobs-easy-apply-content__questions',
    '[class*="easy-apply"]',
  ].join(', ');

  return Array.from(
    new Set([
      ...Array.from(document.querySelectorAll<HTMLElement>(selectors)),
      ...getHeuristicDialogContainers(),
    ]),
  ).filter(
    (dialog) =>
      isVisible(dialog) &&
      dialog !== document.body &&
      dialog !== document.documentElement &&
      dialog.getBoundingClientRect().width > 240 &&
      dialog.getBoundingClientRect().height > 160,
  );
};

const getDialogFormControlsFor = (dialog: ParentNode) =>
  Array.from(
    dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ),
  ).filter((element) => isVisible(element) && !element.disabled);

const getDialogTitle = (dialog: ParentNode) =>
  firstNonEmpty(
    textOf(dialog.querySelector('h1')),
    textOf(dialog.querySelector('h2')),
    textOf(dialog.querySelector('h3')),
    textOf(dialog.querySelector('[aria-level="1"]')),
    textOf(dialog.querySelector('[aria-level="2"]')),
  );

const getPrimaryApplicationDialog = () => {
  const dialogs = getVisibleDialogCandidates();

  return (
    dialogs.sort((left, right) => {
      const leftText = normalizeToken(textOf(left));
      const rightText = normalizeToken(textOf(right));
      const leftActionCount = Array.from(left.querySelectorAll<HTMLElement>('button, a, [role="button"]')).filter(
        (button) =>
          isVisible(button) &&
          /next|review|continue|preview|submit|done|下一|继续|审核|预览|查看|提交|完成/.test(
            buttonLabel(button),
          ),
      ).length;
      const rightActionCount = Array.from(
        right.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
      ).filter(
        (button) =>
          isVisible(button) &&
          /next|review|continue|preview|submit|done|下一|继续|审核|预览|查看|提交|完成/.test(
            buttonLabel(button),
          ),
      ).length;
      const leftScore =
        (/easy apply|快速申请|contact info|联系方式|resume|additional questions|review|审核|提交申请|application submitted|已发送申请/.test(
          leftText,
        )
          ? 5000
          : 0) +
        getDialogFormControlsFor(left).length * 1000 +
        leftActionCount * 250 +
        left.querySelectorAll('button, a, [role="button"]').length * 10 +
        left.getBoundingClientRect().width * left.getBoundingClientRect().height;
      const rightScore =
        (/easy apply|快速申请|contact info|联系方式|resume|additional questions|review|审核|提交申请|application submitted|已发送申请/.test(
          rightText,
        )
          ? 5000
          : 0) +
        getDialogFormControlsFor(right).length * 1000 +
        rightActionCount * 250 +
        right.querySelectorAll('button, a, [role="button"]').length * 10 +
        right.getBoundingClientRect().width * right.getBoundingClientRect().height;

      return rightScore - leftScore;
    })[0] ?? null
  );
};

const getAuxiliaryDialogs = () => {
  const primary = getPrimaryApplicationDialog();
  return getVisibleDialogCandidates().filter((dialog) => dialog !== primary);
};

const looksLikePreferenceOverlay = (value: string) => {
  const token = normalizeToken(value);
  return /偏好匹配|preference match|match preferences|preferences/.test(token);
};

const resolveJobCardContainer = (element: Element) =>
  element.closest<HTMLElement>(
    [
      'li.jobs-search-results__list-item',
      'li.scaffold-layout__list-item',
      'li.jobs-search-results-list__list-item',
      'article',
      'div.job-card-container',
      'div.job-card-list',
      '[data-job-id]',
      '[data-occludable-job-id]',
      '[class*="job-card"]',
      '[class*="jobs-search-results-list"] li',
    ].join(', '),
  );

const isLikelySearchResultsCard = (card: HTMLElement) => {
  if (
    card.closest(
      [
        '.jobs-search__job-details',
        '.jobs-search__job-details--wrapper',
        '.job-view-layout',
        '.jobs-unified-top-card',
        '.job-details-jobs-unified-top-card',
      ].join(', '),
    )
  ) {
    return false;
  }

  if (card.hasAttribute('data-job-id') || card.hasAttribute('data-occludable-job-id')) {
    return true;
  }

  const hasStructuredMetadata = Boolean(
    card.querySelector(
      [
        '.job-card-container__company-name',
        '.job-card-container__primary-description',
        '.job-card-container__metadata-item',
        '.artdeco-entity-lockup__subtitle',
        '.artdeco-entity-lockup__caption',
      ].join(', '),
    ),
  );

  if (hasStructuredMetadata) {
    return true;
  }

  const lines = textOf(card)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rect = card.getBoundingClientRect();

  return (
    Boolean(getPrimaryJobLink(card)) &&
    lines.length >= 2 &&
    lines.length <= 14 &&
    rect.left < window.innerWidth * 0.75
  );
};

const isLikelySearchResultsLink = (anchor: HTMLAnchorElement) => {
  if (!isVisible(anchor)) {
    return false;
  }

  const label = normalizeToken(textOf(anchor));
  if (!label || GENERIC_CARD_LINE_PATTERN.test(label)) {
    return false;
  }

  if (
    anchor.closest(
      [
        '.jobs-search__job-details',
        '.jobs-search__job-details--wrapper',
        '.job-view-layout',
        '.jobs-unified-top-card',
        '.job-details-jobs-unified-top-card',
      ].join(', '),
    )
  ) {
    return false;
  }

  const rect = anchor.getBoundingClientRect();
  return rect.left < window.innerWidth * 0.75 && rect.top < window.innerHeight;
};

const findCardContainerFromLink = (anchor: HTMLAnchorElement) => {
  const resolved = resolveJobCardContainer(anchor);
  if (resolved && isLikelySearchResultsCard(resolved)) {
    return resolved;
  }

  let current: HTMLElement | null = anchor.parentElement;
  while (current && current !== document.body) {
    const lines = textOf(current)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (
      isVisible(current) &&
      getPrimaryJobLink(current)?.href === anchor.href &&
      lines.length >= 2 &&
      lines.length <= 30 &&
      current.getBoundingClientRect().left < window.innerWidth * 0.6
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return anchor.parentElement;
};

const getPrimaryJobLink = (card: HTMLElement) =>
  Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/view/"]'))
    .filter((anchor) => {
      const label = normalizeToken(textOf(anchor));
      return label.length > 0 && !GENERIC_CARD_LINE_PATTERN.test(label);
    })
    .sort((left, right) => textOf(right).length - textOf(left).length)[0] ?? null;

const getJobCards = (limit: number) => {
  const primaryCardSelectors = [
    'li.jobs-search-results__list-item',
    'li.jobs-search-results-list__list-item',
    'li.scaffold-layout__list-item',
    'li[data-job-id]',
    'li[data-occludable-job-id]',
  ].join(', ');
  const secondaryCardSelectors = [
    'div.job-card-container',
    'div.job-card-list',
    'article[data-job-id]',
    'article[data-occludable-job-id]',
  ].join(', ');

  const primaryCandidates = Array.from(document.querySelectorAll<HTMLElement>(primaryCardSelectors)).filter(
    (card) => isVisible(card) && isLikelySearchResultsCard(card) && Boolean(getPrimaryJobLink(card)),
  );
  const secondaryCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(secondaryCardSelectors),
  ).filter((card) => isVisible(card) && isLikelySearchResultsCard(card) && Boolean(getPrimaryJobLink(card)));
  const anchorCandidates = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/view/"]'))
    .filter((anchor) => isLikelySearchResultsLink(anchor))
    .map((anchor) => findCardContainerFromLink(anchor))
    .filter((card): card is HTMLElement => card instanceof HTMLElement)
    .filter((card) => isVisible(card) && isLikelySearchResultsCard(card) && Boolean(getPrimaryJobLink(card)));

  const candidates = [
    ...(primaryCandidates.length > 0 ? primaryCandidates : secondaryCandidates),
    ...anchorCandidates,
  ];

  const uniqueCards = candidates.filter((card, index, all) => {
    const jobId = card.getAttribute('data-job-id');
    const occludableJobId = card.getAttribute('data-occludable-job-id');
    const titleLink = getPrimaryJobLink(card);

    const uniqueKey = jobId ?? occludableJobId ?? titleLink?.href ?? textOf(card);

    if (!uniqueKey) {
      return all.indexOf(card) === index;
    }

    const firstIndex = all.findIndex((item) => {
      const itemJobId = item.getAttribute('data-job-id');
      const itemOccludableJobId = item.getAttribute('data-occludable-job-id');
      const itemTitleLink = getPrimaryJobLink(item);

      return (itemJobId ?? itemOccludableJobId ?? itemTitleLink?.href ?? textOf(item)) === uniqueKey;
    });

    return firstIndex === index;
  });

  return uniqueCards.slice(0, limit);
};

const waitForJobCards = async (limit: number, timeoutMs = 12000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const cards = getJobCards(limit);
    if (cards.length > 0) {
      return cards;
    }

    await sleep(400);
  }

  return getJobCards(limit);
};

const describeJobCardSurface = () => {
  const containerMatches = document.querySelectorAll(
    [
      'li.jobs-search-results__list-item',
      'li.scaffold-layout__list-item',
      'li.jobs-search-results-list__list-item',
      'div.job-card-container',
      'div.job-card-list',
      'article[data-job-id]',
      'article[data-occludable-job-id]',
      '[data-job-id]',
      '[data-occludable-job-id]',
    ].join(', '),
  ).length;
  const visibleTitleAnchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/view/"]'),
  ).filter((anchor) => isVisible(anchor));
  const titleLinks = visibleTitleAnchors.length;
  const linkSamples = visibleTitleAnchors
    .map((anchor) => textOf(anchor))
    .filter(Boolean)
    .slice(0, 4)
    .join('|');

  return `containerMatches=${containerMatches}, titleLinks=${titleLinks}, linkSamples=${linkSamples || 'none'}`;
};

const getDetailPaneFingerprint = () =>
  firstNonEmpty(
    textOf(document.querySelector('.job-details-jobs-unified-top-card__job-title')),
    textOf(document.querySelector('.job-details-jobs-unified-top-card__company-name')),
    textOf(document.querySelector('.jobs-unified-top-card__job-title')),
    new URL(window.location.href).searchParams.get('currentJobId') ?? '',
    window.location.pathname,
  );

const triggerElementClick = (element: HTMLElement) => {
  element.scrollIntoView({
    block: 'center',
    inline: 'center',
  });
  element.focus?.();
  element.click();
};

const waitForDetailPaneUpdate = async ({
  previousFingerprint,
  expectedTitle,
  timeoutMs = 2500,
}: {
  previousFingerprint: string;
  expectedTitle: string;
  timeoutMs?: number;
}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const nextFingerprint = getDetailPaneFingerprint();
    const detailTitle = normalizeToken(
      textOf(
        document.querySelector(
          '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title',
        ),
      ),
    );

    if (
      nextFingerprint !== previousFingerprint ||
      (expectedTitle && detailTitle.includes(normalizeToken(expectedTitle)))
    ) {
      return;
    }

    await sleep(200);
  }
};

const getCurrentLinkedInJobId = () =>
  new URL(window.location.href).searchParams.get('currentJobId') ??
  window.location.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] ??
  '';

const clickIntoJobCard = async (card: HTMLElement) => {
  const expectedTitle = firstNonEmpty(
    textOf(
      card.querySelector(
        '.job-card-list__title, .job-card-container__link, [data-test-job-title], .artdeco-entity-lockup__title',
      ),
    ),
    textOf(card.querySelector('a[href*="/jobs/view/"]')),
  );
  const previousFingerprint = getDetailPaneFingerprint();
  const clickable =
    card.querySelector<HTMLElement>(
      [
        '[data-control-name="job_card_click"]',
        '.job-card-container--clickable',
        '.job-card-container',
        '.job-card-list',
        '.artdeco-entity-lockup',
      ].join(', '),
    ) ??
    card;

  triggerElementClick(clickable);
  await waitForDetailPaneUpdate({
    previousFingerprint,
    expectedTitle,
  });
  await sleep(500);
};

const findJobCardByExternalJobId = (externalJobId: string) =>
  document.querySelector<HTMLElement>(
    [
      `li[data-job-id="${CSS.escape(externalJobId)}"]`,
      `li[data-occludable-job-id="${CSS.escape(externalJobId)}"]`,
      `a[href*="/jobs/view/${CSS.escape(externalJobId)}"]`,
    ].join(', '),
  );

const extractSelectedJobFromResultsList = async () => {
  const externalJobId = getCurrentLinkedInJobId();
  if (!externalJobId) {
    return null;
  }

  const rawCard = findJobCardByExternalJobId(externalJobId);
  const card =
    (rawCard && resolveJobCardContainer(rawCard)) ||
    (rawCard instanceof HTMLElement ? rawCard : null);

  if (!card || !isVisible(card)) {
    return null;
  }

  return extractJobFromCard(card);
};

const ensureJobSelectedOnPage = async ({
  externalJobId,
  title,
  timeoutMs = 12000,
}: {
  externalJobId: string;
  title: string;
  timeoutMs?: number;
}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const rawCard = findJobCardByExternalJobId(externalJobId);
    const card =
      (rawCard && resolveJobCardContainer(rawCard)) ||
      (rawCard instanceof HTMLElement ? rawCard : null);

    if (card && isVisible(card)) {
      await clickIntoJobCard(card);
      return true;
    }

    const detailTitle = normalizeToken(
      textOf(
        document.querySelector(
          '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title',
        ),
      ),
    );
    if (detailTitle.includes(normalizeToken(title))) {
      return true;
    }

    await sleep(300);
  }

  return false;
};

const isSearchResultsRoute = () => /\/jobs\/search(?:-results)?/.test(window.location.pathname);

const restoreSearchResultsView = async (searchResultsUrl: string, targetCount: number) => {
  if (!isSearchResultsRoute() || getJobCards(Math.max(1, targetCount)).length === 0) {
    window.location.href = searchResultsUrl;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (isSearchResultsRoute() && getJobCards(Math.max(1, targetCount)).length > 0) {
      return true;
    }

    await sleep(400);
  }

  return isSearchResultsRoute();
};

const extractJobFromCard = async (card: HTMLElement) => {
  const cardTextLines = textOf(card)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulCardTextLines = cardTextLines.filter(
    (line) => !GENERIC_CARD_LINE_PATTERN.test(normalizeToken(line)),
  );

  const link =
    getPrimaryJobLink(card) ?? card.querySelector<HTMLAnchorElement>('a.job-card-container__link');
  const externalJobId =
    link?.href.match(/\/jobs\/view\/(\d+)/)?.[1] ??
    card.getAttribute('data-job-id') ??
    card.getAttribute('data-occludable-job-id') ??
    card.closest<HTMLElement>('[data-job-id], [data-occludable-job-id]')?.getAttribute('data-job-id') ??
    card.closest<HTMLElement>('[data-job-id], [data-occludable-job-id]')?.getAttribute(
      'data-occludable-job-id',
    ) ??
    String(Date.now());
  const title = firstNonEmpty(
    textOf(
      card.querySelector(
        '.job-card-list__title, .job-card-container__link, [data-test-job-title], .artdeco-entity-lockup__title',
      ),
    ),
    textOf(link),
    meaningfulCardTextLines[0],
    'Untitled role',
  );
  const company = firstNonEmpty(
    textOf(
      card.querySelector(
        '.job-card-container__company-name, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle',
      ),
    ),
    meaningfulCardTextLines.find((line) => line !== title),
    'Unknown company',
  );
  const location = firstNonEmpty(
    textOf(
      card.querySelector(
        '.job-card-container__metadata-item, .job-card-container__metadata-wrapper li, .artdeco-entity-lockup__caption',
      ),
    ),
    meaningfulCardTextLines.find((line) => line !== title && line !== company) ?? '',
  );
  const cardText = normalizeToken(cardTextLines.join(' '));
  const detailDescription = textOf(
    document.querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title',
    ),
  ).includes(title)
    ? textOf(
        document.querySelector(
          '.jobs-description__content, .jobs-box__html-content, .jobs-description-content__text, .jobs-description__container',
        ),
      )
    : '';

  return {
    source: 'linkedin' as const,
    externalJobId,
    title,
    company,
    location,
    url: link?.href ?? `https://www.linkedin.com/jobs/view/${externalJobId}/`,
    description: detailDescription || meaningfulCardTextLines.join(' | ') || 'Description unavailable',
    easyApply: /easy apply|快速申请|抢先申请/.test(cardText),
    detectedQuestions: [],
  };
};

const extractSelectedJobFromDetails = () => {
  const detailTopCardText = textOf(
    document.querySelector(
      [
        '.jobs-unified-top-card',
        '.job-details-jobs-unified-top-card',
        '.jobs-search__job-details--container',
        '.jobs-search__job-details',
        '.job-view-layout',
        '.scaffold-layout__detail',
        'main',
      ].join(', '),
    ),
  );
  const detailTopCardLines = detailTopCardText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = firstNonEmpty(
    textOf(
      document.querySelector(
        [
          '.job-details-jobs-unified-top-card__job-title',
          '.jobs-unified-top-card__job-title',
          '.top-card-layout__title',
          '[data-job-title]',
          'main h1',
          'h1',
        ].join(', '),
      ),
    ),
    detailTopCardLines[0],
    'Untitled role',
  );
  const companyLine = detailTopCardLines.find((line) => line !== title && !GENERIC_CARD_LINE_PATTERN.test(normalizeToken(line))) ?? '';
  const companyFromLine = companyLine.split(/[•·]/)[0]?.trim() ?? '';
  const locationFromLine = companyLine
    .split(/[•·]/)
    .slice(1)
    .join(' ')
    .trim();
  const company = firstNonEmpty(
    textOf(
      document.querySelector(
        [
          '.job-details-jobs-unified-top-card__company-name',
          '.jobs-unified-top-card__company-name',
          '.job-details-jobs-unified-top-card__primary-description',
          '.jobs-unified-top-card__primary-description',
          '.topcard__org-name-link',
          '.topcard__flavor a',
          'main a[href*="/company/"]',
        ].join(', '),
      ),
    ),
    companyFromLine,
    'Unknown company',
  );
  const location = firstNonEmpty(
    textOf(
      document.querySelector(
        [
          '.job-details-jobs-unified-top-card__tertiary-description',
          '.jobs-unified-top-card__tertiary-description',
          '.topcard__flavor--bullet',
          '.topcard__flavor',
        ].join(', '),
      ),
    ),
    locationFromLine,
    '',
  );
  const description = firstNonEmpty(
    textOf(
      document.querySelector(
        '.jobs-description__content, .jobs-box__html-content, .jobs-description-content__text, .jobs-description__container',
      ),
    ),
    'Description unavailable',
  );
  const externalJobId = getCurrentLinkedInJobId();

  if (!externalJobId) {
    return null;
  }

  const easyApplySignal =
    Boolean(getVisibleEasyApplyButton()) ||
    /easy apply|快速申请|抢先申请/.test(normalizeToken(detailTopCardText)) ||
    window.location.href.includes('/jobs/view/') ||
    window.location.href.includes('currentJobId=');

  return {
    source: 'linkedin' as const,
    externalJobId,
    title,
    company,
    location,
    url: `https://www.linkedin.com/jobs/view/${externalJobId}/`,
    description,
    easyApply: easyApplySignal,
    detectedQuestions: [],
  };
};

const waitForCurrentSelectedLinkedInJob = async (timeoutMs = 10000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const selectedDetailJob = extractSelectedJobFromDetails();
    if (
      selectedDetailJob &&
      isUsableExtractedJob(selectedDetailJob, {
        allowUnknownCompany: true,
      })
    ) {
      return selectedDetailJob;
    }

    const selectedResultsJob = await extractSelectedJobFromResultsList();
    if (
      selectedResultsJob &&
      isUsableExtractedJob(selectedResultsJob, {
        allowUnknownCompany: true,
      })
    ) {
      return selectedResultsJob;
    }

    await sleep(300);
  }

  const fallbackDetailJob = extractSelectedJobFromDetails();
  if (
    fallbackDetailJob &&
    isUsableExtractedJob(fallbackDetailJob, {
      allowUnknownCompany: true,
    })
  ) {
    return fallbackDetailJob;
  }

  const fallbackResultsJob = await extractSelectedJobFromResultsList();
  if (
    fallbackResultsJob &&
    isUsableExtractedJob(fallbackResultsJob, {
      allowUnknownCompany: true,
    })
  ) {
    return fallbackResultsJob;
  }

  return null;
};

const isUsableExtractedJob = (
  job: Awaited<ReturnType<typeof extractJobFromCard>>,
  options?: { allowUnknownCompany?: boolean },
) => {
  const normalizedTitle = normalizeToken(job.title);
  const normalizedCompany = normalizeToken(job.company);

  if (!normalizedTitle || GENERIC_CARD_LINE_PATTERN.test(normalizedTitle)) {
    return false;
  }

  if (!normalizedCompany || normalizedCompany === 'unknown company') {
    return Boolean(options?.allowUnknownCompany && job.externalJobId && job.easyApply);
  }

  return true;
};

const fetchBootstrap = (apiBaseUrl: string) =>
  fetchJson<BootstrapPayload>('/api/dashboard/summary');

const startServerRun = async ({
  apiBaseUrl,
  jobs,
  targetCount,
}: {
  apiBaseUrl: string;
  jobs: Awaited<ReturnType<typeof extractJobFromCard>>[];
  targetCount: number;
}) =>
  fetchJson<{
    run: { id: string };
    plans: JobPlan[];
  }>('/api/runs/start', {
    method: 'POST',
    body: {
      source: 'linkedin',
      targetCount,
      jobs,
    },
  });

const downloadResumeFile = async (url: string, preferredFileName: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  const fallbackName = `${preferredFileName.replace(/[^a-z0-9.]+/gi, '-').toLowerCase() || 'resume'}`;
  const fileName = fallbackName.endsWith('.pdf') || fallbackName.endsWith('.docx')
    ? fallbackName
    : `${fallbackName}.pdf`;

  return new File([blob], fileName, {
    type: 'application/pdf',
  });
};

const isRequiredControl = (
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) => element.required || element.getAttribute('aria-required') === 'true';

const getDialogFormControls = () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return [];
  }

  return getDialogFormControlsFor(dialog);
};

const setFieldValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const nextValue = value ?? '';
  if (element instanceof HTMLInputElement) {
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, nextValue);
    } else {
      element.value = nextValue;
    }
  } else {
    if (nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, nextValue);
    } else {
      element.value = nextValue;
    }
  }

  if ('setSelectionRange' in element) {
    const end = nextValue.length;
    try {
      element.setSelectionRange(end, end);
    } catch {
      // Some input types do not support selection ranges.
    }
  }

  element.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
};

const getDialogScrollContainer = () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return null;
  }

  return (
    dialog.querySelector<HTMLElement>(
      '.jobs-easy-apply-content, .jobs-easy-apply-content__questions, .artdeco-modal__content, [class*="easy-apply-content"]',
    ) ?? dialog
  );
};

const scrollDialogByViewport = async (direction: 'down' | 'up') => {
  const container = getDialogScrollContainer();
  if (!container) {
    return false;
  }

  const delta = Math.max(240, Math.floor(container.clientHeight * 0.8));
  const targetTop =
    direction === 'down'
      ? Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + delta)
      : Math.max(0, container.scrollTop - delta);

  if (targetTop === container.scrollTop) {
    return false;
  }

  container.scrollTo({
    top: targetTop,
    behavior: 'auto',
  });
  await sleep(250);
  return true;
};

const rewindDialogToTop = async () => {
  const container = getDialogScrollContainer();
  if (!container) {
    return;
  }

  container.scrollTo({
    top: 0,
    behavior: 'auto',
  });
  await sleep(250);
};

const scrollDialogToBottom = async () => {
  const container = getDialogScrollContainer();
  if (!container) {
    return;
  }

  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'auto',
  });
  await sleep(300);
};

const fillStandardFields = (profile: BootstrapPayload['profile']) => {
  if (!profile) {
    return;
  }

  const dialog = getEasyApplyDialog() ?? document;
  const phoneInput = dialog.querySelector<HTMLInputElement>(
    'input[id*="phoneNumber"], input[name*="phone"], input[aria-label*="phone"], input[aria-label*="Phone"]',
  );
  if (phoneInput && !phoneInput.value && profile.phone) {
    setFieldValue(phoneInput, profile.phone);
  }

  const emailInput = dialog.querySelector<HTMLInputElement>(
    'input[type="email"], input[name*="email"], input[aria-label*="email"], input[aria-label*="Email"]',
  );
  if (emailInput && !emailInput.value && profile.email) {
    setFieldValue(emailInput, profile.email);
  }
};

const getFieldContextText = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
  const labelFromFor =
    element.id && document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`)
      ? textOf(document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`))
      : '';

  return normalizeToken(
    [
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
      element.getAttribute('id'),
      labelFromFor,
      textOf(element.closest('label')),
      textOf(element.closest('fieldset')),
      textOf(element.closest('[data-test-form-element]')),
    ]
      .filter(Boolean)
      .join(' '),
  );
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
    profile?.location,
    preference?.regions?.[0],
    jobLocation.split(',')[0],
    jobLocation.split(' ')[0],
  );

const getPreferredSalaryValue = (preference?: BootstrapPayload['preference'] | null) => {
  if (!preference?.minSalary || preference.minSalary <= 0) {
    return '';
  }

  const monthly = Math.max(1, Math.round(preference.minSalary / 12));
  return String(monthly);
};

const inferYearsAnswer = (context: string) => {
  const normalized = normalizeToken(context);

  if (!/(years|experience|经验|多久)/.test(normalized)) {
    return '';
  }

  return '8';
};

const looksLikeSuspiciousFullName = (value: string) =>
  value.trim().split(/\s+/).length > 5 ||
  /experience|specialize|specialise|product|growth|strategy|data|analyst|manager|lead|summary|profile|singapore|fintech|web3|,|\|/i.test(
    value,
  );

const fillKnownTextFields = ({
  profile,
  preference,
  jobLocation,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) => {
  const rawFullName = profile?.fullName?.trim() ?? '';
  const fullName = looksLikeSuspiciousFullName(rawFullName) ? '' : rawFullName;
  const [firstName = '', ...restNames] = fullName.split(/\s+/);
  const lastName = restNames.join(' ');
  const preferredLocation = getPreferredLocationValue({ profile, preference, jobLocation });
  const preferredSalary = getPreferredSalaryValue(preference);

  for (const control of getDialogFormControls()) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      continue;
    }

    if (control.value) {
      continue;
    }

    const context = getFieldContextText(control);

    if (/first name|given name|名字/.test(context) && firstName) {
      setFieldValue(control, firstName);
      continue;
    }

    if (/last name|family name|surname|姓氏/.test(context) && (lastName || firstName)) {
      setFieldValue(control, lastName || firstName);
      continue;
    }

    if (/location|city|城市|地区/.test(context) && preferredLocation) {
      setFieldValue(control, preferredLocation);
      continue;
    }

    if (/salary|compensation|pay|薪资|薪酬/.test(context) && preferredSalary) {
      setFieldValue(control, preferredSalary);
      continue;
    }

    const inferredYears = inferYearsAnswer(context);
    if (inferredYears && /^(number|text|tel|search|url|email)?$/i.test(control.type || 'text')) {
      setFieldValue(control, inferredYears);
    }
  }
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

  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) {
    return;
  }

  const file = await downloadResumeFile(resumeUrl, resumeFileName ?? jobTitle);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(800);
};

const getRadioGroups = () => {
  const controls = getDialogFormControls();
  const radios = controls.filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement && element.type === 'radio',
  );
  const groups = new Map<string, HTMLInputElement[]>();

  for (const radio of radios) {
    const groupKey =
      firstNonEmpty(
        radio.name,
        textOf(radio.closest('fieldset')?.querySelector('legend')),
        textOf(radio.closest('[data-test-form-element]')),
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
      textOf(radios[0]?.closest('[data-test-form-element]')),
      radios[0]?.name,
    ),
  );

  const preferredTokens = /sponsor|sponsorship|visa|work authorization|work authorisation/.test(questionText)
    ? ['no']
    : /degree|education|bachelor|master|phd|completed|complete the following level/.test(questionText)
      ? ['yes']
      : ['yes', 'no'];

  for (const token of preferredTokens) {
    const candidate = radios.find((radio) => new RegExp(`\\b${token}\\b`).test(getRadioLabelText(radio)));
    if (candidate) {
      return candidate;
    }
  }

  return radios[0] ?? null;
};

const isRequiredRadioGroup = (radios: HTMLInputElement[]) =>
  radios.some((radio) => isRequiredControl(radio)) ||
  /\*/.test(
    firstNonEmpty(
      textOf(radios[0]?.closest('fieldset')),
      textOf(radios[0]?.closest('[data-test-form-element]')),
      radios[0]?.name,
    ),
  );

const getFallbackFieldValue = ({
  element,
  profile,
  preference,
  jobLocation,
}: {
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) => {
  const context = getFieldContextText(element);
  const preferredLocation = getPreferredLocationValue({ profile, preference, jobLocation });
  const preferredSalary = getPreferredSalaryValue(preference);

  if (/email/.test(context) && profile?.email) {
    return profile.email;
  }

  if (/phone|mobile|telephone/.test(context) && profile?.phone) {
    return profile.phone;
  }

  if (/location|city|地区|城市/.test(context) && preferredLocation) {
    return preferredLocation;
  }

  if (/salary|compensation|pay|薪资|薪酬/.test(context)) {
    return preferredSalary || '10000';
  }

  if (/notice/.test(context)) {
    return '2';
  }

  if (/(years|experience|经验|多久)/.test(context)) {
    return '8';
  }

  if (element instanceof HTMLInputElement && element.type === 'number') {
    return '1';
  }

  return '1';
};

const answerKnockoutQuestions = ({
  profile,
  preference,
  jobLocation,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) => {
  const controls = getDialogFormControls();
  const unansweredSelect = controls.find(
    (element): element is HTMLSelectElement =>
      element instanceof HTMLSelectElement && isRequiredControl(element) && !element.value,
  );

  if (unansweredSelect) {
    unansweredSelect.selectedIndex = unansweredSelect.options.length > 1 ? 1 : 0;
    unansweredSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const dialog = getEasyApplyDialog() ?? document;
  const requiredGroups = Array.from(dialog.querySelectorAll('fieldset')).filter((fieldset) =>
    isVisible(fieldset) &&
    fieldset.textContent?.toLowerCase().includes('years'),
  );

  requiredGroups.forEach((group) => {
    const preferred = group.querySelector<HTMLInputElement>(
      'input[type="radio"][value*="5"], input[type="radio"][value*="10"]',
    );
    preferred?.click();
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

    if (element.value) {
      return;
    }

    const inferredYears = inferYearsAnswer(getFieldContextText(element));
    if (inferredYears) {
      setFieldValue(element, inferredYears);
    }
  });

  const unresolvedRequiredInputs = controls.filter((element) => {
    if (!isRequiredControl(element)) {
      return false;
    }

    if (element instanceof HTMLInputElement && ['radio', 'checkbox', 'file'].includes(element.type)) {
      return false;
    }

    return normalizeDigits(element.value).length === 0 && element.value.trim().length === 0;
  });

  unresolvedRequiredInputs.forEach((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return;
    }

    const fallback = getFallbackFieldValue({
      element,
      profile,
      preference,
      jobLocation,
    });
    if (!fallback) {
      return;
    }

    setFieldValue(element, fallback);
  });

  const unresolvedRequiredRadioGroups = getRadioGroups().filter(
    (radios) => isRequiredRadioGroup(radios) && !radios.some((radio) => radio.checked),
  );

  const stillUnresolvedInputs = controls.filter((element) => {
    if (!isRequiredControl(element)) {
      return false;
    }

    if (element instanceof HTMLInputElement && ['radio', 'checkbox', 'file'].includes(element.type)) {
      return false;
    }

    return normalizeDigits(element.value).length === 0 && element.value.trim().length === 0;
  });

  return stillUnresolvedInputs.length === 0 && unresolvedRequiredRadioGroups.length === 0;
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
  fillKnownTextFields({
    profile,
    preference,
    jobLocation,
  });

  return answerKnockoutQuestions({
    profile,
    preference,
    jobLocation,
  });
};

const walkDialogAndAnswerQuestions = async ({
  profile,
  preference,
  jobLocation,
}: {
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  jobLocation: string;
}) => {
  let moved = false;

  for (let pass = 0; pass < 5; pass += 1) {
    fillCurrentStep({
      profile,
      preference,
      jobLocation,
    });

    const scrolled = await scrollDialogByViewport('down');
    moved = moved || scrolled;
    if (!scrolled) {
      break;
    }
  }

  fillCurrentStep({
    profile,
    preference,
    jobLocation,
  });

  if (moved) {
    for (let pass = 0; pass < 5; pass += 1) {
      const scrolled = await scrollDialogByViewport('up');
      if (!scrolled) {
        break;
      }
    }
  }

  await rewindDialogToTop();
};

const getEasyApplyDialog = () => getPrimaryApplicationDialog();

const isButtonDisabled = (button: HTMLElement) =>
  ('disabled' in button && Boolean((button as HTMLButtonElement).disabled)) ||
  button.getAttribute('aria-disabled') === 'true';

const buttonLabel = (button: HTMLElement) =>
  firstNonEmpty(textOf(button), button.getAttribute('aria-label'), button.getAttribute('data-control-name'))
    .toLowerCase();

const triggerButtonClick = (button: HTMLElement) => {
  button.scrollIntoView({
    block: 'center',
    inline: 'center',
  });
  const rect = button.getBoundingClientRect();
  const clientX = Math.round(rect.left + rect.width / 2);
  const clientY = Math.round(rect.top + rect.height / 2);
  const hitTarget =
    (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest<HTMLElement>(
      'button, a, [role="button"]',
    ) ?? button;

  hitTarget.focus();

  const pointerInit: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  const mouseInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
    view: window,
  };

  hitTarget.dispatchEvent(new MouseEvent('mouseover', mouseInit));
  hitTarget.dispatchEvent(new MouseEvent('mousemove', mouseInit));
  hitTarget.dispatchEvent(new PointerEvent('pointerover', pointerInit));
  hitTarget.dispatchEvent(new PointerEvent('pointerenter', pointerInit));
  hitTarget.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
  hitTarget.dispatchEvent(new MouseEvent('mousedown', mouseInit));
  hitTarget.dispatchEvent(new PointerEvent('pointerup', pointerInit));
  hitTarget.dispatchEvent(new MouseEvent('mouseup', mouseInit));
  hitTarget.dispatchEvent(new MouseEvent('click', mouseInit));
  HTMLElement.prototype.click.call(hitTarget);
  hitTarget.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
    }),
  );
  hitTarget.dispatchEvent(
    new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
    }),
  );
};

const getDialogProgressValue = () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return 'closed';
  }

  const progressText = Array.from(dialog.querySelectorAll('span, div'))
    .map((node) => textOf(node))
    .find((value) => /\d+\s*%/.test(value));

  return progressText ?? '';
};

const getDialogFingerprint = () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return 'closed';
  }

  const title = firstNonEmpty(
    textOf(dialog.querySelector('h2')),
    textOf(dialog.querySelector('h3')),
    textOf(dialog.querySelector('header')),
  );
  const progress = getDialogProgressValue();
  const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button))
    .map((button) => buttonLabel(button))
    .join('|');
  const fields = getDialogFormControls()
    .map((field) => firstNonEmpty(field.getAttribute('name'), field.getAttribute('id'), field.getAttribute('aria-label')))
    .join('|');

  return `${title}::${progress}::${buttons}::${fields}`;
};

const waitForDialogChange = async (previousFingerprint: string, timeoutMs = 3500) => {
  const startedAt = Date.now();
  await sleep(400);

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(250);
    const current = getDialogFingerprint();
    if (current !== previousFingerprint) {
      return current;
    }
  }

  return getDialogFingerprint();
};

const classifyDialogAction = (button: HTMLElement) => {
  const label = buttonLabel(button);

  if (
    /submit application|submit|发送申请|提交申请|提交/.test(label)
  ) {
    return 'submit';
  }

  if (/next|review|continue|preview|下一|继续|审核|预览|查看/.test(label)) {
    return 'advance';
  }

  if (/done|close|完成|关闭/.test(label)) {
    return 'finish';
  }

  if (/cancel|dismiss|discard|not now|返回|取消|放弃/.test(label)) {
    return 'ignore';
  }

  if (button.className.includes('artdeco-button--primary')) {
    return 'advance';
  }

  return 'ignore';
};

const findPrimaryEasyApplyAction = () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return null;
  }

  const footerButtons = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      [
        '.jobs-easy-apply-modal__footer button',
        '.jobs-easy-apply-modal__footer a',
        '.jobs-easy-apply-modal__footer [role="button"]',
        'footer button',
        'footer a',
        'footer [role="button"]',
        '.artdeco-modal__actionbar button',
        '.artdeco-modal__actionbar a',
        '.artdeco-modal__actionbar [role="button"]',
      ].join(', '),
    ),
  ).filter((button) => isVisible(button) && !isButtonDisabled(button));
  const buttons = (footerButtons.length > 0
    ? footerButtons
    : Array.from(dialog.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
  ).filter(
    (button) => isVisible(button) && !isButtonDisabled(button),
  );
  const ranked = buttons
    .map((button) => ({
      button,
      label: buttonLabel(button),
      kind: classifyDialogAction(button),
      rect: button.getBoundingClientRect(),
    }))
    .filter((candidate) => candidate.kind !== 'ignore')
    .sort((left, right) => {
      const priority = { submit: 0, advance: 1, finish: 2 } as const;
      const priorityDelta =
        priority[left.kind as keyof typeof priority] - priority[right.kind as keyof typeof priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const verticalDelta = right.rect.top - left.rect.top;
      if (Math.abs(verticalDelta) > 8) {
        return verticalDelta;
      }

      return right.rect.left - left.rect.left;
    });
  return ranked[0] ?? null;
};

const clickPrimaryEasyApplyAction = () => {
  const target = findPreferredFlowAction() ?? findPrimaryEasyApplyAction();
  if (!target) {
    return null;
  }

  triggerButtonClick(target.button);
  return target;
};

const findPreferredFlowAction = () => {
  const candidate = findPrimaryEasyApplyAction();
  if (!candidate) {
    return null;
  }

  const label = normalizeToken(candidate.label);
  const preferredSequence = [
    /^(next|下一页|下一步|continue|继续)$/i,
    /^(review|预览|查看)$/i,
    /^(submit application|submit|发送申请|提交申请|提交)$/i,
    /^(done|完成|close|关闭)$/i,
  ];

  const sequenceIndex = preferredSequence.findIndex((pattern) => pattern.test(label));
  return {
    ...candidate,
    sequenceIndex: sequenceIndex === -1 ? 99 : sequenceIndex,
  };
};

const getVisibleEasyApplyButton = () => {
  const scopes = [
    document.querySelector<HTMLElement>(
      [
        '.jobs-search__job-details--container',
        '.jobs-search__job-details',
        '.jobs-unified-top-card',
        '.job-details-jobs-unified-top-card',
        '.scaffold-layout__detail',
      ].join(', '),
    ),
    document.body,
  ].filter((scope): scope is HTMLElement => scope instanceof HTMLElement);

  for (const scope of scopes) {
    const candidate = Array.from(
      scope.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
    )
      .filter((button) => isVisible(button) && !isButtonDisabled(button))
      .filter((button) => {
        const label = buttonLabel(button);
        return (
          button.matches(
            [
              'button.jobs-apply-button',
              'button.jobs-apply-button--top-card',
              'button[data-control-name="jobdetails_topcard_inapply"]',
              'button[aria-label*="Easy Apply"]',
              'button[aria-label*="快速申请"]',
              'a.jobs-apply-button',
              'a.jobs-apply-button--top-card',
              'a[data-control-name="jobdetails_topcard_inapply"]',
              'a[aria-label*="Easy Apply"]',
              'a[aria-label*="快速申请"]',
              '[role="button"][aria-label*="Easy Apply"]',
              '[role="button"][aria-label*="快速申请"]',
            ].join(', '),
          ) || /easy apply|快速申请|抢先申请/.test(label)
        );
      })
      .map((button) => {
        const label = normalizeToken(buttonLabel(button));
        const rect = button.getBoundingClientRect();
        const exactLabel = /^(easy apply|快速申请|抢先申请)$/.test(label);
        const lineCount = textOf(button)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean).length;
        const area = rect.width * rect.height;
        const score =
          (exactLabel ? 0 : 200) +
          Math.min(label.length, 200) +
          Math.max(lineCount - 1, 0) * 50 +
          Math.min(area / 100, 500) +
          (button.matches('button, a') ? 0 : 25);

        return {
          button,
          score,
        };
      })
      .sort((left, right) => left.score - right.score)[0]?.button;

    if (candidate) {
      return candidate;
    }
  }

  return null;
};

const describeEasyApplySurface = () => {
  const buttonLabels = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button))
    .map((button) => buttonLabel(button))
    .filter(Boolean)
    .slice(0, 12);

  return `visibleButtons=${buttonLabels.join('|') || 'none'}`;
};

const waitForVisibleEasyApplyButton = async (timeoutMs = 12000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const button = getVisibleEasyApplyButton();
    if (button) {
      return button;
    }

    await sleep(250);
  }

  return getVisibleEasyApplyButton() ?? null;
};

type ProcessPlanOutcome =
  | { outcome: 'submitted' }
  | { outcome: 'review'; reason: string };

const ensureEasyApplyModal = async () => {
  const button = await waitForVisibleEasyApplyButton();
  if (!button) {
    return false;
  }

  triggerButtonClick(button);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(400);
    if (getEasyApplyDialog()) {
      return true;
    }

    if (attempt === 4) {
      const retryButton = getVisibleEasyApplyButton();
      if (retryButton) {
        triggerButtonClick(retryButton);
      }
    }
  }

  return false;
};

const hasSubmissionSuccessState = () => {
  const dialog = getEasyApplyDialog();
  const dialogText = textOf(dialog).toLowerCase();

  if (
    /application submitted|your application was sent|已提交申请|申请已发送|申请已提交/.test(dialogText)
  ) {
    return true;
  }

  return Array.from((dialog ?? document).querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisible(button))
    .some((button) => /done|完成/.test(buttonLabel(button)));
};

const dismissSuccessfulApplicationDialog = async () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return;
  }

  const closeButton = Array.from(dialog.querySelectorAll<HTMLElement>('button, a, [role="button"]')).find((button) =>
    /done|close|dismiss|完成|关闭/.test(buttonLabel(button)),
  );

  if (closeButton) {
    triggerButtonClick(closeButton);
  }
  await sleep(800);
};

const dismissCurrentApplicationDialog = async () => {
  const dialog = getEasyApplyDialog();
  if (!dialog) {
    return;
  }

  const dismissButton = Array.from(dialog.querySelectorAll<HTMLElement>('button, a, [role="button"]')).find((button) =>
    /close|dismiss|done|not now|cancel|完成|关闭|取消/.test(buttonLabel(button)),
  );

  if (dismissButton) {
    triggerButtonClick(dismissButton);
  }
  await sleep(800);
};

const findDismissButton = (container: ParentNode) =>
  Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]')).find((button) => {
    const label = buttonLabel(button);
    return (
      /close|dismiss|cancel|done|关闭|取消|完成/.test(label) ||
      button.className.includes('artdeco-modal__dismiss')
    );
  });

const findDismissScopeFromHeading = (heading: HTMLElement) => {
  const primaryDialog = getEasyApplyDialog();
  let current: HTMLElement | null = heading;

  while (current && current !== document.body && current !== primaryDialog) {
    if (findDismissButton(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
};

const dismissInterferingDialogs = async () => {
  const overlayCandidates = new Set<HTMLElement>(getAuxiliaryDialogs());
  const preferenceOverlayHeadings = Array.from(
    document.querySelectorAll<HTMLElement>('h1, h2, h3, [aria-level="1"], [aria-level="2"]'),
  ).filter((heading) => isVisible(heading) && looksLikePreferenceOverlay(textOf(heading)));

  preferenceOverlayHeadings.forEach((heading) => {
    const overlay =
      findDismissScopeFromHeading(heading) ??
      heading.closest<HTMLElement>('[role="dialog"]') ??
      heading.closest<HTMLElement>('.artdeco-modal, .artdeco-modal-overlay, .jobs-easy-apply-content') ??
      heading.parentElement ??
      heading;

    if (overlay && overlay !== getEasyApplyDialog()) {
      overlayCandidates.add(overlay);
      return;
    }

    overlayCandidates.add(heading);
  });

  let dismissedCount = 0;

  for (const dialog of overlayCandidates) {
    const title = normalizeToken(getDialogTitle(dialog));
    const dialogText = normalizeToken(textOf(dialog));
    const shouldDismiss =
      looksLikePreferenceOverlay(title) ||
      looksLikePreferenceOverlay(dialogText) ||
      getDialogFormControlsFor(dialog).length === 0;

    if (!shouldDismiss) {
      continue;
    }

    const dismissButton = findDismissButton(dialog);
    if (dismissButton) {
      triggerButtonClick(dismissButton);
      dismissedCount += 1;
      await sleep(600);
      continue;
    }

    if (looksLikePreferenceOverlay(dialogText)) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Escape',
        }),
      );
      document.dispatchEvent(
        new KeyboardEvent('keyup', {
          bubbles: true,
          cancelable: true,
          key: 'Escape',
        }),
      );
      dismissedCount += 1;
      await sleep(600);
    }
  }

  return dismissedCount;
};

const postReview = async (apiBaseUrl: string, attemptId: string, reason: string) => {
  await fetchJson(`/api/applications/${attemptId}/review`, {
    method: 'POST',
    body: { reason },
  });
};

const postStatus = async (apiBaseUrl: string, attemptId: string, status: string) => {
  await fetchJson(`/api/applications/${attemptId}/status`, {
    method: 'PATCH',
    body: { status },
  });
};

const postReceipt = async (apiBaseUrl: string, attemptId: string) => {
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
  apiBaseUrl,
  profile,
  preference,
  allowAttemptDespiteReview = false,
}: {
  plan: JobPlan;
  apiBaseUrl: string;
  profile: BootstrapPayload['profile'];
  preference?: BootstrapPayload['preference'] | null;
  allowAttemptDespiteReview?: boolean;
}): Promise<ProcessPlanOutcome> => {
  const hasVipReview = plan.reviewReasons.some((reason) => reason.toLowerCase().includes('vip'));

  if (
    hasVipReview ||
    (!allowAttemptDespiteReview && (plan.reviewReasons.length > 0 || plan.attempt.status === 'needs_review'))
  ) {
    await reportState({
      pendingReviewCount: 1,
      recentResult: `Review required for ${plan.job.company}`,
    });
    await dismissCurrentApplicationDialog();
    return {
      outcome: 'review',
      reason: `Review required for ${plan.job.company}`,
    };
  }

  const modalOpened = await ensureEasyApplyModal();
  if (!modalOpened) {
    const reason = `Easy Apply dialog not available. ${describeEasyApplySurface()}`;
    await postReview(apiBaseUrl, plan.attempt.id, reason);
    await reportState({
      pendingReviewCount: 1,
      recentResult: reason,
    });
    await dismissCurrentApplicationDialog();
    return {
      outcome: 'review',
      reason,
    };
  }

  await dismissInterferingDialogs();
  await walkDialogAndAnswerQuestions({
    profile,
    preference,
    jobLocation: plan.job.location,
  });
  await uploadResumeIfNeeded({
    resumeUrl: plan.resumeUploadUrl ?? plan.tailoredResumeUrl,
    resumeFileName: plan.resumeFileName,
    jobTitle: plan.job.title,
  });

  for (let step = 0; step < 8; step += 1) {
    const dismissedDialogs = await dismissInterferingDialogs();
    if (dismissedDialogs > 0) {
      await reportState({
        runStatus: 'running',
        recentResult: `Closed an overlay and resumed ${plan.job.company}`,
      });
    }

    await walkDialogAndAnswerQuestions({
      profile,
      preference,
      jobLocation: plan.job.location,
    });
    await uploadResumeIfNeeded({
      resumeUrl: plan.resumeUploadUrl ?? plan.tailoredResumeUrl,
      resumeFileName: plan.resumeFileName,
      jobTitle: plan.job.title,
    });

    if (hasSubmissionSuccessState()) {
      await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
      await postReceipt(apiBaseUrl, plan.attempt.id);
      await dismissSuccessfulApplicationDialog();
      await reportState({
        dailySubmitted: 1,
        recentResult: `Submitted ${plan.job.title} at ${plan.job.company}`,
      });
      return {
        outcome: 'submitted',
      };
    }

    const resolved = fillCurrentStep({
      profile,
      preference,
      jobLocation: plan.job.location,
    });
    const actionCandidate = findPreferredFlowAction();
    const canAdvanceDespiteHeuristics =
      actionCandidate !== null && actionCandidate.kind !== 'submit' && actionCandidate.kind !== 'finish';

    if (!resolved && !canAdvanceDespiteHeuristics) {
      await postReview(apiBaseUrl, plan.attempt.id, 'Unresolved required questions');
      await reportState({
        pendingReviewCount: 1,
        recentResult: `Paused on questions for ${plan.job.company}`,
      });
      await dismissCurrentApplicationDialog();
      return {
        outcome: 'review',
        reason: `Paused on questions for ${plan.job.company}`,
      };
    }

    const preClickDismissedDialogs = await dismissInterferingDialogs();
    if (preClickDismissedDialogs > 0) {
      await reportState({
        runStatus: 'running',
        recentResult: `Closed an overlay before continuing ${plan.job.company}`,
      });
    }

    await scrollDialogToBottom();

    const previousFingerprint = getDialogFingerprint();
    const action = clickPrimaryEasyApplyAction();
    const nextFingerprint = await waitForDialogChange(
      previousFingerprint,
      action?.kind === 'submit' ? 6500 : 5000,
    );

    if (!action) {
      if (hasSubmissionSuccessState()) {
        await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
        await postReceipt(apiBaseUrl, plan.attempt.id);
        await dismissSuccessfulApplicationDialog();
        await reportState({
          dailySubmitted: 1,
          recentResult: `Submitted ${plan.job.title} at ${plan.job.company}`,
        });
        return {
          outcome: 'submitted',
        };
      }

      break;
    }

    const currentActionLabel = normalizeToken(action.label || '');
    await reportState({
      runStatus: 'running',
      recentResult:
        /submit|提交/.test(currentActionLabel)
          ? `Clicking ${action.label || '提交申请'} for ${plan.job.title}`
          : /review|查看|预览/.test(currentActionLabel)
            ? `Clicking ${action.label || '查看'} for ${plan.job.title}`
            : /done|完成|close|关闭/.test(currentActionLabel)
              ? `Clicking ${action.label || '完成'} for ${plan.job.title}`
              : `Clicking ${action.label || '下一页'} for ${plan.job.title}`,
    });

    if (action.kind === 'submit' && (hasSubmissionSuccessState() || !getEasyApplyDialog())) {
      await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
      await postReceipt(apiBaseUrl, plan.attempt.id);
      await dismissSuccessfulApplicationDialog();
      await reportState({
        dailySubmitted: 1,
        recentResult: `Submitted ${plan.job.title} at ${plan.job.company}`,
      });
      return {
        outcome: 'submitted',
      };
    }

    if (action.kind === 'finish' && !getEasyApplyDialog()) {
      await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
      await postReceipt(apiBaseUrl, plan.attempt.id);
      await reportState({
        dailySubmitted: 1,
        recentResult: `Submitted ${plan.job.title} at ${plan.job.company}`,
      });
      return {
        outcome: 'submitted',
      };
    }

    if (nextFingerprint === previousFingerprint) {
      await scrollDialogToBottom();
      await walkDialogAndAnswerQuestions({
        profile,
        preference,
        jobLocation: plan.job.location,
      });
      await dismissInterferingDialogs();

      const retryFingerprint = getDialogFingerprint();
      const retryAction = clickPrimaryEasyApplyAction();
      const retryNextFingerprint = retryAction
        ? await waitForDialogChange(retryFingerprint, retryAction.kind === 'submit' ? 6500 : 5000)
        : retryFingerprint;

      if (retryAction && retryNextFingerprint !== retryFingerprint) {
        await reportState({
          runStatus: 'running',
          recentResult: `Recovered and continued ${plan.job.title} at ${plan.job.company}`,
        });
        continue;
      }

      if (retryAction?.kind === 'submit' && hasSubmissionSuccessState()) {
        await postStatus(apiBaseUrl, plan.attempt.id, 'submitted');
        await postReceipt(apiBaseUrl, plan.attempt.id);
        await dismissSuccessfulApplicationDialog();
        await reportState({
          dailySubmitted: 1,
          recentResult: `Submitted ${plan.job.title} at ${plan.job.company}`,
        });
        return {
          outcome: 'submitted',
        };
      }

      await reportState({
        runStatus: 'running',
        recentResult: `Still waiting after clicking ${retryAction?.label || action.label || 'the primary action'} for ${plan.job.company}`,
      });
    }
  }

  await postReview(apiBaseUrl, plan.attempt.id, 'Could not complete Easy Apply flow');
  await reportState({
    pendingReviewCount: 1,
    recentResult: `Manual finish needed for ${plan.job.company}`,
  });
  await dismissCurrentApplicationDialog();
  return {
    outcome: 'review',
    reason: `Could not complete Easy Apply flow for ${plan.job.company}`,
  };
};

const executePlanOnCurrentPage = async ({
  apiBaseUrl,
  plan,
}: {
  apiBaseUrl: string;
  plan: JobPlan;
}) => {
  const bootstrap = await fetchBootstrap(apiBaseUrl);

  if (/\/jobs\/search/.test(window.location.pathname)) {
    await reportState({
      runStatus: 'running',
      recentResult: `Loading ${plan.job.title} in the search results view`,
    });
    const selected = await ensureJobSelectedOnPage({
      externalJobId: plan.job.externalJobId,
      title: plan.job.title,
    });
    if (!selected) {
      throw new Error(
        `Could not focus ${plan.job.title} in the search results view. ${describeJobCardSurface()}`,
      );
    }
  }

  await reportState({
    runStatus: 'running',
    recentResult: `Applying to ${plan.job.title} at ${plan.job.company}`,
  });

  const outcome = await processPlan({
    plan,
    apiBaseUrl,
    profile: bootstrap.profile,
    preference: bootstrap.preference,
    allowAttemptDespiteReview: true,
  });

  if (outcome.outcome !== 'submitted') {
    throw new Error(outcome.reason);
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

  await reportState({
    runStatus: 'running',
    recentResult: 'Preparing the selected LinkedIn job...',
  });

  const bootstrap = await fetchBootstrap(apiBaseUrl);
  await reportState({
    runStatus: 'running',
    recentResult: 'Waiting for the selected LinkedIn job to finish loading...',
  });

  const selectedJob = await waitForCurrentSelectedLinkedInJob();
  if (!selectedJob) {
    throw new Error(
      `Could not resolve the selected LinkedIn job on this page. ${describeJobCardSurface()}`,
    );
  }

  await reportState({
    runStatus: 'running',
    recentResult:
      targetCount > 1
        ? `Demo mode is applying only to the selected job: ${selectedJob.title}`
        : `Using the selected LinkedIn job: ${selectedJob.title}`,
  });

  const { run, plans } = await startServerRun({
    apiBaseUrl,
    jobs: [selectedJob],
    targetCount: 1,
  });

  await reportState({
    activeRunId: run.id,
    runStatus: 'running',
    recentResult: `Queued ${plans.length} LinkedIn job${plans.length === 1 ? '' : 's'}`,
  });

  if (plans.length === 0) {
    await reportState({
      runStatus: 'completed',
      activeRunId: null,
      recentResult: 'No supported LinkedIn job was queued from this page.',
    });
    return;
  }

  if (!runState.active || runState.paused) {
    await reportState({
      activeRunId: null,
      runStatus: 'paused',
      recentResult: 'Run paused',
    });
    return;
  }

  const plan = plans[0]!;
  if (/\/jobs\/search/.test(window.location.pathname)) {
    await reportState({
      activeRunId: run.id,
      runStatus: 'running',
      recentResult: `Opening ${plan.job.title} in a LinkedIn detail page`,
    });

    const response = (await sendRuntimeMessage({
      type: 'applypilot:run-plan-in-worker-tab',
      apiBaseUrl,
      plan,
      sourceTabId,
    } satisfies ExtensionMessage)) as { ok?: boolean; error?: string } | undefined;

    if (!response?.ok) {
      throw new Error(response?.error ?? `Could not open ${plan.job.title} in a worker tab.`);
    }

    await reportState({
      activeRunId: null,
      runStatus: 'completed',
      recentResult: 'Run completed',
    });
    return;
  }

  const outcome = await processPlan({
    plan,
    apiBaseUrl,
    profile: bootstrap.profile,
    preference: bootstrap.preference,
    allowAttemptDespiteReview: true,
  });

  if (outcome.outcome !== 'submitted') {
    await reportState({
      activeRunId: null,
      runStatus: 'failed',
      recentResult: outcome.reason,
    });
    return;
  }

  await reportState({
    activeRunId: null,
    runStatus: 'completed',
    recentResult: 'Run completed',
  });
};

const maybeResumePendingWorkerPlan = async () => {
  if (contentScriptWindow.__applypilotLinkedInAutoResumeStarted) {
    return;
  }
  contentScriptWindow.__applypilotLinkedInAutoResumeStarted = true;

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
      recentResult: `Continuing ${pending.plan.job.title} on LinkedIn`,
    });

    await executePlanOnCurrentPage({
      apiBaseUrl: pending.apiBaseUrl,
      plan: pending.plan,
    });

    await sendRuntimeMessage({
      type: 'applypilot:worker-plan-finished',
      status: 'completed',
    } satisfies ExtensionMessage);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : 'LinkedIn worker run failed unexpectedly.';

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

if (!contentScriptWindow.__applypilotLinkedInListenerRegistered) {
  contentScriptWindow.__applypilotLinkedInListenerRegistered = true;

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
          error instanceof Error ? error.message : 'LinkedIn run failed unexpectedly.';
        await reportState({
          activeRunId: null,
          runStatus: 'failed',
          recentResult: messageText,
        });
          sendResponse({ ok: false, error: messageText });
        }
        return;
      }

      if (message.type === 'applypilot:collect-current-job-on-page') {
        try {
          const selectedJob = await waitForCurrentSelectedLinkedInJob();
          if (!selectedJob) {
            sendResponse({
              ok: false,
              error: `Could not resolve the selected LinkedIn job on this page. ${describeJobCardSurface()}`,
            });
            return;
          }

          sendResponse({
            ok: true,
            job: selectedJob,
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'Could not read the selected LinkedIn job.';
          sendResponse({
            ok: false,
            error: messageText,
          });
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
            error instanceof Error ? error.message : 'LinkedIn worker execution failed unexpectedly.';
          await reportState({
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
        void reportState({
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
