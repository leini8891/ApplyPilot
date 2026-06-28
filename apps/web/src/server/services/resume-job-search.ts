import {
  type CandidateProfile,
  type JobPosting,
  type JobPreference,
  type MatchScore,
  type ResumeVersion,
  scoreJobAgainstPreferences,
  sourcePlatformSchema,
} from '@applypilot/domain';

import { slugify } from '@/lib/utils';

import { isAiConfigured, parseCandidateProfileWithAi } from './ai';
import { saveManualJob } from './app-service';
import {
  isAdzunaSearchConfigured,
  searchAdzunaJobs,
  type JobAggregatorConfig,
} from './job-aggregator';
import type { AppStore } from './store';
import { recordUsage } from './usage-meter';

const SEARCH_QUERY_STOPWORDS = new Set([
  'and',
  'for',
  'the',
  'with',
  'from',
  'that',
  'this',
  'have',
  'has',
  'years',
  'experience',
  'manager',
  'lead',
  'senior',
]);

const uniqueStrings = (items: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];

  items.forEach((item) => {
    const normalized = item.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    unique.push(normalized);
  });

  return unique;
};

const extractResumeSearchTerms = (resumeText: string) =>
  uniqueStrings(
    resumeText
      .match(/\b[A-Za-z][A-Za-z0-9+#.-]{2,}\b/g)
      ?.map((term) => term.trim())
      .filter((term) => !SEARCH_QUERY_STOPWORDS.has(term.toLowerCase())) ?? [],
  ).slice(0, 6);

const resolveSearchLimit = (limit: unknown, fallback: number) => {
  const parsed = typeof limit === 'number' ? limit : Number(limit);

  if (!Number.isFinite(parsed)) {
    return Math.max(1, Math.min(25, fallback));
  }

  return Math.max(1, Math.min(25, Math.floor(parsed)));
};

const buildResumeJobSearchQuery = ({
  profile,
  preference,
  resume,
}: {
  profile: CandidateProfile;
  preference: JobPreference;
  resume: ResumeVersion;
}) => {
  const targetRole =
    preference.targetRoles[0] ?? profile.targetRoles[0] ?? 'Product Manager';
  const terms = uniqueStrings([
    targetRole,
    ...preference.keywords.slice(0, 4),
    ...preference.industries.slice(0, 2),
    ...profile.skills.slice(0, 4),
    ...extractResumeSearchTerms(resume.textContent),
    preference.remotePolicy === 'remote' ? 'remote' : '',
  ]).slice(0, 10);

  return terms.join(' ');
};

const buildResumeJobSearchLocation = ({
  profile,
  preference,
}: {
  profile: CandidateProfile;
  preference: JobPreference;
}) => {
  const preferredRegion = preference.regions.find(
    (region) => !/remote|anywhere/i.test(region),
  );

  return preferredRegion ?? profile.location ?? '';
};

const scopeJobRecordToCandidate = (
  job: JobPosting,
  candidateId: string,
): JobPosting => ({
  ...job,
  id: `${job.id}_${slugify(candidateId)}`,
});

const ensureProfileFromResume = async ({
  candidateId,
  resume,
  store,
}: {
  candidateId: string;
  resume: ResumeVersion;
  store: AppStore;
}) => {
  const existingProfile = await store.getProfile(candidateId);

  if (existingProfile && resume.parsedProfileId === existingProfile.id) {
    return existingProfile;
  }

  const profile = await parseCandidateProfileWithAi({
    candidateId,
    resumeText: resume.textContent,
  });

  recordUsage({
    candidateId,
    eventType: 'profile_parse',
    provider: 'openai',
    aiCallCount: isAiConfigured() ? 1 : 0,
    metadata: {
      resumeId: resume.id,
      triggeredBy: 'resume_job_search',
      fallbackMode: !isAiConfigured(),
    },
  });

  await store.upsertProfile(profile);
  await store.saveResume({
    ...resume,
    parsedProfileId: profile.id,
  });

  return profile;
};

const saveRankedJob = async ({
  candidateId,
  job,
  profile,
  preference,
  store,
}: {
  candidateId: string;
  job: JobPosting;
  profile: CandidateProfile;
  preference: JobPreference;
  store: AppStore;
}) => {
  const source = sourcePlatformSchema.parse(job.source);
  const savedJob = await saveManualJob({
    candidateId,
    input: {
      source,
      title: job.title,
      company: job.company,
      location: job.location,
      salaryText: job.salaryText ?? undefined,
      employmentType: job.employmentType ?? undefined,
      url: job.url,
      description: job.description,
      easyApply: job.easyApply,
    },
  });
  const score = scoreJobAgainstPreferences(profile, preference, savedJob);

  await store.saveMatchScore(score);

  return {
    job: savedJob,
    score,
  };
};

export const searchJobsFromResume = async ({
  candidateId,
  resumeId,
  limit,
  aggregatorConfig,
  store,
}: {
  candidateId: string;
  resumeId?: string | null;
  limit?: number;
  aggregatorConfig?: JobAggregatorConfig;
  store: AppStore;
}) => {
  const [resumes, preference] = await Promise.all([
    store.listResumes(candidateId),
    store.getPreferences(candidateId),
  ]);
  const resume = resumeId
    ? resumes.find((item) => item.id === resumeId)
    : resumes[0];

  if (!resume) {
    throw new Error('Upload a resume before searching jobs.');
  }

  if (!preference) {
    throw new Error('Save job preferences before searching jobs.');
  }

  if (!isAdzunaSearchConfigured(aggregatorConfig)) {
    recordUsage({
      candidateId,
      eventType: 'resume_job_search_disabled',
      provider: 'adzuna',
      metadata: {
        reason: 'missing_api_key',
        resumeId: resume.id,
      },
    });

    return {
      enabled: false,
      provider: 'adzuna' as const,
      disabledReason: 'missing_api_key' as const,
      query: '',
      location: '',
      fetchedCount: 0,
      savedCount: 0,
      savedJobs: [],
    };
  }

  const profile = await ensureProfileFromResume({
    candidateId,
    resume,
    store,
  });
  const searchLimit = resolveSearchLimit(
    limit,
    Math.min(preference.dailyTarget, 10),
  );
  const query = buildResumeJobSearchQuery({
    profile,
    preference,
    resume,
  });
  const location = buildResumeJobSearchLocation({
    profile,
    preference,
  });

  recordUsage({
    candidateId,
    eventType: 'resume_job_search',
    provider: 'adzuna',
    searchCount: 1,
    metadata: {
      queryLength: query.length,
      hasLocation: location.length > 0,
      requestedLimit: searchLimit,
    },
  });
  const searchResult = await searchAdzunaJobs({
    query,
    location,
    limit: Math.min(50, Math.max(searchLimit * 2, searchLimit)),
    config: aggregatorConfig,
  });

  if (!searchResult.enabled) {
    return {
      enabled: false,
      provider: searchResult.provider,
      disabledReason: searchResult.disabledReason,
      query,
      location,
      fetchedCount: 0,
      savedCount: 0,
      savedJobs: [],
    };
  }

  const scoredJobs = searchResult.jobs
    .map((job) => {
      const scopedJob = scopeJobRecordToCandidate(job, candidateId);
      const score = scoreJobAgainstPreferences(profile, preference, scopedJob);

      return {
        job,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score.overall !== left.score.overall) {
        return right.score.overall - left.score.overall;
      }

      return right.job.scrapedAt.localeCompare(left.job.scrapedAt);
    })
    .slice(0, searchLimit);

  const savedJobs: Array<{ job: JobPosting; score: MatchScore }> = [];

  for (const { job } of scoredJobs) {
    savedJobs.push(
      await saveRankedJob({
        candidateId,
        job,
        profile,
        preference,
        store,
      }),
    );
  }

  return {
    enabled: true,
    provider: searchResult.provider,
    attribution: searchResult.attribution,
    query,
    location,
    fetchedCount: searchResult.jobs.length,
    savedCount: savedJobs.length,
    savedJobs,
  };
};
