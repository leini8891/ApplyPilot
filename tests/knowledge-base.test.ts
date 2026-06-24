import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  demoCandidateProfile,
  demoJobs,
  demoPreferences,
  scoreJobAgainstPreferences,
} from '@applypilot/domain';

import {
  getKnowledgeBaseEntries,
  matchKnowledgeEntriesForJob,
  saveKnowledgeBaseEntry,
} from '../apps/web/src/server/services/knowledge-base';

const writeKnowledgeFile = async (root: string, relativePath: string, content: string) => {
  const filePath = path.join(root, relativePath);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

describe('knowledge base service', () => {
  const originalCwd = process.cwd();
  let tempDir: string | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'applypilot-kb-'));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('parses structured markdown entries', async () => {
    if (!tempDir) {
      throw new Error('Temp directory was not created.');
    }

    await writeKnowledgeFile(
      tempDir,
      'knowledge_base/stories/payment_recovery.md',
      `# Payment Recovery

## Context

Use this for payment reliability conversations.

## Core facts

- Mapped failure states.
- Defined recovery ownership.

## Interview value

Shows product judgment around operational reliability.

## Reusable answer points

- Start with customer impact.
- Explain the control loop.

## Related roles

- Payments Product Manager

## Tags

- payments
- reliability
`,
    );

    const entries = await getKnowledgeBaseEntries();
    const [entry] = entries;

    expect(entries).toHaveLength(1);
    expect(entry).toBeDefined();

    if (!entry) {
      throw new Error('Expected one knowledge entry.');
    }

    expect(entry.title).toBe('Payment Recovery');
    expect(entry.kind).toBe('stories');
    expect(entry.coreFacts).toEqual(['Mapped failure states.', 'Defined recovery ownership.']);
    expect(entry.tags).toEqual(['payments', 'reliability']);
    expect(entry.missingSections).toEqual([]);
  });

  it('merges markdown entries with JSON sidecar metadata', async () => {
    if (!tempDir) {
      throw new Error('Temp directory was not created.');
    }

    await writeKnowledgeFile(
      tempDir,
      'knowledge_base/stories/payment_recovery.md',
      `# Payment Recovery

## Context

Use this for payment reliability conversations.

## Core facts

- Mapped failure states.

## Interview value

Shows product judgment around operational reliability.

## Reusable answer points

- Start with customer impact.

## Related roles

- Payments Product Manager

## Tags

- payments
`,
    );
    await writeKnowledgeFile(
      tempDir,
      'knowledge_base/stories/payment_recovery.json',
      JSON.stringify({
        tags: ['merchant experience', 'payments'],
        search_terms: ['payment failure recovery'],
        resume_signals: ['Reduced order-loss risk by about 30%.'],
      }),
    );

    const entries = await getKnowledgeBaseEntries();
    const [entry] = entries;

    expect(entries).toHaveLength(1);
    expect(entry?.tags).toEqual(['payments', 'merchant experience']);
    expect(entry?.searchTerms).toEqual(['payment failure recovery']);
    expect(entry?.resumeSignals).toEqual(['Reduced order-loss risk by about 30%.']);
    expect(entry?.relativePath).toBe('knowledge_base/stories/payment_recovery.md');
    expect(entry?.metadataPath).toContain('payment_recovery.json');
  });

  it('reads standalone private JSON entries from the local workspace convention', async () => {
    if (!tempDir) {
      throw new Error('Temp directory was not created.');
    }

    await writeKnowledgeFile(
      tempDir,
      'local_workspace/knowledge_base_private/stories/private_payments.json',
      JSON.stringify({
        title: 'Private Payments Story',
        context: 'Local-only application prep.',
        coreFacts: ['Private fact.'],
        interviewValue: 'Useful for a specific private target.',
        reusableAnswerPoints: ['Keep the answer local.'],
        relatedRoles: ['Payments Product Manager'],
        tags: ['payments', 'private'],
        searchTerms: ['private payments prep'],
      }),
    );

    const entries = await getKnowledgeBaseEntries();
    const [entry] = entries;

    expect(entries).toHaveLength(1);
    expect(entry?.title).toBe('Private Payments Story');
    expect(entry?.isPrivate).toBe(true);
    expect(entry?.sourceLabel).toBe('Private local knowledge base');
    expect(entry?.relativePath).toBe(
      'local_workspace/knowledge_base_private/stories/private_payments.json',
    );
    expect(entry?.missingSections).toEqual([]);
  });

  it('writes new entries as markdown files', async () => {
    if (!tempDir) {
      throw new Error('Temp directory was not created.');
    }

    const entry = await saveKnowledgeBaseEntry({
      kind: 'playbooks',
      title: 'Why Payments?',
      context: 'Opening answer for payments roles.',
      coreFacts: ['Payment reliability matters.', 'Controls shape trust.'],
      interviewValue: 'Connects adjacent experience to payments.',
      reusableAnswerPoints: ['Translate crypto/data work into money movement patterns.'],
      relatedRoles: ['Payments Product Manager'],
      tags: ['payments', 'fintech'],
    });

    expect(entry.relativePath).toBe('knowledge_base/playbooks/why_payments.md');

    const savedContent = await fs.readFile(
      path.join(tempDir, 'knowledge_base/playbooks/why_payments.md'),
      'utf8',
    );

    expect(savedContent).toContain('# Why Payments?');
    expect(savedContent).toContain('## Reusable answer points');

    const entries = await getKnowledgeBaseEntries();
    const savedEntry = entries.find((item) => item.id === 'why_payments');

    expect(savedEntry?.tags).toEqual(['payments', 'fintech']);
  });

  it('matches reusable knowledge entries to a scored job', async () => {
    if (!tempDir) {
      throw new Error('Temp directory was not created.');
    }

    await writeKnowledgeFile(
      tempDir,
      'knowledge_base/stories/payments_platform_story.md',
      `# Payments Platform Story

## Context

Use this story for payments platform and onboarding roles.

## Core facts

- Improved payment reliability.

## Interview value

Shows practical judgment around payment operations.

## Reusable answer points

- Start with merchant trust and transaction reliability.
- Connect controls, reconciliation, and support recovery.

## Related roles

- Senior Product Manager, Payments
- Payments Product Manager

## Tags

- payments
- KYC
- merchant experience
`,
    );

    await writeKnowledgeFile(
      tempDir,
      'knowledge_base/playbooks/unrelated_sales_playbook.md',
      `# Unrelated Sales Playbook

## Context

Use this for sales roles.

## Core facts

- Sales operations.

## Interview value

Sales-focused.

## Reusable answer points

- Talk about quota.

## Related roles

- Account Executive

## Tags

- sales
`,
    );

    const job = demoJobs[0];
    const score = scoreJobAgainstPreferences(demoCandidateProfile, demoPreferences, job);
    const entries = await getKnowledgeBaseEntries();
    const matches = matchKnowledgeEntriesForJob({ entries, job, score });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.title).toBe('Payments Platform Story');
    expect(matches[0]?.reason).toContain('Related role match');
    expect(matches[0]?.answerPoints).toContain('Start with merchant trust and transaction reliability.');
  });
});
