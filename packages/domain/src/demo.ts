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
  fullName: 'Elena Tan',
  email: 'elena@example.com',
  phone: '+65 8888 8888',
  location: 'Singapore',
  yearsExperience: 12,
  summary:
    'Senior product leader with deep fintech and Web3 operating experience across APAC.',
  workExperiences: [
    {
      company: 'FinStride',
      title: 'Senior Product Manager',
      startDate: '2020-01',
      endDate: null,
      summary: 'Led KYC, onboarding, and payments roadmap for a regional fintech app.',
      achievements: [
        'Improved KYC completion by 21%',
        'Launched SME lending workflow across Singapore and Hong Kong',
      ],
    },
  ],
  skills: ['Product strategy', 'Payments', 'KYC', 'Growth experiments', 'Stakeholder management'],
  targetRoles: ['Senior Product Manager', 'Lead Product Manager', 'Head of Product'],
  industries: ['Fintech', 'Web3', 'SaaS'],
  education: [
    {
      institution: 'National University of Singapore',
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
  sourceFileName: 'elena-tan-master-resume.pdf',
  sourceFileType: 'application/pdf',
  textContent:
    'Senior product leader with 12 years of experience in fintech, KYC, payments, and growth.',
  storagePath: null,
  createdAt: now,
  parsedProfileId: 'demo-user',
};

export const demoPreferences: JobPreference = {
  candidateId: 'demo-user',
  keywords: ['fintech', 'payments', 'growth', 'product strategy'],
  industries: ['fintech', 'web3'],
  regions: ['singapore', 'remote'],
  minSalary: 140000,
  salaryCurrency: 'SGD',
  dailyTarget: 25,
  vipCompanies: ['Stripe', 'Grab'],
  remotePolicy: 'hybrid',
  easyApplyOnly: true,
};

export const demoJobs: JobPosting[] = [
  {
    id: 'job_linkedin_1',
    source: 'linkedin',
    externalJobId: '12345',
    title: 'Senior Product Manager, Payments',
    company: 'Airwallex',
    location: 'Singapore',
    salaryText: 'SGD 160k - 190k',
    employmentType: 'Full-time',
    url: 'https://www.linkedin.com/jobs/view/12345/',
    description:
      'Lead payments roadmap, own KYC onboarding journeys, partner with engineering and design.',
    easyApply: true,
    detectedQuestions: ['Are you based in Singapore?'],
    scrapedAt: now,
  },
  {
    id: 'job_linkedin_2',
    source: 'linkedin',
    externalJobId: '56789',
    title: 'Lead Product Manager, Core Banking',
    company: 'Grab',
    location: 'Singapore',
    salaryText: null,
    employmentType: 'Full-time',
    url: 'https://www.linkedin.com/jobs/view/56789/',
    description:
      'Drive fintech platform strategy, compliance, banking integrations, and APAC launches.',
    easyApply: true,
    detectedQuestions: ['Do you require sponsorship?', 'How many years in fintech?'],
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
      company: 'Airwallex',
      title: 'Senior Product Manager, Payments',
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
      company: 'Grab',
      title: 'Lead Product Manager, Core Banking',
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
    company: 'Grab',
    title: 'Lead Product Manager, Core Banking',
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
    notes: 'Focus on payments partnerships and KYC optimisation.',
    tags: ['payments', 'fintech'],
    createdAt: now,
    updatedAt: now,
  },
];

