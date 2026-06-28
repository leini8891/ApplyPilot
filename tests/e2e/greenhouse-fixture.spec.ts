import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  resolveChoiceQuestionAnswer,
  resolveTextQuestionAnswer,
  type FormMappingPreference,
} from '../../apps/extension/src/content/form-mapping';

type FixtureQuestion = {
  label: string;
  choices: string[];
};

const preference: FormMappingPreference = {
  minSalary: 144000,
  salaryCurrency: 'SGD',
  applicationSalaryAmount: 123000,
  yearsExperienceOverride: 8,
  noticePeriodWeeks: 2,
  workAuthorization: 'yes',
  requiresVisaSponsorship: 'no',
  willingToRelocate: 'yes',
};

test('mocked Greenhouse fixture maps standard application questions from preferences', async ({
  page,
}) => {
  const html = await fs.readFile(
    path.join(process.cwd(), 'tests/fixtures/greenhouse-application.html'),
    'utf8',
  );

  await page.setContent(html);

  await expect(page.locator('h1')).toHaveText('Senior Product Manager');
  await expect(page.locator('form#application-form')).toBeVisible();

  const questions = await page
    .locator('#application-form .field')
    .evaluateAll((fields) =>
      fields.map((field) => {
        const label =
          field
            .querySelector('legend, label')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? '';
        const selectOptions = Array.from(
          field.querySelectorAll('select option'),
        ).map(
          (option) => option.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        );
        const radioOptions = Array.from(
          field.querySelectorAll('input[type="radio"]'),
        ).map(
          (radio) =>
            radio.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ??
            radio.getAttribute('value') ??
            '',
        );

        return {
          label,
          choices: selectOptions.length > 0 ? selectOptions : radioOptions,
        };
      }),
    );

  const findQuestion = (pattern: RegExp): FixtureQuestion => {
    const question = questions.find((candidate) =>
      pattern.test(candidate.label),
    );
    expect(question, `Missing fixture question for ${pattern}`).toBeTruthy();
    return question!;
  };

  const workAuth = findQuestion(/authorized to work/i);
  expect(
    resolveChoiceQuestionAnswer({
      questionText: workAuth.label,
      choiceLabels: workAuth.choices,
      preference,
    }),
  ).toMatchObject({
    outcome: 'answer',
    optionIndex: 0,
    source: 'workAuthorization',
  });

  const sponsorship = findQuestion(/visa sponsorship/i);
  expect(
    resolveChoiceQuestionAnswer({
      questionText: sponsorship.label,
      choiceLabels: sponsorship.choices,
      preference,
    }),
  ).toMatchObject({
    outcome: 'answer',
    optionIndex: 1,
    source: 'requiresVisaSponsorship',
  });

  const relocation = findQuestion(/relocation/i);
  expect(
    resolveChoiceQuestionAnswer({
      questionText: relocation.label,
      choiceLabels: relocation.choices,
      preference,
    }),
  ).toMatchObject({
    outcome: 'answer',
    optionIndex: 1,
    source: 'willingToRelocate',
  });

  const years = findQuestion(/years of product management/i);
  expect(
    resolveChoiceQuestionAnswer({
      questionText: years.label,
      choiceLabels: years.choices,
      preference,
    }),
  ).toMatchObject({
    outcome: 'answer',
    optionIndex: 3,
    source: 'yearsExperienceOverride',
  });

  expect(
    resolveTextQuestionAnswer(findQuestion(/notice period/i).label, preference),
  ).toMatchObject({
    outcome: 'answer',
    source: 'noticePeriodWeeks',
    value: '2',
  });
  expect(
    resolveTextQuestionAnswer(
      findQuestion(/annual compensation/i).label,
      preference,
    ),
  ).toMatchObject({
    outcome: 'answer',
    source: 'applicationSalaryAmount',
    value: '123000',
  });
  expect(
    resolveTextQuestionAnswer(
      findQuestion(/current salary/i).label,
      preference,
    ),
  ).toMatchObject({
    outcome: 'review',
    category: 'salaryAmount',
  });
});
