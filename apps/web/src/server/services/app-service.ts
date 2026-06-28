import { AsyncLocalStorage } from 'node:async_hooks';

import {
  chooseReviewPriority,
  type ApplicationAttempt,
  applicationStatusSchema,
  type CandidateProfile,
  type InterviewRecord,
  type JobPosting,
  type JobPreference,
  type MatchScore,
  type ResumeVersion,
  jobPreferenceSchema,
  needsReviewRouting,
  scoreJobAgainstPreferences,
  type SourcePlatform,
  sourcePlatformSchema,
} from '@applypilot/domain';

import { shortId, slugify } from '@/lib/utils';

import {
  generateTailoredResumeWithAi,
  parseCandidateProfileWithAi,
  scoreJobWithAi,
} from './ai';
import {
  getKnowledgeBaseEntries,
  matchKnowledgeEntriesForJob,
  type KnowledgeMatch,
} from './knowledge-base';
import { renderTailoredResumePdf } from './resume-pdf';
import { extractResumeText } from './resume';
import { store, type AppStore } from './store';

const syntheticJobIds = new Set([
  'job_linkedin_1',
  'job_linkedin_2',
  'linkedin_senior-product-manager-growth',
]);
const syntheticJobUrls = new Set([
  'https://www.linkedin.com/jobs/view/12345/',
  'https://www.linkedin.com/jobs/view/56789/',
  'https://www.linkedin.com/jobs/view/999/',
]);
const savedJobsRunPrefix = 'run_saved_jobs';
const dailyPickHiddenStatuses = new Set<ApplicationAttempt['status']>([
  'submitted',
  'viewed',
  'interview',
  'offer',
  'rejected',
  'failed',
]);

const appStoreContext = new AsyncLocalStorage<AppStore>();

const getStore = () => appStoreContext.getStore() ?? store;

export const withAppStore = async <T>(
  appStore: AppStore,
  callback: () => Promise<T>,
) => appStoreContext.run(appStore, callback);

export type ResumeMaterialMatch = {
  title: string;
  sourceLabel: string;
  reason: string;
  highlights: string[];
  tags: string[];
};

export type DailyPick = {
  job: JobPosting;
  score: MatchScore;
  applicationId: string | null;
  fitSignals: string[];
  watchouts: string[];
  sourceLabel: string;
  freshnessLabel: string;
  resumeMatches: ResumeMaterialMatch[];
  knowledgeMatches: KnowledgeMatch[];
};

export type DailyPicksSnapshot = {
  generatedAt: string;
  picks: DailyPick[];
  poolSize: number;
  savedPoolSize: number;
  samplePoolSize: number;
  profile: CandidateProfile | null;
  preference: JobPreference | null;
  setupRequired: boolean;
};

export type ApplicationWorkflowChecklistItem = {
  id: string;
  label: string;
  detail: string;
  state: 'ready' | 'needs_input' | 'blocked';
};

export type ApplicationWorkflow = {
  applicationId: string;
  preparedAt: string | null;
  job: JobPosting;
  score: MatchScore;
  checklist: ApplicationWorkflowChecklistItem[];
  resumeMatches: ResumeMaterialMatch[];
  knowledgeMatches: KnowledgeMatch[];
  nextActions: string[];
};

export const getDashboardData = async (candidateId: string) =>
  getStore().getDashboardSnapshot(candidateId);

export const handleResumeUpload = async ({
  candidateId,
  file,
  label,
}: {
  candidateId: string;
  file: File;
  label?: string;
}) => {
  const bytes = Buffer.from(await file.arrayBuffer());
  const textContent = await extractResumeText({
    fileName: file.name,
    contentType: file.type,
    bytes,
  });

  const asset = await getStore().storeBinaryAsset({
    path: `resumes/${candidateId}/${Date.now()}-${slugify(file.name)}`,
    contentType: file.type || 'application/octet-stream',
    bytes,
  });

  await getStore().ensureCandidateProfile(candidateId);

  return getStore().saveResume({
    id: `resume_${shortId()}`,
    candidateId,
    label: label?.trim() || 'Uploaded resume',
    sourceFileName: file.name,
    sourceFileType: file.type || 'application/octet-stream',
    textContent,
    storagePath: asset.storagePath,
    createdAt: new Date().toISOString(),
    parsedProfileId: null,
  });
};

export const parseProfileFromResume = async ({
  candidateId,
  resumeId,
}: {
  candidateId: string;
  resumeId: string;
}) => {
  const resumes = await getStore().listResumes(candidateId);
  const resume = resumes.find((item) => item.id === resumeId);

  if (!resume) {
    throw new Error('Resume not found.');
  }

  const profile = await parseCandidateProfileWithAi({
    candidateId,
    resumeText: resume.textContent,
  });

  await getStore().upsertProfile(profile);
  await getStore().saveResume({
    ...resume,
    parsedProfileId: profile.id,
  });

  return profile;
};

