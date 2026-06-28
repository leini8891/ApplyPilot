export type YesNoUnknown = 'yes' | 'no' | 'unknown';

export type FormMappingPreference = {
  minSalary?: number;
  salaryCurrency?: string;
  applicationSalaryAmount?: number;
  yearsExperienceOverride?: number | null;
  noticePeriodWeeks?: number | null;
  workAuthorization?: YesNoUnknown;
  requiresVisaSponsorship?: YesNoUnknown;
  willingToRelocate?: YesNoUnknown;
};

export type SalaryFallbackPeriod = 'annual' | 'monthly';

export type QuestionAnswerSource =
  | 'applicationSalaryAmount'
  | 'minSalary'
  | 'noticePeriodWeeks'
  | 'requiresVisaSponsorship'
  | 'salaryCurrency'
  | 'willingToRelocate'
  | 'workAuthorization'
  | 'yearsExperienceOverride';

export type QuestionCategory =
  | 'relocation'
  | 'salaryAmount'
  | 'salaryCurrency'
  | 'startAvailability'
  | 'visaSponsorship'
  | 'noticePeriod'
  | 'workAuthorization'
  | 'yearsExperience';

export type TextQuestionAnswer =
  | {
      outcome: 'answer';
      category: Exclude<QuestionCategory, 'startAvailability'>;
      source: QuestionAnswerSource;
      value: string;
    }
  | {
      outcome: 'review';
      category: QuestionCategory | 'ambiguous';
      reason: string;
      sources?: QuestionAnswerSource[];
    }
  | {
      outcome: 'ignore';
    };

export type ChoiceQuestionAnswer =
  | {
      outcome: 'answer';
      category: Exclude<QuestionCategory, 'startAvailability'>;
      optionIndex: number;
      source: QuestionAnswerSource;
      value: string;
    }
  | {
      outcome: 'review';
      category: QuestionCategory | 'ambiguous';
      reason: string;
      sources?: QuestionAnswerSource[];
    }
  | {
      outcome: 'ignore';
    };

type CategoryMatch = {
  category: QuestionCategory;
  source: QuestionAnswerSource;
};

type ResolveOptions = {
  salaryFallbackPeriod?: SalaryFallbackPeriod;
};

export const normalizeQuestionText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+$.'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasAny = (value: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(value));

const uniqueMatches = (matches: CategoryMatch[]) => {
  const seen = new Set<QuestionCategory>();
  return matches.filter((match) => {
    if (seen.has(match.category)) {
      return false;
    }
    seen.add(match.category);
    return true;
  });
};

