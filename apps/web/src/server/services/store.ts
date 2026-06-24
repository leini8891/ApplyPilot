import {
  buildDashboardSummary,
  demoAttempts,
  demoCandidateProfile,
  demoInterviews,
  demoJobs,
  demoPreferences,
  demoResume,
  demoReviewItems,
  demoRun,
  type ApplicationAttempt,
  type ApplicationRun,
  applicationAttemptSchema,
  applicationRunSchema,
  candidateProfileSchema,
  type CandidateProfile,
  type DashboardSummary,
  type InterviewRecord,
  interviewRecordSchema,
  type JobPosting,
  jobPostingSchema,
  type JobPreference,
  jobPreferenceSchema,
  type MatchScore,
  matchScoreSchema,
  type ResumeVersion,
  resumeVersionSchema,
  type ReviewQueueItem,
  reviewQueueItemSchema,
  type TailoredResume,
  tailoredResumeSchema,
} from '@applypilot/domain';

import { env } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase';

type MemoryStore = {
  profiles: CandidateProfile[];
  resumes: ResumeVersion[];
  preferences: JobPreference[];
  jobs: JobPosting[];
  scores: MatchScore[];
  tailoredResumes: TailoredResume[];
  runs: ApplicationRun[];
  attempts: ApplicationAttempt[];
  reviews: ReviewQueueItem[];
  interviews: InterviewRecord[];
  assets: Record<string, { bytes: string; contentType: string }>;
};

type ApplicationDetail = {
  attempt: ApplicationAttempt;
  run: ApplicationRun | null;
  job: JobPosting | null;
  reviewItems: ReviewQueueItem[];
  interviews: InterviewRecord[];
};

