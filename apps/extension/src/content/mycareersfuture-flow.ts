export type McfFlowStage = 'resume' | 'review' | 'success' | 'unknown';

const firstNonEmpty = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';

const textOf = (element: Element | null | undefined) => element?.textContent?.trim() ?? '';

const normalizeToken = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

export const elementLabel = (element: HTMLElement) =>
  firstNonEmpty(
    textOf(element),
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('value'),
  ).toLowerCase();

export const isVisibleElement = (element: Element) => {
  const rect = element.getBoundingClientRect();
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};

export const isDisabledElement = (element: HTMLElement) =>
  ('disabled' in element && Boolean((element as HTMLButtonElement).disabled)) ||
  element.getAttribute('aria-disabled') === 'true';

export const detectMcfFlowStage = (container: ParentNode) => {
  const text = normalizeToken(textOf(container as Element)).slice(0, 8000);
  const buttonLabels = Array.from(
    container.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
  )
    .filter((button) => isVisibleElement(button) && !isDisabledElement(button))
    .map((button) => normalizeToken(elementLabel(button)))
    .join('|');

  if (/application submitted|submitted successfully|successfully applied|已发送申请|已提交申请|申请已发送|success/.test(text)) {
    return 'success' as const;
  }

  if (/step\s*1\s*of|upload resume|select an existing resume|must include one resume/.test(text)) {
    return 'resume' as const;
  }

  if (
    /^next,?\s*review application$/.test(buttonLabels) ||
    /\|next,?\s*review application(?:\||$)/.test(buttonLabels) ||
    /\|next(?:\||$)/.test(buttonLabels)
  ) {
    return 'resume' as const;
  }

  if (
    /step\s*2\s*of|take a look through your application/.test(text) ||
    /\|submit(?: application)?(?:\||$)/.test(buttonLabels)
  ) {
    return 'review' as const;
  }

  return 'unknown' as const;
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

export const getVisibleMcfActionButtons = (container: ParentNode) =>
  Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .filter((button) => isVisibleElement(button) && !isDisabledElement(button));

export const findPrimaryMcfFlowAction = (container: ParentNode) => {
  const buttons = getVisibleMcfActionButtons(container);
  const stage = detectMcfFlowStage(container);

  const pick = (patterns: RegExp[], kind: 'advance' | 'submit' | 'finish') => {
    const candidate = rankActionButtons(buttons, patterns)[0];
    if (!candidate) {
      return null;
    }

    return {
      button: candidate.button,
      kind,
      stage,
      label: candidate.label,
    };
  };

  if (stage === 'resume') {
    return (
      pick([/^next,?\s*review application$/, /^next$/, /review application/, /continue/], 'advance') ??
      pick([/^submit$/, /submit application/, /submit/], 'submit')
    );
  }

  if (stage === 'review') {
    return (
      pick([/^submit$/, /submit application/, /submit/], 'submit') ??
      pick([/^next$/, /continue/], 'advance')
    );
  }

  if (stage === 'success') {
    return pick([/^done$/, /^finish$/, /^close$/, /done|finish|close|完成|关闭/], 'finish');
  }

  return (
    pick([/^submit$/, /submit/], 'submit') ??
    pick([/^next$/, /review application/, /continue/, /view/, /preview/], 'advance') ??
    pick([/^done$/, /^finish$/, /^close$/, /done|finish|close|完成|关闭/], 'finish')
  );
};