export const detectQuestionCategories = (
  questionText: string,
): CategoryMatch[] => {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) {
    return [];
  }

  const matches: CategoryMatch[] = [];
  const asksAboutSalary = hasAny(normalized, [
    /\bsalary\b/,
    /\bcompensation\b/,
    /\bexpected pay\b/,
    /\bpay expectation\b/,
    /\bexpected package\b/,
    /\bbase pay\b/,
    /\bbase salary\b/,
    /\bremuneration\b/,
    /\bctc\b/,
  ]);

  if (asksAboutSalary && /\bcurrency\b/.test(normalized)) {
    matches.push({ category: 'salaryCurrency', source: 'salaryCurrency' });
  } else if (asksAboutSalary) {
    matches.push({
      category: 'salaryAmount',
      source: 'applicationSalaryAmount',
    });
  }

  if (
    hasAny(normalized, [
      /\bnotice period\b/,
      /\bcurrent notice\b/,
      /\bweeks? notice\b/,
    ])
  ) {
    matches.push({ category: 'noticePeriod', source: 'noticePeriodWeeks' });
  } else if (
    hasAny(normalized, [
      /\bavailable to (start|join)\b/,
      /\bavailability to (start|join)\b/,
      /\bwhen can you (start|join)\b/,
      /\bearliest (start|join)(ing)? date\b/,
      /\b(start|join)(ing)? date\b/,
    ])
  ) {
    matches.push({
      category: 'startAvailability',
      source: 'noticePeriodWeeks',
    });
  }

  if (
    !/\bage\b/.test(normalized) &&
    hasAny(normalized, [
      /\bhow many years\b/,
      /\bminimum years\b/,
      /\byrs?\b.*\bexperience\b/,
      /\byears?\b.*\bexperience\b/,
      /\bexperience\b.*\byrs?\b/,
      /\bexperience\b.*\byears?\b/,
    ])
  ) {
    matches.push({
      category: 'yearsExperience',
      source: 'yearsExperienceOverride',
    });
  }

  const asksAboutSponsorship = hasAny(normalized, [
    /\bsponsor(ship)?\b/,
    /\brequire\b.*\bvisa\b/,
    /\bneed\b.*\bvisa\b/,
    /\bvisa\b.*\bsupport\b/,
    /\bwork visa\b.*\brequire\b/,
    /\bemployment pass\b.*\brequire\b/,
    /\bh-?1b\b/,
  ]);
  if (asksAboutSponsorship) {
    matches.push({
      category: 'visaSponsorship',
      source: 'requiresVisaSponsorship',
    });
  }

  const asksAboutWorkAuthorization = hasAny(normalized, [
    /\bright to work\b/,
    /\blegally\b.*\b(authori[sz]ed|eligible)\b.*\b(work|employ)/,
    /\b(authori[sz]ed|authori[sz]ation|authori[sz]e|eligible)\b.*\b(work|employ)/,
    /\b(work|employment)\b.*\b(authori[sz]ed|authori[sz]ation|eligible)\b/,
    /\bvalid\b.*\b(work permit|work pass|work visa)\b/,
  ]);
  if (asksAboutWorkAuthorization) {
    matches.push({
      category: 'workAuthorization',
      source: 'workAuthorization',
    });
  }

  if (
    hasAny(normalized, [
      /\brelocat(e|ion|ing)?\b/,
      /\bwilling to move\b/,
      /\bopen to moving\b/,
      /\bmove to\b.*\b(role|job|position)\b/,
    ])
  ) {
    matches.push({ category: 'relocation', source: 'willingToRelocate' });
  }

  return uniqueMatches(matches);
};

const getSingleCategory = (questionText: string) => {
  const matches = detectQuestionCategories(questionText);
  if (matches.length === 0) {
    return { kind: 'none' as const };
  }

  if (matches.length > 1) {
    return { kind: 'ambiguous' as const, matches };
  }

  return { kind: 'match' as const, match: matches[0]! };
};

const getYesNoPreference = (
  preference: FormMappingPreference | null | undefined,
  source: 'requiresVisaSponsorship' | 'willingToRelocate' | 'workAuthorization',
) => {
  const value = preference?.[source];
  return value === 'yes' || value === 'no' ? value : null;
};

const getFiniteNumber = (
  value: number | null | undefined,
  options?: { allowZero?: boolean },
) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  (options?.allowZero ? value >= 0 : value > 0)
    ? value
    : null;

const formatNumberAnswer = (value: number) =>
  String(Math.max(0, Math.round(value)));

const resolveSalaryAmount = (
  questionText: string,
  preference: FormMappingPreference | null | undefined,
  options?: ResolveOptions,
): {
  source: 'applicationSalaryAmount' | 'minSalary';
  value: string;
} | null => {
  const normalized = normalizeQuestionText(questionText);
  if (
    hasAny(normalized, [
      /\bcurrent salary\b/,
      /\blast drawn\b/,
      /\bprevious salary\b/,
      /\bpresent salary\b/,
    ])
  ) {
    return null;
  }

  if (hasAny(normalized, [/\bhourly\b/, /\bper hour\b/, /\bhour rate\b/])) {
    return null;
  }

  const applicationAmount = getFiniteNumber(
    preference?.applicationSalaryAmount,
  );
  if (applicationAmount !== null) {
    return {
      source: 'applicationSalaryAmount',
      value: formatNumberAnswer(applicationAmount),
    };
  }

  const minSalary = getFiniteNumber(preference?.minSalary);
  if (minSalary === null) {
    return null;
  }

  const period = /\b(monthly|per month|month)\b/.test(normalized)
    ? 'monthly'
    : /\b(annual|annually|yearly|per year|year)\b/.test(normalized)
      ? 'annual'
      : (options?.salaryFallbackPeriod ?? 'annual');

  return {
    source: 'minSalary',
    value: formatNumberAnswer(
      period === 'monthly' ? minSalary / 12 : minSalary,
    ),
  };
};