declare global {
  // eslint-disable-next-line no-var
  var __applypilotStore: MemoryStore | undefined;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createSeedStore = (): MemoryStore => ({
  profiles: [demoCandidateProfile],
  resumes: [demoResume],
  preferences: [demoPreferences],
  jobs: demoJobs,
  scores: [],
  tailoredResumes: [],
  runs: [demoRun],
  attempts: demoAttempts,
  reviews: demoReviewItems,
  interviews: demoInterviews,
  assets: {},
});

const memoryStore = globalThis.__applypilotStore ?? createSeedStore();
globalThis.__applypilotStore = memoryStore;

const tableMap = {
  profiles: 'candidate_profiles',
  resumes: 'resume_versions',
  preferences: 'job_preferences',
  jobs: 'job_postings',
  scores: 'match_scores',
  tailoredResumes: 'tailored_resumes',
  runs: 'application_runs',
  attempts: 'application_attempts',
  reviews: 'review_queue_items',
  interviews: 'interview_records',
} as const;

const normalizeTimestamp = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const nonEmptyString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const mapRow = {
  profile: (row: Record<string, unknown>): CandidateProfile =>
    candidateProfileSchema.parse({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      location: row.location,
      yearsExperience: row.years_experience,
      summary: row.summary,
      workExperiences: row.work_experiences,
      skills: row.skills,
      targetRoles: row.target_roles,
      industries: row.industries,
      education: row.education,
      lastParsedAt: normalizeTimestamp(row.last_parsed_at),
    }),
  resume: (row: Record<string, unknown>): ResumeVersion =>
    resumeVersionSchema.parse({
      id: row.id,
      candidateId: row.candidate_id,
      label: row.label,
      sourceFileName: row.source_file_name,
      sourceFileType: row.source_file_type,
      textContent: row.text_content,
      storagePath: row.storage_path,
      createdAt: normalizeTimestamp(row.created_at),
      parsedProfileId: row.parsed_profile_id,
    }),
  preference: (row: Record<string, unknown>): JobPreference =>
    jobPreferenceSchema.parse({
      candidateId: row.candidate_id,
      keywords: row.keywords,
      industries: row.industries,
      regions: row.regions,
      minSalary: row.min_salary,
      salaryCurrency: row.salary_currency,
      dailyTarget: row.daily_target,
      vipCompanies: row.vip_companies,
      remotePolicy: row.remote_policy,
      easyApplyOnly: row.easy_apply_only,
    }),
  job: (row: Record<string, unknown>): JobPosting =>
    jobPostingSchema.parse({
      id: row.id,
      source: row.source,
      externalJobId: row.external_job_id,
      title: nonEmptyString(row.title, 'Untitled role'),
      company: nonEmptyString(row.company, 'Unknown company'),
      location: nonEmptyString(row.location, ''),
      salaryText: row.salary_text,
      employmentType: row.employment_type,
      url: row.url,
      description: row.description,
      easyApply: row.easy_apply,
      detectedQuestions: row.detected_questions,
      scrapedAt: normalizeTimestamp(row.scraped_at),
    }),
  score: (row: Record<string, unknown>): MatchScore =>
    matchScoreSchema.parse({
      id: row.id,
      candidateId: row.candidate_id,
      jobPostingId: row.job_posting_id,
      overall: row.overall,
      keywordHits: row.keyword_hits,
      gaps: row.gaps,
      reasons: row.reasons,
      recommendedAction: row.recommended_action,
      generatedAt: normalizeTimestamp(row.generated_at),
    }),
  tailoredResume: (row: Record<string, unknown>): TailoredResume =>
    tailoredResumeSchema.parse({
      id: row.id,
      candidateId: row.candidate_id,
      jobPostingId: row.job_posting_id,
      baseResumeId: row.base_resume_id,
      title: row.title,
      markdownContent: row.markdown_content,
      pdfStoragePath: row.pdf_storage_path,
      downloadUrl: row.download_url,
      generatedAt: normalizeTimestamp(row.generated_at),
    }),
  run: (row: Record<string, unknown>): ApplicationRun =>
    applicationRunSchema.parse({
      id: row.id,
      candidateId: row.candidate_id,
      source: row.source,
      targetCount: row.target_count,
      processedCount: row.processed_count,
      successfulCount: row.successful_count,
      failedCount: row.failed_count,
      pausedCount: row.paused_count,
      status: row.status,
      startedAt: normalizeTimestamp(row.started_at),
      completedAt: normalizeTimestamp(row.completed_at),
      notes: row.notes,
    }),
  attempt: (row: Record<string, unknown>): ApplicationAttempt =>
    applicationAttemptSchema.parse({
      id: row.id,
      runId: row.run_id,
      jobPostingId: row.job_posting_id,
      tailoredResumeId: row.tailored_resume_id,
      status: row.status,
      reviewReason: row.review_reason,
      receiptPath: row.receipt_path,
      receiptUrl: row.receipt_url,
      lastError: row.last_error,
      metadata: row.metadata,
      submittedAt: normalizeTimestamp(row.submitted_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }),
  review: (row: Record<string, unknown>): ReviewQueueItem =>
    reviewQueueItemSchema.parse({
      id: row.id,
      applicationId: row.application_id,
      reason: row.reason,
      company: nonEmptyString(row.company, 'Unknown company'),
      title: nonEmptyString(row.title, 'Application'),
      priority: row.priority,
      createdAt: normalizeTimestamp(row.created_at),
      resolvedAt: normalizeTimestamp(row.resolved_at),
      resolutionNotes: row.resolution_notes,
    }),
  interview: (row: Record<string, unknown>): InterviewRecord =>
    interviewRecordSchema.parse({
      id: row.id,
      applicationId: row.application_id,
      scheduledAt: normalizeTimestamp(row.scheduled_at),
      interviewerNames: row.interviewer_names,
      stage: row.stage,
      notes: row.notes,
      tags: row.tags,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }),
};

const createLocalObjectUrl = (path: string | null) =>
  path
    ? `${env.NEXT_PUBLIC_APP_URL}/api/assets/${path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`
    : null;

const useDemoData = env.ENABLE_DEMO_DATA;
const savedJobsRunPrefix = 'run_saved_jobs';

const listFromMemory = <T>(items: T[]) => clone(items);

const findRunIdsForCandidate = (candidateId: string, runs: ApplicationRun[]) =>
  new Set(runs.filter((run) => run.candidateId === candidateId).map((run) => run.id));

const isTrackerSyncRun = (run: ApplicationRun) => run.id.startsWith(`${savedJobsRunPrefix}_`);

const sortRunsByStartedAtDesc = (runs: ApplicationRun[]) =>
  runs.sort((left, right) => right.startedAt.localeCompare(left.startedAt));

const fallbackWarnings = new Set<string>();

const shouldFallbackToMemory = (error: unknown) => {
  const detail =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : JSON.stringify(error);

  return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|StorageUnknownError/i.test(detail);
};

const handleSupabaseError = (error: unknown, operation: string) => {
  if (!shouldFallbackToMemory(error)) {
    return false;
  }

  if (!fallbackWarnings.has(operation)) {
    fallbackWarnings.add(operation);
    console.warn(`[store] Falling back to memory for ${operation}`, error);
  }

  return true;
};

const isDbMode = (
  supabase: ReturnType<typeof getSupabaseAdminClient>,
): supabase is NonNullable<ReturnType<typeof getSupabaseAdminClient>> =>
  Boolean(supabase) && !useDemoData;

export const store = {
  async getProfile(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { data, error } = await supabase
        .from(tableMap.profiles)
        .select('*')
        .eq('id', candidateId)
        .maybeSingle();

      if (error) {
        if (!handleSupabaseError(error, 'getProfile')) {
          throw error;
        }
      } else if (data) {
        return mapRow.profile(data);
      }
    }

    return listFromMemory(memoryStore.profiles).find((profile) => profile.id === candidateId) ?? null;
  },
  async ensureCandidateProfile(candidateId: string) {
    const existing = await this.getProfile(candidateId);
    if (existing) {
      return existing;
    }

    const baseProfile =
      candidateId === demoCandidateProfile.id
        ? {
            ...demoCandidateProfile,
            email: '',
            phone: '',
            summary: '',
            workExperiences: [],
            skills: [],
            targetRoles: [],
            industries: [],
            education: [],
            lastParsedAt: null,
          }
        : candidateProfileSchema.parse({
            id: candidateId,
            fullName: '',
            email: '',
            phone: '',
            location: '',
            yearsExperience: 0,
            summary: '',
            workExperiences: [],
            skills: [],
            targetRoles: [],
            industries: [],
            education: [],
            lastParsedAt: null,
          });

    return this.upsertProfile(baseProfile);
  },
  async upsertProfile(profile: CandidateProfile) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.profiles).upsert({
        id: profile.id,
        full_name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        years_experience: profile.yearsExperience,
        summary: profile.summary,
        work_experiences: profile.workExperiences,
        skills: profile.skills,
        target_roles: profile.targetRoles,
        industries: profile.industries,
        education: profile.education,
        last_parsed_at: profile.lastParsedAt,
      });

      if (error && !handleSupabaseError(error, 'upsertProfile')) {
        throw error;
      }
    }

    const existing = memoryStore.profiles.findIndex((item) => item.id === profile.id);
    if (existing >= 0) {
      memoryStore.profiles[existing] = clone(profile);
    } else {
      memoryStore.profiles.unshift(clone(profile));
    }

    return profile;
  },
  async listResumes(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { data, error } = await supabase
        .from(tableMap.resumes)
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listResumes')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.resume);
      }
    }

    return listFromMemory(memoryStore.resumes).filter((resume) => resume.candidateId === candidateId);
  },
  async saveResume(resume: ResumeVersion) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.resumes).upsert({
        id: resume.id,
        candidate_id: resume.candidateId,
        label: resume.label,
        source_file_name: resume.sourceFileName,
        source_file_type: resume.sourceFileType,
        text_content: resume.textContent,
        storage_path: resume.storagePath,
        created_at: resume.createdAt,
        parsed_profile_id: resume.parsedProfileId,
      });

      if (error && !handleSupabaseError(error, 'saveResume')) {
        throw error;
      }
    }

    const existing = memoryStore.resumes.findIndex((item) => item.id === resume.id);
    if (existing >= 0) {
      memoryStore.resumes[existing] = clone(resume);
    } else {
      memoryStore.resumes.unshift(clone(resume));
    }

    return resume;
  },
  async getPreferences(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { data, error } = await supabase
        .from(tableMap.preferences)
        .select('*')
        .eq('candidate_id', candidateId)
        .maybeSingle();

      if (error) {
        if (!handleSupabaseError(error, 'getPreferences')) {
          throw error;
        }
      } else if (data) {
        return mapRow.preference(data);
      }
    }

    return (
      listFromMemory(memoryStore.preferences).find((preference) => preference.candidateId === candidateId) ??
      null
    );
  },
  async upsertPreferences(preference: JobPreference) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.preferences).upsert({
        candidate_id: preference.candidateId,
        keywords: preference.keywords,
        industries: preference.industries,
        regions: preference.regions,
        min_salary: preference.minSalary,
        salary_currency: preference.salaryCurrency,
        daily_target: preference.dailyTarget,
        vip_companies: preference.vipCompanies,
        remote_policy: preference.remotePolicy,
        easy_apply_only: preference.easyApplyOnly,
      });

      if (error && !handleSupabaseError(error, 'upsertPreferences')) {
        throw error;
      }
    }

    const existing = memoryStore.preferences.findIndex(
      (item) => item.candidateId === preference.candidateId,
    );
    if (existing >= 0) {
      memoryStore.preferences[existing] = clone(preference);
    } else {
      memoryStore.preferences.unshift(clone(preference));
    }

    return preference;
  },
  async saveJob(job: JobPosting) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.jobs).upsert({
        id: job.id,
        source: job.source,
        external_job_id: job.externalJobId,
        title: job.title,
        company: job.company,
        location: job.location,
        salary_text: job.salaryText,
        employment_type: job.employmentType,
        url: job.url,
        description: job.description,
        easy_apply: job.easyApply,
        detected_questions: job.detectedQuestions,
        scraped_at: job.scrapedAt,
      });

      if (error && !handleSupabaseError(error, 'saveJob')) {
        throw error;
      }
    }

    const existing = memoryStore.jobs.findIndex((item) => item.id === job.id);
    if (existing >= 0) {
      memoryStore.jobs[existing] = clone(job);
    } else {
      memoryStore.jobs.unshift(clone(job));
    }

    return job;
  },
  async listJobs() {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { data, error } = await supabase
        .from(tableMap.jobs)
        .select('*')
        .order('scraped_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listJobs')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.job);
      }
    }

    return listFromMemory(memoryStore.jobs);
  },
  async saveMatchScore(score: MatchScore) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.scores).upsert({
        id: score.id,
        candidate_id: score.candidateId,
        job_posting_id: score.jobPostingId,
        overall: score.overall,
        keyword_hits: score.keywordHits,
        gaps: score.gaps,
        reasons: score.reasons,
        recommended_action: score.recommendedAction,
        generated_at: score.generatedAt,
      });

      if (error && !handleSupabaseError(error, 'saveMatchScore')) {
        throw error;
      }
    }

    const existing = memoryStore.scores.findIndex((item) => item.id === score.id);
    if (existing >= 0) {
      memoryStore.scores[existing] = clone(score);
    } else {
      memoryStore.scores.unshift(clone(score));
    }

    return score;
  },
  async saveTailoredResume(tailoredResume: TailoredResume) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.tailoredResumes).upsert({
        id: tailoredResume.id,
        candidate_id: tailoredResume.candidateId,
        job_posting_id: tailoredResume.jobPostingId,
        base_resume_id: tailoredResume.baseResumeId,
        title: tailoredResume.title,
        markdown_content: tailoredResume.markdownContent,
        pdf_storage_path: tailoredResume.pdfStoragePath,
        download_url: tailoredResume.downloadUrl,
        generated_at: tailoredResume.generatedAt,
      });

      if (error && !handleSupabaseError(error, 'saveTailoredResume')) {
        throw error;
      }
    }

    const existing = memoryStore.tailoredResumes.findIndex((item) => item.id === tailoredResume.id);
    if (existing >= 0) {
      memoryStore.tailoredResumes[existing] = clone(tailoredResume);
    } else {
      memoryStore.tailoredResumes.unshift(clone(tailoredResume));
    }

    return tailoredResume;
  },
  async listTailoredResumes(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { data, error } = await supabase
        .from(tableMap.tailoredResumes)
        .select('*')
        .eq('candidate_id', candidateId)
        .order('generated_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listTailoredResumes')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.tailoredResume);
      }
    }

    return listFromMemory(memoryStore.tailoredResumes).filter(
      (resume) => resume.candidateId === candidateId,
    );
  },
  async createRun(run: ApplicationRun) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.runs).insert({
        id: run.id,
        candidate_id: run.candidateId,
        source: run.source,
        target_count: run.targetCount,
        processed_count: run.processedCount,
        successful_count: run.successfulCount,
        failed_count: run.failedCount,
        paused_count: run.pausedCount,
        status: run.status,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        notes: run.notes,
      });

      if (error && !handleSupabaseError(error, 'createRun')) {
        throw error;
      }
    }

    memoryStore.runs.unshift(clone(run));
    return run;
  },
  async listRuns(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { data, error } = await supabase
        .from(tableMap.runs)
        .select('*')
        .eq('candidate_id', candidateId)
        .order('started_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listRuns')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.run);
      }
    }

    return sortRunsByStartedAtDesc(
      listFromMemory(memoryStore.runs).filter((run) => run.candidateId === candidateId),
    );
  },
  async saveAttempt(attempt: ApplicationAttempt) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.attempts).upsert({
        id: attempt.id,
        run_id: attempt.runId,
        job_posting_id: attempt.jobPostingId,
        tailored_resume_id: attempt.tailoredResumeId,
        status: attempt.status,
        review_reason: attempt.reviewReason,
        receipt_path: attempt.receiptPath,
        receipt_url: attempt.receiptUrl,
        last_error: attempt.lastError,
        metadata: attempt.metadata,
        submitted_at: attempt.submittedAt,
        updated_at: attempt.updatedAt,
      });

      if (error && !handleSupabaseError(error, 'saveAttempt')) {
        throw error;
      }
    }

    const existing = memoryStore.attempts.findIndex((item) => item.id === attempt.id);
    if (existing >= 0) {
      memoryStore.attempts[existing] = clone(attempt);
    } else {
      memoryStore.attempts.unshift(clone(attempt));
    }

    return attempt;
  },
  async listAttempts(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const runs = await this.listRuns(candidateId);
      const runIds = runs.map((run) => run.id);
      if (runIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from(tableMap.attempts)
        .select('*')
        .in('run_id', runIds)
        .order('updated_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listAttempts')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.attempt);
      }
    }

    const runIds = findRunIdsForCandidate(candidateId, memoryStore.runs);
    return listFromMemory(memoryStore.attempts).filter((attempt) => runIds.has(attempt.runId));
  },
  async getApplicationDetail(candidateId: string, applicationId: string): Promise<ApplicationDetail | null> {
    const attempts = await this.listAttempts(candidateId);
    const attempt = attempts.find((item) => item.id === applicationId);
    if (!attempt) {
      return null;
    }

    const [runs, jobs, reviews, interviews] = await Promise.all([
      this.listRuns(candidateId),
      this.listJobs(),
      this.listReviewQueue(candidateId),
      this.listInterviews(candidateId),
    ]);

    return {
      attempt,
      run: runs.find((run) => run.id === attempt.runId) ?? null,
      job: jobs.find((job) => job.id === attempt.jobPostingId) ?? null,
      reviewItems: reviews.filter((review) => review.applicationId === attempt.id),
      interviews: interviews.filter((interview) => interview.applicationId === attempt.id),
    };
  },
  async createReviewItem(item: ReviewQueueItem) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.reviews).insert({
        id: item.id,
        application_id: item.applicationId,
        reason: item.reason,
        company: item.company,
        title: item.title,
        priority: item.priority,
        created_at: item.createdAt,
        resolved_at: item.resolvedAt,
        resolution_notes: item.resolutionNotes,
      });

      if (error && !handleSupabaseError(error, 'createReviewItem')) {
        throw error;
      }
    }

    memoryStore.reviews.unshift(clone(item));
    return item;
  },
  async listReviewQueue(candidateId: string) {
    const attempts = await this.listAttempts(candidateId);
    const applicationIds = new Set(attempts.map((attempt) => attempt.id));
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase) && applicationIds.size > 0) {
      const { data, error } = await supabase
        .from(tableMap.reviews)
        .select('*')
        .in('application_id', [...applicationIds])
        .order('created_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listReviewQueue')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.review);
      }
    }

    return listFromMemory(memoryStore.reviews).filter((review) =>
      applicationIds.has(review.applicationId),
    );
  },
  async saveInterview(interview: InterviewRecord) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.interviews).insert({
        id: interview.id,
        application_id: interview.applicationId,
        scheduled_at: interview.scheduledAt,
        interviewer_names: interview.interviewerNames,
        stage: interview.stage,
        notes: interview.notes,
        tags: interview.tags,
        created_at: interview.createdAt,
        updated_at: interview.updatedAt,
      });

      if (error && !handleSupabaseError(error, 'saveInterview')) {
        throw error;
      }
    }

    const existing = memoryStore.interviews.findIndex((item) => item.id === interview.id);
    if (existing >= 0) {
      memoryStore.interviews[existing] = clone(interview);
    } else {
      memoryStore.interviews.unshift(clone(interview));
    }

    return interview;
  },
  async listInterviews(candidateId: string) {
    const attempts = await this.listAttempts(candidateId);
    const applicationIds = new Set(attempts.map((attempt) => attempt.id));
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase) && applicationIds.size > 0) {
      const { data, error } = await supabase
        .from(tableMap.interviews)
        .select('*')
        .in('application_id', [...applicationIds])
        .order('created_at', { ascending: false });

      if (error) {
        if (!handleSupabaseError(error, 'listInterviews')) {
          throw error;
        }
      } else if (data) {
        return data.map(mapRow.interview);
      }
    }

    return listFromMemory(memoryStore.interviews).filter((interview) =>
      applicationIds.has(interview.applicationId),
    );
  },
  async getDashboardSummary(candidateId: string): Promise<DashboardSummary> {
    const [attempts, preference, runs] = await Promise.all([
      this.listAttempts(candidateId),
      this.getPreferences(candidateId),
      this.listRuns(candidateId),
    ]);

    const workflowRuns = runs.filter((run) => !isTrackerSyncRun(run));

    return buildDashboardSummary({
      attempts,
      dailyTarget: preference?.dailyTarget ?? 25,
      runStatus: workflowRuns[0]?.status ?? 'idle',
    });
  },
  async getDashboardSnapshot(candidateId: string) {
    const [summary, profile, resumes, preference, runs, attempts, reviews, interviews] =
      await Promise.all([
        this.getDashboardSummary(candidateId),
        this.getProfile(candidateId),
        this.listResumes(candidateId),
        this.getPreferences(candidateId),
        this.listRuns(candidateId),
        this.listAttempts(candidateId),
        this.listReviewQueue(candidateId),
        this.listInterviews(candidateId),
      ]);

    return {
      summary,
      profile,
      resumes,
      preference,
      runs: runs.filter((run) => !isTrackerSyncRun(run)),
      attempts,
      reviews,
      interviews,
    };
  },
  async clearCandidateData(candidateId: string) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.from(tableMap.profiles).delete().eq('id', candidateId);
      if (error && !handleSupabaseError(error, 'clearCandidateData')) {
        throw error;
      }
    }

    memoryStore.profiles = memoryStore.profiles.filter((profile) => profile.id !== candidateId);
    memoryStore.resumes = memoryStore.resumes.filter((resume) => resume.candidateId !== candidateId);
    memoryStore.preferences = memoryStore.preferences.filter(
      (preference) => preference.candidateId !== candidateId,
    );
    memoryStore.scores = memoryStore.scores.filter((score) => score.candidateId !== candidateId);
    memoryStore.tailoredResumes = memoryStore.tailoredResumes.filter(
      (resume) => resume.candidateId !== candidateId,
    );
    const candidateRunIds = findRunIdsForCandidate(candidateId, memoryStore.runs);
    memoryStore.runs = memoryStore.runs.filter((run) => run.candidateId !== candidateId);
    memoryStore.attempts = memoryStore.attempts.filter((attempt) => !candidateRunIds.has(attempt.runId));
    memoryStore.reviews = memoryStore.reviews.filter((review) =>
      memoryStore.attempts.some((attempt) => attempt.id === review.applicationId),
    );
    memoryStore.interviews = memoryStore.interviews.filter((interview) =>
      memoryStore.attempts.some((attempt) => attempt.id === interview.applicationId),
    );

    Object.keys(memoryStore.assets).forEach((path) => {
      if (path.includes(`/${candidateId}/`)) {
        delete memoryStore.assets[path];
      }
    });

    return true;
  },
  async storeBinaryAsset({
    path,
    contentType,
    bytes,
  }: {
    path: string;
    contentType: string;
    bytes: Buffer;
  }) {
    const supabase = getSupabaseAdminClient();

    if (isDbMode(supabase)) {
      const { error } = await supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(path, bytes, {
        contentType,
        upsert: true,
      });

      if (error && !handleSupabaseError(error, 'storeBinaryAsset')) {
        throw error;
      }

      if (!error) {
        const { data } = supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
        return {
          storagePath: path,
          publicUrl: data.publicUrl,
        };
      }
    }

    memoryStore.assets[path] = {
      bytes: bytes.toString('base64'),
      contentType,
    };

    return {
      storagePath: path,
      publicUrl: createLocalObjectUrl(path),
    };
  },
  getAssetPublicUrl(path: string | null) {
    if (!path) {
      return null;
    }

    const supabase = getSupabaseAdminClient();
    if (isDbMode(supabase)) {
      const { data } = supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    }

    return createLocalObjectUrl(path);
  },
  async getBinaryAsset(path: string) {
    const asset = memoryStore.assets[path];

    if (!asset) {
      return null;
    }

    return {
      bytes: Buffer.from(asset.bytes, 'base64'),
      contentType: asset.contentType,
    };
  },
};

export type { ApplicationDetail };
