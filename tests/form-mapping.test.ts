import {
  detectQuestionCategories,
  resolveChoiceQuestionAnswer,
  resolveTextQuestionAnswer,
  type FormMappingPreference,
} from '../apps/extension/src/content/form-mapping';

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

describe('application form question mapping', () => {
  it('maps common text questions to saved preferences only', () => {
    expect(
      resolveTextQuestionAnswer(
        'Are you legally authorized to work in Singapore?',
        preference,
      ),
    ).toMatchObject({
      outcome: 'answer',
      source: 'workAuthorization',
      value: 'yes',
    });

    expect(
      resolveTextQuestionAnswer(
        'Will you now or in the future require visa sponsorship?',
        preference,
      ),
    ).toMatchObject({
      outcome: 'answer',
      source: 'requiresVisaSponsorship',
      value: 'no',
    });

    expect(
      resolveTextQuestionAnswer(
        'Are you open to relocation for this role?',
        preference,
      ),
    ).toMatchObject({
      outcome: 'answer',
      source: 'willingToRelocate',
      value: 'yes',
    });

    expect(
      resolveTextQuestionAnswer('Current notice period in weeks', preference),
    ).toMatchObject({
      outcome: 'answer',
      source: 'noticePeriodWeeks',
      value: '2',
    });

    expect(
      resolveTextQuestionAnswer(
        'How many years of product management experience do you have?',
        preference,
      ),
    ).toMatchObject({
      outcome: 'answer',
      source: 'yearsExperienceOverride',
      value: '8',
    });
  });

  it('maps salary amount and currency without exposing non-preference answers', () => {
    expect(
      resolveTextQuestionAnswer('Expected annual compensation', preference),
    ).toMatchObject({
      outcome: 'answer',
      source: 'applicationSalaryAmount',
      value: '123000',
    });

    expect(
      resolveTextQuestionAnswer('Expected monthly salary', {
        ...preference,
        applicationSalaryAmount: 0,
      }),
    ).toMatchObject({
      outcome: 'answer',
      source: 'minSalary',
      value: '12000',
    });

    expect(
      resolveTextQuestionAnswer('Salary currency', preference),
    ).toMatchObject({
      outcome: 'answer',
      source: 'salaryCurrency',
      value: 'SGD',
    });
  });

  it('routes unsafe or underspecified mapped questions to review', () => {
    expect(
      resolveTextQuestionAnswer('What is your current salary?', preference),
    ).toMatchObject({
      outcome: 'review',
      category: 'salaryAmount',
    });

    expect(
      resolveTextQuestionAnswer('Earliest start date', preference),
    ).toMatchObject({
      outcome: 'review',
      category: 'startAvailability',
    });

    expect(
      resolveTextQuestionAnswer('How many years of experience?', {
        ...preference,
        yearsExperienceOverride: null,
      }),
    ).toMatchObject({
      outcome: 'review',
      category: 'yearsExperience',
    });

    expect(
      resolveTextQuestionAnswer(
        'Are you authorized to work here, and will you need sponsorship?',
        preference,
      ),
    ).toMatchObject({
      outcome: 'review',
      category: 'ambiguous',
    });
  });

  it('chooses fixed options only when a saved preference maps cleanly', () => {
    expect(
      resolveChoiceQuestionAnswer({
        questionText: 'Will you require sponsorship to work in this country?',
        choiceLabels: [
          'Select one',
          "Yes, I'll need sponsorship",
          "No, I don't require sponsorship",
        ],
        preference,
      }),
    ).toMatchObject({
      outcome: 'answer',
      optionIndex: 2,
      source: 'requiresVisaSponsorship',
      value: 'no',
    });

    expect(
      resolveChoiceQuestionAnswer({
        questionText: 'How many years of relevant experience do you have?',
        choiceLabels: [
          'Please select',
          '0-2 years',
          '3-5 years',
          '6-8 years',
          '9+ years',
        ],
        preference,
      }),
    ).toMatchObject({
      outcome: 'answer',
      optionIndex: 3,
      source: 'yearsExperienceOverride',
    });

    expect(
      resolveChoiceQuestionAnswer({
        questionText: 'Are you legally authorized to work?',
        choiceLabels: ['Yes', 'No'],
        preference: { ...preference, workAuthorization: 'unknown' },
      }),
    ).toMatchObject({
      outcome: 'review',
      category: 'workAuthorization',
    });
  });

  it('ignores questions outside the supported preference-backed fields', () => {
    expect(
      detectQuestionCategories('Are you comfortable working weekends?'),
    ).toEqual([]);
    expect(
      resolveTextQuestionAnswer(
        'Are you comfortable working weekends?',
        preference,
      ),
    ).toEqual({
      outcome: 'ignore',
    });
  });
});
