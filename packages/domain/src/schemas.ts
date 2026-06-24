import { z } from 'zod';

export const sourcePlatformSchema = z.enum(['linkedin', 'mycareersfuture']);
export type SourcePlatform = z.infer<typeof sourcePlatformSchema>;

export const applicationStatusSchema = z.enum([
  'queued',
  'drafted',
  'submitted',
  'viewed',
  'interview',
  'offer',
  'rejected',
  'needs_review',
  'failed',
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const runStatusSchema = z.enum([
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const reviewPrioritySchema = z.enum(['low', 'medium', 'high']);
export type ReviewPriority = z.infer<typeof reviewPrioritySchema>;

export const candidateExperienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().nullable().default(null),
  summary: z.string().default(''),
  achievements: z.array(z.string()).default([]),
});

export const educationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().default(''),
  graduationYear: z.string().nullable().default(null),
});

export const candidateProfileSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().default(''),
  email: z.string().email().or(z.literal('')).default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  yearsExperience: z.number().min(0).default(0),
  summary: z.string().default(''),
  workExperiences: z.array(candidateExperienceSchema).default([]),
  skills: z.array(z.string()).default([]),
  targetRoles: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  education: z.array(educationSchema).default([]),
  lastParsedAt: z.string().datetime().nullable().default(null),
});
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

export const resumeVersionSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  label: z.string().min(1),
  sourceFileName: z.string().min(1),
  sourceFileType: z.string().min(1),
  textContent: z.string().default(''),
  storagePath: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  parsedProfileId: z.string().nullable().default(null),
});
export type ResumeVersion = z.infer<typeof resumeVersionSchema>;

export const jobPreferenceSchema = z.object({
  candidateId: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  minSalary: z.number().min(0).default(0),
  salaryCurrency: z.string().default('SGD'),
  dailyTarget: z.number().int().min(1).max(50).default(25),
  vipCompanies: z.array(z.string()).max(5).default([]),
  remotePolicy: z.enum(['any', 'hybrid', 'remote']).default('any'),
  easyApplyOnly: z.boolean().default(true),
});
export type JobPreference = z.infer<typeof jobPreferenceSchema>;

export const jobPostingSchema = z.object({
  id: z.string().min(1),
  source: sourcePlatformSchema,
  externalJobId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().default(''),
  salaryText: z.string().nullable().default(null),
  employmentType: z.string().nullable().default(null),
  url: z.string().url(),
  description: z.string().default(''),
  easyApply: z.boolean().default(false),
  detectedQuestions: z.array(z.string()).default([]),
  scrapedAt: z.string().datetime(),
});
export type JobPosting = z.infer<typeof jobPostingSchema>;

export const matchScoreSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  jobPostingId: z.string().min(1),
  overall: z.number().min(0).max(100),
  keywordHits: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
  recommendedAction: z.enum(['apply', 'review', 'skip']),
  generatedAt: z.string().datetime(),
});
export type MatchScore = z.infer<typeof matchScoreSchema>;

export const tailoredResumeSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  jobPostingId: z.string().min(1),
  baseResumeId: z.string().min(1),
  title: z.string().min(1),
  markdownContent: z.string().default(''),
  pdfStoragePath: z.string().nullable().default(null),
  downloadUrl: z.string().url().nullable().default(null),
  generatedAt: z.string().datetime(),
});
export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

export const applicationRunSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  source: sourcePlatformSchema,
  targetCount: z.number().int().min(0),
  processedCount: z.number().int().min(0),
  successfulCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  pausedCount: z.number().int().min(0),
  status: runStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  notes: z.string().default(''),
});
export type ApplicationRun = z.infer<typeof applicationRunSchema>;

export const applicationAttemptSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  jobPostingId: z.string().min(1),
  tailoredResumeId: z.string().nullable().default(null),
  status: applicationStatusSchema,
  reviewReason: z.string().nullable().default(null),
  receiptPath: z.string().nullable().default(null),
  receiptUrl: z.string().url().nullable().default(null),
  lastError: z.string().nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
  submittedAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
});
export type ApplicationAttempt = z.infer<typeof applicationAttemptSchema>;

export const reviewQueueItemSchema = z.object({
  id: z.string().min(1),
  applicationId: z.string().min(1),
  reason: z.string().min(1),
  company: z.string().min(1),
  title: z.string().min(1),
  priority: reviewPrioritySchema,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().default(null),
  resolutionNotes: z.string().nullable().default(null),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const interviewRecordSchema = z.object({
  id: z.string().min(1),
  applicationId: z.string().min(1),
  scheduledAt: z.string().datetime().nullable().default(null),
  interviewerNames: z.array(z.string()).default([]),
  stage: z.string().min(1),
  notes: z.string().default(''),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InterviewRecord = z.infer<typeof interviewRecordSchema>;

export const dashboardSummarySchema = z.object({
  todaySubmitted: z.number().int().min(0),
  dailyTarget: z.number().int().min(0),
  runningStatus: runStatusSchema,
  pendingReviewCount: z.number().int().min(0),
  successRate: z.number().min(0).max(100),
  recentResult: z.string().default(''),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