export const savePreferences = async ({
  candidateId,
  input,
}: {
  candidateId: string;
  input: unknown;
}) => {
  await getStore().ensureCandidateProfile(candidateId);

  const parsedInput =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {};

  return getStore().upsertPreferences(
    jobPreferenceSchema.parse({
      candidateId,
      ...parsedInput,
    }),
  );
};

const nonEmptyString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;

const optionalNonEmptyString = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const buildJobRecord = (input: Partial<JobPosting>) => {
  const normalizedTitle = nonEmptyString(input.title, 'Untitled role');
  const normalizedCompany = nonEmptyString(input.company, 'Unknown company');
  const normalizedExternalJobId = nonEmptyString(
    input.externalJobId ?? input.id,
    shortId(),
  );

  return {
    id:
      input.id && input.id.trim().length > 0
        ? input.id
        : `${input.source ?? 'linkedin'}_${slugify(normalizedExternalJobId ?? normalizedTitle)}`,
    source: input.source ?? 'linkedin',
    externalJobId: normalizedExternalJobId,
    title: normalizedTitle,
    company: normalizedCompany,
    location: nonEmptyString(input.location, ''),
    salaryText: optionalNonEmptyString(input.salaryText),
    employmentType: optionalNonEmptyString(input.employmentType),
    url: nonEmptyString(input.url, 'https://www.linkedin.com/jobs/'),
    description: nonEmptyString(input.description, ''),
    easyApply: input.easyApply ?? false,
    detectedQuestions: input.detectedQuestions ?? [],
    scrapedAt: input.scrapedAt ?? new Date().toISOString(),
  };
};

const scopeJobRecordToCandidate = (
  job: JobPosting,
  candidateId: string,
): JobPosting => ({
  ...job,
  id: `${job.id}_${slugify(candidateId)}`,
});

const hasRegionMatch = (job: JobPosting, preference: JobPreference) =>
  preference.regions.length === 0 ||
  preference.regions.some((region) =>
    job.location.toLowerCase().includes(region.toLowerCase()),
  );

const getTargetRoles = (
  profile: CandidateProfile,
  preference: JobPreference,
) => [...preference.targetRoles, ...profile.targetRoles];

const hasTargetRoleMatch = (
  job: JobPosting,
  profile: CandidateProfile,
  preference: JobPreference,
) =>
  getTargetRoles(profile, preference).some((role) =>
    job.title.toLowerCase().includes(role.toLowerCase()),
  );

