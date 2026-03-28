import {
  chooseReviewPriority,
  type ApplicationAttempt,
  applicationStatusSchema,
  type CandidateProfile,
  type InterviewRecord,
  type JobPosting,
  type JobPreference,
  type MatchScore,
  jobPreferenceSchema,
  needsReviewRouting,
  scoreJobAgainstPreferences,
  type SourcePlatform,
  sourcePlatformSchema,
} from '@applypilot/domain';

import { shortId, slugify } from '@/lib/utils';

import { generateTailoredResumeWithAi, parseCandidateProfileWithAi, scoreJobWithAi } from './ai';
import { renderTailoredResumePdf } from './resume-pdf';
import { extractResumeText } from './resume';
import { store } from './store';

const defaultCandidateId = 'demo-user';
const syntheticJobIds = new Set(['job_linkedin_1', 'job_linkedin_2', 'linkedin_senior-product-manager-growth']);
const syntheticJobUrls = new Set([
  'https://www.linkedin.com/jobs/view/12345/',
  'https://www.linkedin.com/jobs/view/56789/',
  'https://www.linkedin.com/jobs/view/999/',
]);

export type DailyPick = {
  job: JobPosting;
  score: MatchScore;
  fitSignals: string[];
  watchouts: string[];
  sourceLabel: string;
  freshnessLabel: string;
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

export const getCandidateId = (explicitCandidateId?: string) => explicitCandidateId ?? defaultCandidateId;

export const getDashboardData = async (candidateId = defaultCandidateId) =>
  store.getDashboardSnapshot(candidateId);

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

  const asset = await store.storeBinaryAsset({
    path: `resumes/${candidateId}/${Date.now()}-${slugify(file.name)}`,
    contentType: file.type || 'application/octet-stream',
    bytes,
  });

  await store.ensureCandidateProfile(candidateId);

  return store.saveResume({
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
  const resumes = await store.listResumes(candidateId);
  const resume = resumes.find((item) => item.id === resumeId);

  if (!resume) {
    throw new Error('Resume not found.');
  }

  const profile = await parseCandidateProfileWithAi({
    candidateId,
    resumeText: resume.textContent,
  });

  await store.upsertProfile(profile);
  await store.saveResume({
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
  await store.ensureCandidateProfile(candidateId);

  const parsedInput =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  return store.upsertPreferences(
    jobPreferenceSchema.parse({
      candidateId,
      ...parsedInput,
    }),
  );
};

const nonEmptyString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const optionalNonEmptyString = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const buildJobRecord = (input: Partial<JobPosting>) => {
  const normalizedTitle = nonEmptyString(input.title, 'Untitled role');
  const normalizedCompany = nonEmptyString(input.company, 'Unknown company');
  const normalizedExternalJobId = nonEmptyString(input.externalJobId ?? input.id, shortId());

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

const hasRegionMatch = (job: JobPosting, preference: JobPreference) =>
  preference.regions.length === 0 ||
  preference.regions.some((region) => job.location.toLowerCase().includes(region.toLowerCase()));

const hasTargetRoleMatch = (job: JobPosting, profile: CandidateProfile) =>
  profile.targetRoles.some((role) => job.title.toLowerCase().includes(role.toLowerCase()));

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

const describeFreshness = (scrapedAt: string) => {
  const timestamp = new Date(scrapedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Added recently';
  }

  const dayDiff = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));

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
  fromSavedPool,
}: {
  job: JobPosting;
  profile: CandidateProfile;
  preference: JobPreference;
  score: MatchScore;
  fromSavedPool: boolean;
}): DailyPick => {
  const fitSignals = [
    `${score.overall}% overall match from your saved profile and preferences`,
    score.keywordHits.length > 0
      ? `Keyword hits: ${score.keywordHits.slice(0, 3).join(', ')}`
      : null,
    hasTargetRoleMatch(job, profile) && profile.targetRoles[0]
      ? `Title overlaps with target roles like ${profile.targetRoles[0]}`
      : null,
    hasRegionMatch(job, preference) ? `Location fits your region filters` : null,
    job.salaryText ? `Salary listed: ${job.salaryText}` : null,
  ].filter((item): item is string => Boolean(item));

  const watchouts = [
    score.gaps.length > 0 ? `Missing keywords: ${score.gaps.slice(0, 3).join(', ')}` : null,
    !job.easyApply ? 'Manual application flow' : null,
    !hasRegionMatch(job, preference) && preference.regions.length > 0
      ? `Outside preferred regions: ${preference.regions.slice(0, 2).join(', ')}`
      : null,
    preference.vipCompanies.some((company) => company.toLowerCase() === job.company.toLowerCase())
      ? 'VIP company, worth a deliberate review'
      : null,
    !job.salaryText ? 'Salary not listed' : null,
  ].filter((item): item is string => Boolean(item));

  return {
    job,
    score,
    fitSignals: fitSignals.length > 0 ? fitSignals : ['Profile overlap looks promising'],
    watchouts,
    sourceLabel: fromSavedPool ? `${job.source} saved pool` : `${job.source} sample pool`,
    freshnessLabel: describeFreshness(job.scrapedAt),
  };
};

export const getDailyPicks = async (
  candidateId = defaultCandidateId,
  limit = 3,
): Promise<DailyPicksSnapshot> => {
  const [profile, preference, jobs, attempts] = await Promise.all([
    store.getProfile(candidateId),
    store.getPreferences(candidateId),
    store.listJobs(),
    store.listAttempts(candidateId),
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

  const attemptedJobIds = new Set(attempts.map((attempt) => attempt.jobPostingId));
  const savedPool = dedupeJobs(
    jobs.filter((job) => !attemptedJobIds.has(job.id) && !isSyntheticJob(job)),
  );

  const combinedPool = savedPool;

  const picks = combinedPool
    .map((job) => {
      const score = scoreJobAgainstPreferences(profile, preference, job);

      return buildDailyPick({
        job,
        profile,
        preference,
        score,
        fromSavedPool: true,
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
  await store.ensureCandidateProfile(candidateId);

  const source = sourcePlatformSchema.parse(input.source ?? 'linkedin');
  const url = nonEmptyString(input.url, '');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Please enter a full job URL.');
  }

  const externalIdFromUrl =
    url.match(/\/jobs\/view\/(\d+)/i)?.[1] ??
    url.match(/job\/([A-Za-z0-9-]+)/i)?.[1] ??
    slugify(nonEmptyString(input.title, 'manual-role'));

  return store.saveJob(
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
  );
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
    store.getProfile(candidateId),
    store.getPreferences(candidateId),
    store.listResumes(candidateId),
  ]);

  if (!profile || !preferences || resumes.length === 0) {
    throw new Error('Upload a resume and save job preferences before scoring jobs.');
  }

  const job = await store.saveJob(buildJobRecord(jobInput));
  const score = await scoreJobWithAi({
    profile,
    preferences,
    job,
  });
  await store.saveMatchScore(score);

  const reviewReasons = needsReviewRouting({
    job,
    preferences,
    // Do not block the run plan purely because the listing hints at questions.
    // We route to review later only if the live Easy Apply dialog cannot be completed.
    knockoutConfidence: 0.95,
    riskSignals: [],
  });

  const baseResume = resumes[0]!;
  const resumeUploadUrl = store.getAssetPublicUrl(baseResume.storagePath);
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
    const asset = await store.storeBinaryAsset({
      path: `tailored-resumes/${candidateId}/${tailoredResume.id}.pdf`,
      contentType: 'application/pdf',
      bytes: Buffer.from(pdfBytes),
    });

    persistedResume = await store.saveTailoredResume({
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
    store.getProfile(candidateId),
    store.getPreferences(candidateId),
    store.listResumes(candidateId),
  ]);

  if (!profile || !preferences || resumes.length === 0) {
    throw new Error('Upload a resume and save job preferences before creating a run plan.');
  }

  const run = await store.createRun({
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
    notes: jobs?.length ? `Queued ${jobs.length} jobs` : 'Run started from dashboard',
  });

  const stagedJobs = jobs?.length ? jobs : [
    {
      source,
      title: 'Senior Product Manager, Growth',
      company: 'Aspire',
      location: 'Singapore',
      url: 'https://www.linkedin.com/jobs/view/999/',
      description:
        'Own product growth loops, subscription experiments, CRM and fintech user journeys.',
      easyApply: true,
      detectedQuestions: ['How many years of B2B SaaS experience do you have?'],
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
    const { job, reviewReasons, tailoredResume, resumeUploadUrl, resumeFileName } =
      await scoreJobForCandidate({
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

    await store.saveAttempt(attempt);
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
      await store.createReviewItem({
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

export const markApplicationForReview = async ({
  candidateId,
  applicationId,
  reason,
}: {
  candidateId: string;
  applicationId: string;
  reason: string;
}) => {
  const detail = await store.getApplicationDetail(candidateId, applicationId);
  if (!detail || !detail.job) {
    throw new Error('Application not found.');
  }

  const updatedAttempt = await store.saveAttempt({
    ...detail.attempt,
    status: 'needs_review',
    reviewReason: reason,
    updatedAt: new Date().toISOString(),
  });

  const review = await store.createReviewItem({
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
  const detail = await store.getApplicationDetail(candidateId, applicationId);
  if (!detail) {
    throw new Error('Application not found.');
  }

  const nextStatus = applicationStatusSchema.parse(status);

  return store.saveAttempt({
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
  const detail = await store.getApplicationDetail(candidateId, applicationId);
  if (!detail) {
    throw new Error('Application not found.');
  }

  const [header, payload] = dataUrl.split(',');
  if (!header || !payload) {
    throw new Error('Invalid screenshot payload.');
  }

  const contentType = header.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const asset = await store.storeBinaryAsset({
    path: `receipts/${candidateId}/${applicationId}.png`,
    contentType,
    bytes: Buffer.from(payload, 'base64'),
  });

  return store.saveAttempt({
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
  const detail = await store.getApplicationDetail(candidateId, input.applicationId);
  if (!detail) {
    throw new Error('Application not found for interview note.');
  }

  return store.saveInterview({
    ...input,
    id: `interview_${shortId()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

export const getApplicationDetail = async (candidateId: string, applicationId: string) =>
  store.getApplicationDetail(candidateId, applicationId);

export const getProfileOrThrow = async (candidateId: string): Promise<CandidateProfile> => {
  const profile = await store.getProfile(candidateId);
  if (!profile) {
    throw new Error('Candidate profile not found.');
  }

  return profile;
};