export const resolveTextQuestionAnswer = (
  questionText: string,
  preference: FormMappingPreference | null | undefined,
  options?: ResolveOptions,
): TextQuestionAnswer => {
  const categoryResult = getSingleCategory(questionText);

  if (categoryResult.kind === 'none') {
    return { outcome: 'ignore' };
  }

  if (categoryResult.kind === 'ambiguous') {
    return {
      outcome: 'review',
      category: 'ambiguous',
      reason: 'Question matches multiple saved preference fields.',
      sources: categoryResult.matches.map((match) => match.source),
    };
  }

  const { category, source } = categoryResult.match;

  if (category === 'startAvailability') {
    return {
      outcome: 'review',
      category,
      reason:
        'Question asks for an exact start date, but saved preference only stores notice period.',
      sources: [source],
    };
  }

  if (
    source === 'workAuthorization' ||
    source === 'requiresVisaSponsorship' ||
    source === 'willingToRelocate'
  ) {
    const value = getYesNoPreference(preference, source);
    return value
      ? {
          outcome: 'answer',
          category,
          source,
          value,
        }
      : {
          outcome: 'review',
          category,
          reason: `Saved preference does not include ${source}.`,
          sources: [source],
        };
  }

  if (source === 'noticePeriodWeeks') {
    const value = getFiniteNumber(preference?.noticePeriodWeeks, {
      allowZero: true,
    });
    return value !== null
      ? {
          outcome: 'answer',
          category,
          source,
          value: formatNumberAnswer(value),
        }
      : {
          outcome: 'review',
          category,
          reason: 'Saved preference does not include notice period.',
          sources: [source],
        };
  }

  if (source === 'yearsExperienceOverride') {
    const value = getFiniteNumber(preference?.yearsExperienceOverride);
    return value !== null
      ? {
          outcome: 'answer',
          category,
          source,
          value: formatNumberAnswer(value),
        }
      : {
          outcome: 'review',
          category,
          reason:
            'Saved preference does not include years of experience override.',
          sources: [source],
        };
  }

  if (source === 'salaryCurrency') {
    const value = preference?.salaryCurrency?.trim().toUpperCase() ?? '';
    return value
      ? {
          outcome: 'answer',
          category,
          source,
          value,
        }
      : {
          outcome: 'review',
          category,
          reason: 'Saved preference does not include salary currency.',
          sources: [source],
        };
  }

  const salary = resolveSalaryAmount(questionText, preference, options);
  return salary
    ? {
        outcome: 'answer',
        category,
        source: salary.source,
        value: salary.value,
      }
    : {
        outcome: 'review',
        category,
        reason:
          'Saved preference does not include a safe salary answer for this question.',
        sources: ['applicationSalaryAmount', 'minSalary'],
      };
};

const normalizeChoiceLabel = (value: string) =>
  normalizeQuestionText(value).replace(/^\W+|\W+$/g, '');

const isYesChoice = (label: string) =>
  /\byes\b/.test(label) ||
  /\bi am\b/.test(label) ||
  /\bi do\b/.test(label) ||
  /\bauthorized\b/.test(label) ||
  /\bauthorised\b/.test(label) ||
  /\beligible\b/.test(label) ||
  /\bwilling\b/.test(label) ||
  /\bopen to\b/.test(label);

const isNoChoice = (label: string) =>
  /\bno\b/.test(label) ||
  /\bi am not\b/.test(label) ||
  /\bi do not\b/.test(label) ||
  /\bdon't\b/.test(label) ||
  /\bnot willing\b/.test(label) ||
  /\bunable\b/.test(label);

const findYesNoChoiceIndex = (
  choiceLabels: string[],
  expected: 'yes' | 'no',
) => {
  const candidates = choiceLabels.map((label, index) => ({
    index,
    label: normalizeChoiceLabel(label),
  }));

  return (
    candidates.find((candidate) => {
      if (!candidate.label) {
        return false;
      }

      const yes = isYesChoice(candidate.label);
      const no = isNoChoice(candidate.label);
      return expected === 'yes' ? yes && !no : no;
    })?.index ?? null
  );
};

type NumericChoice = {
  index: number;
  min: number;
  max: number;
};

