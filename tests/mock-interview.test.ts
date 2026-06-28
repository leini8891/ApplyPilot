import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  demoCandidateProfile,
  demoJobs,
  demoPreferences,
  demoResume,
  type ApplicationAttempt,
  type ApplicationRun,
} from '@applypilot/domain';

import {
  answerMockInterviewTurn,
  saveMockInterviewSession,
  startMockInterview,
} from '../apps/web/src/server/services/mock-interview';
import { store } from '../apps/web/src/server/services/store';

const writeKnowledgeFile = async (
  root: string,
  relativePath: string,
  content: string,
) => {
  const filePath = path.join(root, relativePath);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

describe('mock interview service', () => {
  const originalCwd = process.cwd();
  const candidateId = 'mock-interview-test-user';
  let tempDir: string | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'applypilot-mock-interview-'),
    );
    process.chdir(tempDir);
    await store.clearCandidateData(candidateId);

    await writeKnowledgeFile(
      tempDir,
      'knowledge_base/playbooks/role_pitch.md',
      `# Role Pitch

## Context

Use this to connect a candidate story to a specific role.

## Core facts

- Role fit should start from the employer's operating problem.

## Interview value

Creates a concise answer for why this role and why now.

## Reusable answer points

- Lead with customer activation and operational repeatability.
- Tie workflow automation to measurable adoption.

## Related roles

- Product Manager, Workflow Automation

## Tags

- workflow automation
- onboarding
`,
    );
  });

  afterEach(async () => {
    await store.clearCandidateData(candidateId);
    process.chdir(originalCwd);

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  const createApplication = async () => {
    const now = new Date().toISOString();
    const run: ApplicationRun = {
      id: 'run_mock_interview_test',
      candidateId,
      source: 'linkedin',
      targetCount: 1,
      processedCount: 1,
      successfulCount: 1,
      failedCount: 0,
      pausedCount: 0,
      status: 'completed',
      startedAt: now,
      completedAt: now,
      notes: 'Mock interview test run',
    };
    const job = {
      ...demoJobs[0],
      id: 'job_mock_interview_workflow',
      externalJobId: 'mock-interview-workflow',
      url: 'https://www.linkedin.com/jobs/view/mock-interview-workflow/',
      description:
        'Own workflow automation, onboarding analytics, adoption loops, and cross-functional delivery.',
    };
    const attempt: ApplicationAttempt = {
      id: 'attempt_mock_interview_workflow',
      runId: run.id,
      jobPostingId: job.id,
      tailoredResumeId: null,
      status: 'interview',
      reviewReason: null,
      receiptPath: null,
      receiptUrl: null,
      lastError: null,
      metadata: {
        company: job.company,
        title: job.title,
      },
      submittedAt: now,
      updatedAt: now,
    };

    await store.upsertProfile({
      ...demoCandidateProfile,
      id: candidateId,
    });
    await store.upsertPreferences({
      ...demoPreferences,
      candidateId,
    });
    await store.saveResume({
      ...demoResume,
      id: 'resume_mock_interview',
      candidateId,
    });
    await store.saveJob(job, candidateId);
    await store.createRun(run);
    await store.saveAttempt(attempt);

    return attempt;
  };

  it('runs a deterministic playbook fallback and saves the session to interview records', async () => {
    const application = await createApplication();
    const session = await startMockInterview({
      candidateId,
      applicationId: application.id,
      forceDeterministic: true,
      roundLimit: 2,
    });

    expect(session.mode).toBe('deterministic');
    expect(session.turns[0]?.focus).toBe('Role Pitch');
    expect(session.turns[0]?.question).toContain('Role Pitch');
    expect(
      session.knowledgeMatches.some((match) => match.title === 'Role Pitch'),
    ).toBe(true);

    const secondRound = await answerMockInterviewTurn({
      candidateId,
      session,
      forceDeterministic: true,
      answer:
        'I led workflow automation for onboarding, starting from customer activation and operational repeatability. The problem was that support teams repeated the same recovery steps while new users dropped before activation. I mapped the top handoff failures, shipped reusable workflow templates, and paired them with analytics reviews. Completion improved by 21%, and adoption data then helped the team prioritize the next automation loop.',
    });

    expect(secondRound.status).toBe('active');
    expect(secondRound.turns).toHaveLength(2);
    expect(secondRound.turns[0]?.score).toBeGreaterThanOrEqual(4);
    expect(secondRound.turns[0]?.improvement).toEqual(expect.any(String));

    const completed = await answerMockInterviewTurn({
      candidateId,
      session: secondRound,
      forceDeterministic: true,
      answer:
        'For this role, I would connect workflow automation to onboarding analytics first. In the first 90 days I would map activation drop-offs, quantify the top 3 repeatable failures, and ship one automation that improves adoption or support recovery.',
    });

    expect(completed.status).toBe('complete');

    const interview = await saveMockInterviewSession({
      candidateId,
      session: completed,
    });
    const records = await store.listInterviews(candidateId);

    expect(interview.stage).toContain('Mock interview');
    expect(interview.tags).toContain('mock-interview');
    expect(records.some((record) => record.id === interview.id)).toBe(true);
    expect(interview.notes).toContain('Round 1');
    expect(interview.notes).toContain('Score:');
  });
});
