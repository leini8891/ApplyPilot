import { z } from 'zod';

import type { JobPosting } from '@applypilot/domain';

import { env, hasAdzunaConfig } from '@/lib/env';
import { slugify } from '@/lib/utils';

export type JobAggregatorConfig = {
  appId?: string | null;
  appKey?: string | null;
  country?: string | null;
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
};

type AdzunaSearchInput = {
  query: string;
  location?: string | null;
  limit?: number;
  page?: number;
  config?: JobAggregatorConfig;
};

const adzunaCompanySchema = z.object({
  display_name: z.string().optional(),
});

const adzunaLocationSchema = z.object({
  display_name: z.string().optional(),
});

const adzunaJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().optional(),
  company: adzunaCompanySchema.optional(),
  location: adzunaLocationSchema.optional(),
  redirect_url: z.string().url().optional(),
  description: z.string().optional(),
  contract_time: z.string().nullable().optional(),
  contract_type: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  created: z.string().optional(),
});

const adzunaSearchResponseSchema = z.object({
  count: z.number().default(0),
  results: z.array(adzunaJobSchema).default([]),
});

const clampLimit = (limit: number | undefined) =>
  Math.max(1, Math.min(50, Math.floor(limit ?? 20)));

const cleanDescription = (value: string | undefined) =>
  (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTimestamp = (value: string | undefined) => {
  const parsed = value ? new Date(value) : null;

  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
};

const formatSalaryText = ({
  min,
  max,
}: {
  min?: number | null;
  max?: number | null;
}) => {
  if (typeof min !== 'number' && typeof max !== 'number') {
    return null;
  }

  if (typeof min === 'number' && typeof max === 'number') {
    return `Estimated salary ${Math.round(min)} - ${Math.round(max)}`;
  }

  return `Estimated salary ${Math.round((min ?? max) as number)}`;
};

const formatEmploymentType = ({
  contractTime,
  contractType,
}: {
  contractTime?: string | null;
  contractType?: string | null;
}) =>
  [contractTime, contractType]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.replace(/_/g, ' '))
    .join(', ') || null;

const resolveAdzunaConfig = (config?: JobAggregatorConfig) => ({
  appId: config?.appId ?? env.ADZUNA_APP_ID ?? null,
  appKey: config?.appKey ?? env.ADZUNA_APP_KEY ?? null,
  country: (config?.country ?? env.ADZUNA_COUNTRY).toLowerCase(),
  baseUrl: (config?.baseUrl ?? env.ADZUNA_BASE_URL).replace(/\/+$/, ''),
  fetchImpl: config?.fetchImpl ?? fetch,
});

export const isAdzunaSearchConfigured = (config?: JobAggregatorConfig) => {
  if (config) {
    return Boolean(config.appId && config.appKey);
  }

  return hasAdzunaConfig;
};

export const mapAdzunaJobToPosting = (
  job: z.infer<typeof adzunaJobSchema>,
): JobPosting => {
  const externalJobId = String(job.id);

  return {
    id: `adzuna_${slugify(externalJobId)}`,
    source: 'adzuna',
    externalJobId,
    title: job.title?.trim() || 'Untitled role',
    company: job.company?.display_name?.trim() || 'Unknown company',
    location: job.location?.display_name?.trim() || '',
    salaryText: formatSalaryText({
      min: job.salary_min,
      max: job.salary_max,
    }),
    employmentType: formatEmploymentType({
      contractTime: job.contract_time,
      contractType: job.contract_type,
    }),
    url: job.redirect_url ?? 'https://www.adzuna.com/',
    description: cleanDescription(job.description),
    easyApply: false,
    detectedQuestions: [],
    scrapedAt: normalizeTimestamp(job.created),
  };
};

export const searchAdzunaJobs = async ({
  query,
  location,
  limit,
  page = 1,
  config,
}: AdzunaSearchInput) => {
  const resolved = resolveAdzunaConfig(config);

  if (!isAdzunaSearchConfigured(config)) {
    return {
      enabled: false as const,
      provider: 'adzuna' as const,
      attribution: 'Jobs by Adzuna',
      disabledReason: 'missing_api_key' as const,
      jobs: [],
      totalCount: 0,
    };
  }

  const url = new URL(
    `${resolved.baseUrl}/jobs/${resolved.country}/search/${Math.max(1, page)}`,
  );
  url.searchParams.set('app_id', resolved.appId ?? '');
  url.searchParams.set('app_key', resolved.appKey ?? '');
  url.searchParams.set('what', query);
  url.searchParams.set('results_per_page', String(clampLimit(limit)));
  url.searchParams.set('content-type', 'application/json');

  if (location?.trim()) {
    url.searchParams.set('where', location.trim());
  }

  const response = await resolved.fetchImpl(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Adzuna search failed with HTTP ${response.status}.`);
  }

  const payload = adzunaSearchResponseSchema.parse(await response.json());

  return {
    enabled: true as const,
    provider: 'adzuna' as const,
    attribution: 'Jobs by Adzuna',
    jobs: payload.results.map(mapAdzunaJobToPosting),
    totalCount: payload.count,
  };
};
