import { describe, expect, it, vi } from 'vitest';

import { searchAdzunaJobs } from '../apps/web/src/server/services/job-aggregator';

describe('Adzuna job aggregator', () => {
  it('maps mocked Adzuna search results into job postings', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        count: 2,
        results: [
          {
            id: '123',
            title: 'Product Manager, Workflow Automation',
            company: {
              display_name: 'Workflow Co',
            },
            location: {
              display_name: 'Singapore',
            },
            redirect_url: 'https://www.adzuna.sg/details/123',
            description: '<p>Own workflow automation and analytics.</p>',
            contract_time: 'full_time',
            contract_type: 'permanent',
            salary_min: 120000,
            salary_max: 150000,
            created: '2026-06-28T01:00:00Z',
          },
        ],
      }),
    );

    const result = await searchAdzunaJobs({
      query: 'Product Manager workflow automation',
      location: 'Singapore',
      limit: 5,
      config: {
        appId: 'test-app',
        appKey: 'test-key',
        country: 'sg',
        baseUrl: 'https://api.adzuna.test/v1/api',
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;

    expect(result.enabled).toBe(true);
    expect(requestedUrl.toString()).toContain('/jobs/sg/search/1');
    expect(requestedUrl.searchParams.get('app_id')).toBe('test-app');
    expect(requestedUrl.searchParams.get('app_key')).toBe('test-key');
    expect(requestedUrl.searchParams.get('what')).toBe(
      'Product Manager workflow automation',
    );
    expect(requestedUrl.searchParams.get('where')).toBe('Singapore');
    expect(requestedUrl.searchParams.get('results_per_page')).toBe('5');
    expect(result.jobs[0]).toMatchObject({
      id: 'adzuna_123',
      source: 'adzuna',
      externalJobId: '123',
      title: 'Product Manager, Workflow Automation',
      company: 'Workflow Co',
      location: 'Singapore',
      employmentType: 'full time, permanent',
      salaryText: 'Estimated salary 120000 - 150000',
      description: 'Own workflow automation and analytics.',
      easyApply: false,
    });
  });

  it('disables search without API credentials and does not call fetch', async () => {
    const fetchMock = vi.fn();

    const result = await searchAdzunaJobs({
      query: 'Product Manager',
      config: {
        appId: '',
        appKey: '',
        fetchImpl: fetchMock as typeof fetch,
      },
    });

    expect(result).toMatchObject({
      enabled: false,
      provider: 'adzuna',
      disabledReason: 'missing_api_key',
      jobs: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
