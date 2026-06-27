import {
  type ApplicationAttempt,
  type ApplicationRun,
  type CandidateProfile,
  type InterviewRecord,
  type JobPosting,
  type JobPreference,
  type ResumeVersion,
  type ReviewQueueItem,
} from './schemas';

const now = new Date().toISOString();

export const demoCandidateProfile: CandidateProfile = {
  id: 'demo-user',
  fullName: 'Demo Candidate',
  email: 'demo@example.com',
  phone: '',
  location: 'Remote',
  yearsExperience: 8,
  summary:
    'Product lead with B2B SaaS, workflow automation, analytics, and growth experience.',
  workExperiences: [
    {
      company: 'Demo SaaS Platform',
      title: 'Product Lead',
      startDate: '2020-01',
      endDate: null,
      summary: 'Led onboarding, workflow automation, and reporting roadmap for a B2B SaaS platform.',
      achievements: [
        'Improved onboarding completion by 21%',
        'Launched workflow automation templates for three customer segments',
      ],
    },
  ],
  skills: ['Product strategy', 'Workflow automation', 'Analytics', 'Growth experiments', 'Stakeholder management'],
  targetRoles: ['Product Manager', 'Product Lead', 'Head of Product'],
  industries: ['B2B SaaS', 'Productivity', 'Analytics'],
  education: [
    {
      institution: 'Demo University',
      degree: 'BBA',
      field: 'Marketing',
      graduationYear: '2012',
    },
  ],
  lastParsedAt: now,
};

export const demoResume: ResumeVersion = {
  id: 'resume_demo',
  candidateId: 'demo-user',
  label: 'Master Resume',
  sourceFileName: 'demo-candidate-master-resume.pdf',
  sourceFileType: 'application/pdf',
  textContent:
    'Product lead with 8 years of experience in B2B SaaS, workflow automation, analytics, and growth.',
  storagePath: null,
  createdAt: now,
  parsedProfileId: 'demo-user',
};

export const demoPreferences: JobPreference = {
  candidateId: 'demo-user',
  keywords: ['workflow automation', 'analytics', 'growth', 'product strategy'],
  industries: ['b2b saas', 'analytics'],
  regions: ['remote'],
  minSalary: 120000,
  salaryCurrency: 'USD',
  dailyTarget: 25,
  vipCompanies: ['Demo Analytics Co'],
  remotePolicy: 'remote',
  easyApplyOnly: true,
};

export const demoJobs: JobPosting[] = [
  {
    id: 'job_linkedin_1',
    source: 'linkedin',
    externalJobId: '12345',
    title: 'Product Manager, Workflow Automation',
    company: 'Demo Workflow Co',
    location: 'Remote',
    salaryText: 'USD 140k - 170k',
    employmentType: 'Full-time',
    url: 'https://www.linkedin.com/jobs/view/12345/',
    description:
      'Lead workflow automation roadmap, own onboarding journeys, analytics, growth loops, and cross-functional delivery.',
    easyApply: true,
    detectedQuestions: ['Are you comfortable working remotely?'],
    scrapedAt: now,
  },
  {
    id: 'job_linkedin_2',
    source: 'linkedin',
    externalJobId: '56789',
    title: 'Product Lead, Analytics Platform',
    company: 'Demo Analytics Co',
    location: 'Remote',
    salaryText: null,
    employmentType: 'Full-time',
    url: 'https://www.linkedin.com/jobs/view/56789/',
    description:
      'Drive B2B SaaS analytics platform strategy, integrations, reporting workflows, and customer adoption.',
    easyApply: true,
    detectedQuestions: ['Do you require sponsorship?', 'How many years in SaaS?'],
    scrapedAt: now,
  },
];

export const demoRun: ApplicationRun = {
  id: 'run_demo',
  candidateId: 'demo-user',
  source: 'linkedin',
  targetCount: 10,
  processedCount: 4,
  successfulCount: 2,
  failedCount: 1,
  pausedCount: 1,
  status: 'running',
  startedAt: now,
  completedAt: null,
  notes: 'Paused on VIP company role for review.',
};

export const demoAttempts: ApplicationAttempt[] = [
  {
    id: 'attempt_1',
    runId: 'run_demo',
    jobPostingId: 'job_linkedin_1',
    tailoredResumeId: 'tailored_1',
    status: 'submitted',
    reviewReason: null,
    receiptPath: null,
    receiptUrl: null,
    lastError: null,
    metadata: {
      company: 'Demo Workflow Co',
      title: 'Product Manager, Workflow Automation',
    },
    submittedAt: now,
    updatedAt: now,
  },
  {
    id: 'attempt_2',
    runId: 'run_demo',
    jobPostingId: 'job_linkedin_2',
    tailoredResumeId: null,
    status: 'needs_review',
    reviewReason: 'VIP company',
    receiptPath: null,
    receiptUrl: null,
    lastError: null,
    metadata: {
      company: 'Demo Analytics Co',
      title: 'Product Lead, Analytics Platform',
    },
    submittedAt: null,
    updatedAt: now,
  },
];

export const demoReviewItems: ReviewQueueItem[] = [
  {
    id: 'review_1',
    applicationId: 'attempt_2',
    reason: 'VIP company',
    company: 'Demo Analytics Co',
    title: 'Product Lead, Analytics Platform',
    priority: 'high',
    createdAt: now,
    resolvedAt: null,
    resolutionNotes: null,
  },
];

export const demoInterviews: InterviewRecord[] = [
  {
    id: 'interview_1',
    applicationId: 'attempt_1',
    scheduledAt: now,
    interviewerNames: ['Hiring Manager', 'Product Director'],
    stage: 'Phone screen',
    notes: 'Focus on workflow automation, analytics adoption, and cross-functional delivery.',
    tags: ['workflow automation', 'analytics'],
    createdAt: now,
    updatedAt: now,
  },
];