const dedupeJobs = (jobs: JobPosting[]) => {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const key = [
      job.source,
      job.externalJobId.toLowerCase(),
      job.title.toLowerCase(),
      job.company.toLowerCase(),
    ].join('|');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const isSyntheticJob = (job: JobPosting) =>
  syntheticJobIds.has(job.id) ||
  syntheticJobUrls.has(job.url) ||
  ['12345', '56789', '999'].includes(job.externalJobId);

const normalizeMaterialText = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9+#]+/i)
    .filter(Boolean)
    .join(' ');

const materialTermMatches = (haystack: string, value: string) => {
  const normalized = normalizeMaterialText(value);

  if (!normalized) {
    return false;
  }

  if (` ${haystack} `.includes(` ${normalized} `)) {
    return true;
  }

  const haystackTokens = new Set(haystack.split(' ').filter(Boolean));
  const tokens = normalized.split(' ').filter(Boolean);

  return (
    tokens.length > 0 && tokens.every((token) => haystackTokens.has(token))
  );
};

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

const buildResumeSearchTerms = (job: JobPosting, score: MatchScore) =>
  uniqueStrings([
    ...score.keywordHits,
    ...job.title.split(/[^a-z0-9+#]+/i).filter((term) => term.length > 2),
    ...job.description
      .split(/[^a-z0-9+#]+/i)
      .filter((term) => term.length > 4)
      .slice(0, 20),
  ]).slice(0, 32);

const scoreMaterial = (text: string, terms: string[]) => {
  const haystack = normalizeMaterialText(text);
  const matchedTerms = terms.filter((term) =>
    materialTermMatches(haystack, term),
  );

  return {
    matchedTerms,
    score: matchedTerms.length,
  };
};

const splitResumeSnippets = (text: string) =>
  text
    .split(/(?:\r?\n|(?<=[.!?])\s+)/)
    .map((snippet) => snippet.trim())
    .filter((snippet) => snippet.length >= 24);

export const matchResumeMaterialsForJob = ({
  profile,
  resumes,
  job,
  score,
  limit = 3,
}: {
  profile: CandidateProfile;
  resumes: ResumeVersion[];
  job: JobPosting;
  score: MatchScore;
  limit?: number;
}): ResumeMaterialMatch[] => {
  const terms = buildResumeSearchTerms(job, score);
  const matches: Array<ResumeMaterialMatch & { scoreValue: number }> = [];
  const matchedSkills = profile.skills.filter((skill) =>
    materialTermMatches(
      normalizeMaterialText(`${job.title} ${job.description}`),
      skill,
    ),
  );

  if (matchedSkills.length > 0) {
    matches.push({
      title: 'Parsed profile skills',
      sourceLabel: 'Resume profile',
      reason: `Matched saved skills: ${matchedSkills.slice(0, 4).join(', ')}`,
      highlights: matchedSkills.slice(0, 5),
      tags: matchedSkills.slice(0, 4),
      scoreValue: matchedSkills.length + 1,
    });
  }

  profile.workExperiences.forEach((experience) => {
    const highlights = [experience.summary, ...experience.achievements].filter(
      Boolean,
    );
    const material = [
      experience.company,
      experience.title,
      experience.summary,
      experience.achievements.join(' '),
    ].join(' ');
    const scored = scoreMaterial(material, terms);

    if (scored.score === 0) {
      return;
    }

    const matchedHighlights = highlights.filter(
      (highlight) => scoreMaterial(highlight, terms).score > 0,
    );

    matches.push({
      title: `${experience.title} at ${experience.company}`,
      sourceLabel: 'Resume experience',
      reason: `Matched resume terms: ${scored.matchedTerms.slice(0, 4).join(', ')}`,
      highlights: (matchedHighlights.length > 0
        ? matchedHighlights
        : highlights
      ).slice(0, 3),
      tags: scored.matchedTerms.slice(0, 4),
      scoreValue: scored.score + matchedHighlights.length,
    });
  });

  resumes.forEach((resume) => {
    const snippets = splitResumeSnippets(resume.textContent);
    const matchedSnippets = snippets.filter(
      (snippet) => scoreMaterial(snippet, terms).score > 0,
    );
    const scored = scoreMaterial(resume.textContent, terms);

    if (matchedSnippets.length === 0 || scored.score === 0) {
      return;
    }

    matches.push({
      title: resume.label,
      sourceLabel: 'Resume text',
      reason: `Matched resume text: ${scored.matchedTerms.slice(0, 4).join(', ')}`,
      highlights: matchedSnippets.slice(0, 3),
      tags: scored.matchedTerms.slice(0, 4),
      scoreValue: scored.score + matchedSnippets.length,
    });
  });

  return matches
    .sort((left, right) => {
      if (right.scoreValue !== left.scoreValue) {
        return right.scoreValue - left.scoreValue;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, limit)
    .map(({ scoreValue, ...match }) => match);
};

const describeFreshness = (scrapedAt: string) => {
  const timestamp = new Date(scrapedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Added recently';
  }

  const dayDiff = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 86_400_000),
  );

  if (dayDiff === 0) {
    return 'Seen today';
  }

  if (dayDiff === 1) {
    return 'Seen yesterday';
  }

  return `Seen ${dayDiff} days ago`;
};

const buildDailyPick = ({
  job,
  profile,
  preference,
  score,
  applicationId,
  fromSavedPool,
  resumeMatches,
  knowledgeMatches,
}: {
  job: JobPosting;
  profile: CandidateProfile;
  preference: JobPreference;
  score: MatchScore;
  applicationId: string | null;
  fromSavedPool: boolean;
  resumeMatches: ResumeMaterialMatch[];
  knowledgeMatches: KnowledgeMatch[];
}): DailyPick => {
  const fitSignals = [
    `${score.overall}% match from role, keyword, skill, location, salary, and application-friction signals`,
    ...score.reasons.slice(0, 4),
    hasTargetRoleMatch(job, profile, preference) &&
    getTargetRoles(profile, preference)[0]
      ? `Title overlaps with target roles like ${getTargetRoles(profile, preference)[0]}`
      : null,
    hasRegionMatch(job, preference)
      ? `Location fits your region filters`
      : null,
    job.salaryText ? `Salary listed: ${job.salaryText}` : null,
  ].filter((item): item is string => Boolean(item));

  const watchouts = [
    ...new Set(
      [
        ...score.gaps.slice(0, 4),
        !job.easyApply ? 'Manual application flow' : null,
        !hasRegionMatch(job, preference) && preference.regions.length > 0
          ? `Outside preferred regions: ${preference.regions.slice(0, 2).join(', ')}`
          : null,
        preference.vipCompanies.some(
          (company) => company.toLowerCase() === job.company.toLowerCase(),
        )
          ? 'VIP company, worth a deliberate review'
          : null,
        !job.salaryText ? 'Salary not listed' : null,
      ].filter((item): item is string => Boolean(item)),
    ),
  ];

  return {
    job,
    score,
    applicationId,
    fitSignals:
      fitSignals.length > 0 ? fitSignals : ['Profile overlap looks promising'],
    watchouts,
    sourceLabel: fromSavedPool
      ? `${job.source} saved pool`
      : `${job.source} sample pool`,
    freshnessLabel: describeFreshness(job.scrapedAt),
    resumeMatches,
    knowledgeMatches,
  };
};

export const getDailyPicks = async (
  candidateId: string,
  limit = 3,
): Promise<DailyPicksSnapshot> => {
  const [profile, preference, jobs, attempts, resumes, knowledgeEntries] =
    await Promise.all([
      getStore().getProfile(candidateId),
      getStore().getPreferences(candidateId),
      getStore().listJobs(candidateId),
      getStore().listAttempts(candidateId),
      getStore().listResumes(candidateId),
      getKnowledgeBaseEntries(),
    ]);

  if (!profile || !preference) {
    return {
      generatedAt: new Date().toISOString(),
      picks: [],
      poolSize: 0,
      savedPoolSize: 0,
      samplePoolSize: 0,
      profile,
      preference,
      setupRequired: true,
    };
  }

  const hiddenJobIds = new Set(
    attempts
      .filter((attempt) => dailyPickHiddenStatuses.has(attempt.status))
      .map((attempt) => attempt.jobPostingId),
  );
  const savedPool = dedupeJobs(
    jobs.filter((job) => !hiddenJobIds.has(job.id) && !isSyntheticJob(job)),
  );
  const applicationIdByJobId = new Map(
    attempts.map((attempt) => [attempt.jobPostingId, attempt.id]),
  );

  const combinedPool = savedPool;

  const picks = combinedPool
    .map((job) => {
      const score = scoreJobAgainstPreferences(profile, preference, job);
      const knowledgeMatches = matchKnowledgeEntriesForJob({
        entries: knowledgeEntries,
        job,
        score,
      });
      const resumeMatches = matchResumeMaterialsForJob({
        profile,
        resumes,
        job,
        score,
      });

      return buildDailyPick({
        job,
        profile,
        preference,
        score,
        applicationId: applicationIdByJobId.get(job.id) ?? null,
        fromSavedPool: true,
        resumeMatches,
        knowledgeMatches,
      });
    })
    .sort((left, right) => {
      if (right.score.overall !== left.score.overall) {
        return right.score.overall - left.score.overall;
      }

      if (left.sourceLabel !== right.sourceLabel) {
        return left.sourceLabel.includes('saved') ? -1 : 1;
      }

      if (left.job.easyApply !== right.job.easyApply) {
        return left.job.easyApply ? -1 : 1;
      }

      return right.job.scrapedAt.localeCompare(left.job.scrapedAt);
    })
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    picks,
    poolSize: combinedPool.length,
    savedPoolSize: savedPool.length,
    samplePoolSize: 0,
    profile,
    preference,
    setupRequired: false,
  };
};

const buildSavedJobsRunId = (candidateId: string, source: SourcePlatform) =>
  `${savedJobsRunPrefix}_${slugify(candidateId)}_${source}`;

const buildSavedJobAttemptId = (candidateId: string, job: JobPosting) =>
  `attempt_saved_${slugify(candidateId)}_${slugify(job.id)}`;

const getOrCreateSavedJobsRun = async ({
  candidateId,
  source,
}: {
  candidateId: string;
  source: SourcePlatform;
}) => {
  const runId = buildSavedJobsRunId(candidateId, source);
  const runs = await getStore().listRuns(candidateId);
  const existingRun = runs.find((run) => run.id === runId);

  if (existingRun) {
    return existingRun;
  }

  return getStore().createRun({
    id: runId,
    candidateId,
    source,
    targetCount: 0,
    processedCount: 0,
    successfulCount: 0,
    failedCount: 0,
    pausedCount: 0,
    status: 'idle',
    startedAt: new Date().toISOString(),
    completedAt: null,
    notes: 'Saved jobs synced into the application tracker.',
  });
};

const syncSavedJobToApplicationTracker = async ({
  candidateId,
  job,
}: {
  candidateId: string;
  job: JobPosting;
}) => {
  const run = await getOrCreateSavedJobsRun({
    candidateId,
    source: job.source,
  });
  const attempts = await getStore().listAttempts(candidateId);
  const attemptId = buildSavedJobAttemptId(candidateId, job);
  const existingAttempt = attempts.find(
    (attempt) => attempt.id === attemptId || attempt.jobPostingId === job.id,
  );
  const now = new Date().toISOString();
  const metadata = {
    ...(existingAttempt?.metadata ?? {}),
    company: job.company,
    title: job.title,
    platform: job.source,
    source: 'saved_job',
    jobUrl: job.url,
    savedJobSyncedAt: now,
  };

  if (existingAttempt) {
    return getStore().saveAttempt({
      ...existingAttempt,
      jobPostingId: job.id,
      metadata,
      updatedAt: now,
    });
  }

  return getStore().saveAttempt({
    id: attemptId,
    runId: run.id,
    jobPostingId: job.id,
    tailoredResumeId: null,
    status: 'drafted',
    reviewReason: null,
    receiptPath: null,
    receiptUrl: null,
    lastError: null,
    metadata,
    submittedAt: null,
    updatedAt: now,
  });
};

export const saveManualJob = async ({
  candidateId,
  input,
}: {
  candidateId: string;
  input: {
    source?: unknown;
    title?: unknown;
    company?: unknown;
    location?: unknown;
    salaryText?: unknown;
    employmentType?: unknown;
    url?: unknown;
    description?: unknown;
    easyApply?: unknown;
  };
}) => {
  await getStore().ensureCandidateProfile(candidateId);

  const source = sourcePlatformSchema.parse(input.source ?? 'linkedin');
  const url = nonEmptyString(input.url, '');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Please enter a full job URL.');
  }

  const externalIdFromUrl =
    url.match(/\/jobs\/view\/(\d+)/i)?.[1] ??
    url.match(/\/jobs\/([A-Za-z0-9-]+)/i)?.[1] ??
    url.match(/job\/([A-Za-z0-9-]+)/i)?.[1] ??
    slugify(nonEmptyString(input.title, 'manual-role'));

  const job = await getStore().saveJob(
    scopeJobRecordToCandidate(
      buildJobRecord({
        source,
        externalJobId: externalIdFromUrl,
        title: nonEmptyString(input.title, 'Untitled role'),
        company: nonEmptyString(input.company, 'Unknown company'),
        location: nonEmptyString(input.location, ''),
        salaryText: optionalNonEmptyString(input.salaryText),
        employmentType: optionalNonEmptyString(input.employmentType),
        url,
        description: nonEmptyString(input.description, ''),
        easyApply: Boolean(input.easyApply),
        detectedQuestions: [],
        scrapedAt: new Date().toISOString(),
      }),
      candidateId,
    ),
    candidateId,
  );

  await syncSavedJobToApplicationTracker({
    candidateId,
    job,
  });

  return job;
};

export const scoreJobForCandidate = async ({
  candidateId,
  jobInput,
  includeTailoredResume = true,
}: {
  candidateId: string;
  jobInput: Partial<JobPosting>;
  includeTailoredResume?: boolean;
}) => {
  const [profile, preferences, resumes] = await Promise.all([
    getStore().getProfile(candidateId),
    getStore().getPreferences(candidateId),
    getStore().listResumes(candidateId),
  ]);

  if (!profile || !preferences || resumes.length === 0) {
    throw new Error(
      'Upload a resume and save job preferences before scoring jobs.',
    );
  }

  const job = await getStore().saveJob(
    scopeJobRecordToCandidate(buildJobRecord(jobInput), candidateId),
    candidateId,
  );
  const score = await scoreJobWithAi({
    profile,
    preferences,
    job,
  });
  await getStore().saveMatchScore(score);

  const reviewReasons = needsReviewRouting({
    job,
    preferences,
    // Do not block the run plan purely because the listing hints at questions.
    // We route to review later only if the live Easy Apply dialog cannot be completed.
    knockoutConfidence: 0.95,
    riskSignals: [],
  });

  const baseResume = resumes[0]!;
  const resumeUploadUrl = await getStore().getAssetPublicUrl(
    baseResume.storagePath,
  );
  let persistedResume = null;

  if (includeTailoredResume) {
    const tailoredResume = await generateTailoredResumeWithAi({
      candidateId,
      resume: baseResume,
      profile,
      job,
      score,
    });
    const pdfBytes = await renderTailoredResumePdf({
      profile,
      job,
      tailoredResume,
    });
    const asset = await getStore().storeBinaryAsset({
      path: `tailored-resumes/${candidateId}/${tailoredResume.id}.pdf`,
      contentType: 'application/pdf',
      bytes: Buffer.from(pdfBytes),
    });

    persistedResume = await getStore().saveTailoredResume({
      ...tailoredResume,
      pdfStoragePath: asset.storagePath,
      downloadUrl: asset.publicUrl,
    });
  }

  return {
    job,
    score,
    tailoredResume: persistedResume,
    reviewReasons,
    resumeUploadUrl,
    resumeFileName: baseResume.sourceFileName,
  };
};

export const startRun = async ({
  candidateId,
  source,
  targetCount,
  jobs,
}: {
  candidateId: string;
  source: SourcePlatform;
  targetCount: number;
  jobs?: Partial<JobPosting>[];
}) => {
  const [profile, preferences, resumes] = await Promise.all([
    getStore().getProfile(candidateId),
    getStore().getPreferences(candidateId),
    getStore().listResumes(candidateId),
  ]);

  if (!profile || !preferences || resumes.length === 0) {
    throw new Error(
      'Upload a resume and save job preferences before creating a run plan.',
    );
  }

  const run = await getStore().createRun({
    id: `run_${shortId()}`,
    candidateId,
    source,
    targetCount,
    processedCount: 0,
    successfulCount: 0,
    failedCount: 0,
    pausedCount: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    notes: jobs?.length
      ? `Queued ${jobs.length} jobs`
      : 'Run started from dashboard',
  });

  const stagedJobs = jobs?.length
    ? jobs
    : [
        {
          source,
          title: 'Product Manager, Growth',
          company: 'Demo Growth Co',
          location: 'Remote',
          url: 'https://www.linkedin.com/jobs/view/999/',
          description:
            'Own product growth loops, subscription experiments, CRM workflows, and analytics journeys.',
          easyApply: true,
          detectedQuestions: [
            'How many years of B2B SaaS experience do you have?',
          ],
        },
      ];

  const attempts: ApplicationAttempt[] = [];
  const plans: Array<{
    attempt: ApplicationAttempt;
    job: JobPosting;
    tailoredResumeId: string | null;
    tailoredResumeUrl: string | null;
    resumeUploadUrl: string | null;
    resumeFileName: string | null;
    reviewReasons: string[];
  }> = [];
  for (const jobInput of stagedJobs) {
    const {
      job,
      reviewReasons,
      tailoredResume,
      resumeUploadUrl,
      resumeFileName,
    } = await scoreJobForCandidate({
      candidateId,
      jobInput,
      includeTailoredResume: false,
    });

    const attempt: ApplicationAttempt = {
      id: `attempt_${shortId()}`,
      runId: run.id,
      jobPostingId: job.id,
      tailoredResumeId: tailoredResume?.id ?? null,
      status: reviewReasons.length > 0 ? 'needs_review' : 'queued',
      reviewReason: reviewReasons[0] ?? null,
      receiptPath: null,
      receiptUrl: null,
      lastError: null,
      metadata: {
        company: job.company,
        title: job.title,
        platform: job.source,
      },
      submittedAt: null,
      updatedAt: new Date().toISOString(),
    };

    await getStore().saveAttempt(attempt);
    attempts.push(attempt);
    plans.push({
      attempt,
      job,
      tailoredResumeId: tailoredResume?.id ?? null,
      tailoredResumeUrl: tailoredResume?.downloadUrl ?? null,
      resumeUploadUrl,
      resumeFileName,
      reviewReasons,
    });

    if (reviewReasons.length > 0) {
      await getStore().createReviewItem({
        id: `review_${shortId()}`,
        applicationId: attempt.id,
        reason: reviewReasons.join('; '),
        company: job.company,
        title: job.title,
        priority: chooseReviewPriority(reviewReasons),
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolutionNotes: null,
      });
    }
  }

  return {
    run,
    attempts,
    plans,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getPreparedAtFromMetadata = (metadata: Record<string, unknown>) => {
  const workflow = metadata.applicationWorkflow;

  if (!isRecord(workflow)) {
    return null;
  }

  return typeof workflow.preparedAt === 'string' ? workflow.preparedAt : null;
};

const buildWorkflowChecklist = ({
  attempt,
  job,
  score,
  resumeMatches,
  knowledgeMatches,
}: {
  attempt: ApplicationAttempt;
  job: JobPosting;
  score: MatchScore;
  resumeMatches: ResumeMaterialMatch[];
  knowledgeMatches: KnowledgeMatch[];
}): ApplicationWorkflowChecklistItem[] => {
  const hasUsefulDescription =
    job.description.trim().split(/\s+/).filter(Boolean).length >= 8;
  const hasWatchouts = score.gaps.length > 0;

  return [
    {
      id: 'role-review',
      label: 'Review role fit',
      detail:
        score.overall >= 55
          ? `${score.overall}% fit with ${score.reasons.slice(0, 2).join('; ')}`
          : `${score.overall}% fit. Review before investing time.`,
      state: score.overall >= 55 ? 'ready' : 'needs_input',
    },
    {
      id: 'job-context',
      label: 'Confirm job context',
      detail: hasUsefulDescription
        ? `Job summary captured for ${job.company}.`
        : 'Paste a fuller job description before tailoring answers.',
      state: hasUsefulDescription ? 'ready' : 'needs_input',
    },
    {
      id: 'resume-evidence',
      label: 'Pick resume evidence',
      detail:
        resumeMatches.length > 0
          ? `${resumeMatches.length} resume evidence item${resumeMatches.length === 1 ? '' : 's'} matched.`
          : 'No resume evidence matched yet. Add resume text or adjust keywords.',
      state: resumeMatches.length > 0 ? 'ready' : 'needs_input',
    },
    {
      id: 'story-assets',
      label: 'Attach story assets',
      detail:
        knowledgeMatches.length > 0
          ? `${knowledgeMatches.length} story/playbook asset${knowledgeMatches.length === 1 ? '' : 's'} ready.`
          : 'No story or playbook asset matched yet.',
      state: knowledgeMatches.length > 0 ? 'ready' : 'needs_input',
    },
    {
      id: 'watchouts',
      label: 'Resolve watchouts',
      detail: hasWatchouts
        ? score.gaps.slice(0, 3).join('; ')
        : 'No major watchouts from current filters.',
      state: hasWatchouts ? 'needs_input' : 'ready',
    },
    {
      id: 'application-channel',
      label: 'Open application channel',
      detail: job.easyApply
        ? 'Quick apply signal captured. Open the role and confirm the live form.'
        : 'Manual apply flow expected. Keep tracker open while applying.',
      state: job.url ? 'ready' : 'blocked',
    },
    {
      id: 'tracker-state',
      label: 'Update tracker state',
      detail:
        attempt.status === 'drafted'
          ? 'Preparing this workflow will move the card to queued.'
          : `Current tracker state: ${attempt.status.replace('_', ' ')}.`,
      state: 'ready',
    },
  ];
};

const buildWorkflowNextActions = ({
  attempt,
  job,
  checklist,
}: {
  attempt: ApplicationAttempt;
  job: JobPosting;
  checklist: ApplicationWorkflowChecklistItem[];
}) => {
  const blockers = checklist.filter((item) => item.state !== 'ready');

  if (attempt.status === 'submitted') {
    return [
      'Save the receipt or confirmation screenshot.',
      'Watch for recruiter response and move to viewed/interview when needed.',
    ];
  }

  if (attempt.status === 'interview') {
    return [
      'Open interview notes and prepare role-specific stories.',
      'Keep the application card linked to follow-up notes.',
    ];
  }

  if (attempt.status === 'needs_review') {
    return [
      'Resolve the review note before applying.',
      'Move the card back to queued once the blocker is clear.',
    ];
  }

  if (blockers.length > 0) {
    return [
      `Resolve ${blockers.length} checklist item${blockers.length === 1 ? '' : 's'} before submitting.`,
      'Add missing job context, resume evidence, or story assets if needed.',
    ];
  }

  return [
    `Open ${job.source} role page and apply manually.`,
    'After submitting, move this card to submitted and attach a receipt if available.',
  ];
};

export const getApplicationWorkflow = async ({
  candidateId,
  applicationId,
}: {
  candidateId: string;
  applicationId: string;
}): Promise<ApplicationWorkflow> => {
  const detail = await getStore().getApplicationDetail(
    candidateId,
    applicationId,
  );

  if (!detail || !detail.job) {
    throw new Error('Application not found.');
  }

  const [profile, preference, resumes, knowledgeEntries] = await Promise.all([
    getStore().getProfile(candidateId),
    getStore().getPreferences(candidateId),
    getStore().listResumes(candidateId),
    getKnowledgeBaseEntries(),
  ]);

  if (!profile || !preference) {
    throw new Error(
      'Upload a resume and save job preferences before preparing applications.',
    );
  }

  const score = scoreJobAgainstPreferences(profile, preference, detail.job);
  const resumeMatches = matchResumeMaterialsForJob({
    profile,
    resumes,
    job: detail.job,
    score,
    limit: 4,
  });
  const knowledgeMatches = matchKnowledgeEntriesForJob({
    entries: knowledgeEntries,
    job: detail.job,
    score,
    limit: 4,
  });
  const checklist = buildWorkflowChecklist({
    attempt: detail.attempt,
    job: detail.job,
    score,
    resumeMatches,
    knowledgeMatches,
  });

  return {
    applicationId,
    preparedAt: getPreparedAtFromMetadata(detail.attempt.metadata),
    job: detail.job,
    score,
    checklist,
    resumeMatches,
    knowledgeMatches,
    nextActions: buildWorkflowNextActions({
      attempt: detail.attempt,
      job: detail.job,
      checklist,
    }),
  };
};

export const prepareApplicationWorkflow = async ({
  candidateId,
  applicationId,
}: {
  candidateId: string;
  applicationId: string;
}) => {
  const detail = await getStore().getApplicationDetail(
    candidateId,
    applicationId,
  );

  if (!detail || !detail.job) {
    throw new Error('Application not found.');
  }

  const workflow = await getApplicationWorkflow({
    candidateId,
    applicationId,
  });
  const preparedAt = new Date().toISOString();
  const nextStatus =
    detail.attempt.status === 'drafted' ? 'queued' : detail.attempt.status;
  const metadata = {
    ...detail.attempt.metadata,
    company: detail.job.company,
    title: detail.job.title,
    platform: detail.job.source,
    jobUrl: detail.job.url,
    applicationWorkflow: {
      version: 1,
      preparedAt,
      scoreOverall: workflow.score.overall,
      recommendedAction: workflow.score.recommendedAction,
      checklist: workflow.checklist,
      resumeMatches: workflow.resumeMatches,
      knowledgeMatches: workflow.knowledgeMatches,
      nextActions: workflow.nextActions,
    },
  };

  await getStore().saveMatchScore(workflow.score);
  const application = await getStore().saveAttempt({
    ...detail.attempt,
    status: nextStatus,
    metadata,
    updatedAt: preparedAt,
  });

  return {
    application,
    workflow: {
      ...workflow,
      preparedAt,
    },
  };
};

export const markApplicationForReview = async ({
  candidateId,
  applicationId,
  reason,
}: {
  candidateId: string;
  applicationId: string;
  reason: string;
}) => {
  const detail = await getStore().getApplicationDetail(
    candidateId,
    applicationId,
  );
  if (!detail || !detail.job) {
    throw new Error('Application not found.');
  }

  const updatedAttempt = await getStore().saveAttempt({
    ...detail.attempt,
    status: 'needs_review',
    reviewReason: reason,
    updatedAt: new Date().toISOString(),
  });

  const review = await getStore().createReviewItem({
    id: `review_${shortId()}`,
    applicationId,
    reason,
    company: detail.job.company,
    title: detail.job.title,
    priority: chooseReviewPriority([reason]),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNotes: null,
  });

  return {
    application: updatedAttempt,
    review,
  };
};

export const updateApplicationStatus = async ({
  candidateId,
  applicationId,
  status,
}: {
  candidateId: string;
  applicationId: string;
  status: unknown;
}) => {
  const detail = await getStore().getApplicationDetail(
    candidateId,
    applicationId,
  );
  if (!detail) {
    throw new Error('Application not found.');
  }

  const nextStatus = applicationStatusSchema.parse(status);

  return getStore().saveAttempt({
    ...detail.attempt,
    status: nextStatus,
    submittedAt:
      nextStatus === 'submitted' && !detail.attempt.submittedAt
        ? new Date().toISOString()
        : detail.attempt.submittedAt,
    updatedAt: new Date().toISOString(),
  });
};

export const attachApplicationReceipt = async ({
  candidateId,
  applicationId,
  dataUrl,
}: {
  candidateId: string;
  applicationId: string;
  dataUrl: string;
}) => {
  const detail = await getStore().getApplicationDetail(
    candidateId,
    applicationId,
  );
  if (!detail) {
    throw new Error('Application not found.');
  }

  const [header, payload] = dataUrl.split(',');
  if (!header || !payload) {
    throw new Error('Invalid screenshot payload.');
  }

  const contentType = header.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const asset = await getStore().storeBinaryAsset({
    path: `receipts/${candidateId}/${applicationId}.png`,
    contentType,
    bytes: Buffer.from(payload, 'base64'),
  });

  return getStore().saveAttempt({
    ...detail.attempt,
    receiptPath: asset.storagePath,
    receiptUrl: asset.publicUrl,
    updatedAt: new Date().toISOString(),
  });
};

export const createInterview = async ({
  candidateId,
  input,
}: {
  candidateId: string;
  input: Omit<InterviewRecord, 'id' | 'createdAt' | 'updatedAt'>;
}) => {
  const detail = await getStore().getApplicationDetail(
    candidateId,
    input.applicationId,
  );
  if (!detail) {
    throw new Error('Application not found for interview note.');
  }

  return getStore().saveInterview({
    ...input,
    id: `interview_${shortId()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

export const getApplicationDetail = async (
  candidateId: string,
  applicationId: string,
) => getStore().getApplicationDetail(candidateId, applicationId);

export const getProfileOrThrow = async (
  candidateId: string,
): Promise<CandidateProfile> => {
  const profile = await getStore().getProfile(candidateId);
  if (!profile) {
    throw new Error('Candidate profile not found.');
  }

  return profile;
};