const parseNumericChoice = (
  label: string,
  index: number,
): NumericChoice | null => {
  const normalized = normalizeChoiceLabel(label);
  const rawNumbers = normalized.match(/\d+(?:\.\d+)?/g) ?? [];
  const numbers = rawNumbers
    .map(Number)
    .filter((value) => Number.isFinite(value));

  if (numbers.length === 0) {
    return null;
  }

  const first = numbers[0]!;

  if (/\b(less than|under|below)\b/.test(normalized)) {
    return { index, min: 0, max: first };
  }

  if (/\+|\b(or more|and above|or above|over|more than)\b/.test(normalized)) {
    return { index, min: first, max: Number.POSITIVE_INFINITY };
  }

  if (numbers.length >= 2) {
    return {
      index,
      min: Math.min(numbers[0]!, numbers[1]!),
      max: Math.max(numbers[0]!, numbers[1]!),
    };
  }

  return { index, min: first, max: first };
};

const findNumericChoiceIndex = (choiceLabels: string[], desired: number) => {
  const choices = choiceLabels
    .map((label, index) => parseNumericChoice(label, index))
    .filter((choice): choice is NumericChoice => choice !== null);

  const containing = choices
    .filter((choice) => desired >= choice.min && desired <= choice.max)
    .sort((left, right) => {
      const leftWidth = left.max - left.min;
      const rightWidth = right.max - right.min;
      if (leftWidth !== rightWidth) {
        return leftWidth - rightWidth;
      }
      return right.min - left.min;
    });

  if (containing[0]) {
    return containing[0].index;
  }

  const closestFloor = choices
    .filter((choice) => choice.min <= desired)
    .sort((left, right) => right.min - left.min);

  return closestFloor[0]?.index ?? null;
};

const findCurrencyChoiceIndex = (choiceLabels: string[], currency: string) => {
  const normalizedCurrency = normalizeQuestionText(currency);
  return choiceLabels.findIndex((label) => {
    const normalized = normalizeChoiceLabel(label);
    return (
      normalized === normalizedCurrency ||
      normalized.includes(normalizedCurrency)
    );
  });
};

export const resolveChoiceQuestionAnswer = ({
  questionText,
  choiceLabels,
  preference,
  salaryFallbackPeriod,
}: {
  questionText: string;
  choiceLabels: string[];
  preference?: FormMappingPreference | null;
  salaryFallbackPeriod?: SalaryFallbackPeriod;
}): ChoiceQuestionAnswer => {
  const textAnswer = resolveTextQuestionAnswer(questionText, preference, {
    salaryFallbackPeriod,
  });

  if (textAnswer.outcome !== 'answer') {
    return textAnswer;
  }

  if (
    textAnswer.source === 'workAuthorization' ||
    textAnswer.source === 'requiresVisaSponsorship' ||
    textAnswer.source === 'willingToRelocate'
  ) {
    const optionIndex = findYesNoChoiceIndex(
      choiceLabels,
      textAnswer.value as 'yes' | 'no',
    );
    return optionIndex !== null
      ? {
          outcome: 'answer',
          category: textAnswer.category,
          optionIndex,
          source: textAnswer.source,
          value: textAnswer.value,
        }
      : {
          outcome: 'review',
          category: textAnswer.category,
          reason:
            'Could not match saved yes/no preference to the available choices.',
          sources: [textAnswer.source],
        };
  }

  if (
    textAnswer.source === 'yearsExperienceOverride' ||
    textAnswer.source === 'noticePeriodWeeks'
  ) {
    const desired = Number(textAnswer.value);
    const optionIndex = findNumericChoiceIndex(choiceLabels, desired);
    return optionIndex !== null
      ? {
          outcome: 'answer',
          category: textAnswer.category,
          optionIndex,
          source: textAnswer.source,
          value: textAnswer.value,
        }
      : {
          outcome: 'review',
          category: textAnswer.category,
          reason:
            'Could not match saved numeric preference to the available choices.',
          sources: [textAnswer.source],
        };
  }

  if (textAnswer.source === 'salaryCurrency') {
    const optionIndex = findCurrencyChoiceIndex(choiceLabels, textAnswer.value);
    return optionIndex >= 0
      ? {
          outcome: 'answer',
          category: textAnswer.category,
          optionIndex,
          source: textAnswer.source,
          value: textAnswer.value,
        }
      : {
          outcome: 'review',
          category: textAnswer.category,
          reason:
            'Could not match saved salary currency to the available choices.',
          sources: [textAnswer.source],
        };
  }

  return {
    outcome: 'review',
    category: textAnswer.category,
    reason: 'This mapped question is not safe to answer from a fixed choice.',
    sources: [textAnswer.source],
  };
};
