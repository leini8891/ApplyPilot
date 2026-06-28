import OpenAI from 'openai';

import {
  scoreJobAgainstPreferences,
  type CandidateProfile,
  type InterviewRecord,
  type JobPosting,
  type JobPreference,
  type MatchScore,
} from '@applypilot/domain';

import { env } from '@/lib/env';
import { shortId } from '@/lib/utils';

import {
  getKnowledgeBaseEntries,
  matchKnowledgeEntriesForJob,
  type KnowledgeEntry,
  type KnowledgeMatch,
} from './knowledge-base';
import { store, type AppStore } from './store';

export type MockInterviewMode = 'openai' | 'deterministic';
export type MockInterviewStatus = 'active' | 'complete';

export type MockInterviewTurn = {
  id: string;
  question: string;
  focus: string;
  answer: string | null;
  score: number | null;
  feedback: string | null;
  improvement: string | null;
  createdAt: string;
  answeredAt: string | null;
};

export type MockInterviewSession = {
  id: string;
  applicationId: string;
  mode: MockInterviewMode;
  status: MockInterviewStatus;
  roundLimit: number;
  createdAt: string;
  updatedAt: string;
  job: {
    title: string;
    company: string;
  };
  knowledgeMatches: KnowledgeMatch[];
  turns: MockInterviewTurn[];
};

type MockInterviewContext = {
  candidateId: string;
  applicationId: string;
  job: JobPosting;
  score: MatchScore;
  knowledgeMatches: KnowledgeMatch[];
  playbooks: KnowledgeEntry[];
};

type MockInterviewOptions = {
  appStore?: AppStore;
  forceDeterministic?: boolean;
  roundLimit?: number;
};

type OpenAiOpening = {
  question: string;
  focus: string;
};

type OpenAiEvaluation = {
  score: number;
  feedback: string;
  improvement: string;
  nextQuestion: string | null;
  nextFocus: string | null;
  complete: boolean;
};

const defaultRoundLimit = 5;
const minRoundLimit = 2;
const maxRoundLimit = 7;

const stopWords = new Set([
  'about',
  'across',
  'after',
  'also',
  'and',
  'are',
  'build',
  'company',
  'customer',
  'customers',
  'data',
  'drive',
  'for',
  'from',
  'have',
  'into',
  'lead',
  'manager',
  'own',
  'product',
  'role',
  'team',
  'that',
  'the',
  'this',
  'with',
  'work',
  'you',
  'your',
]);

const getStore = (appStore?: AppStore) => appStore ?? store;

const clampRoundLimit = (value: number | undefined) => {
  if (!value || !Number.isFinite(value)) {
    return defaultRoundLimit;
  }

  return Math.max(minRoundLimit, Math.min(maxRoundLimit, Math.floor(value)));
};

const createOpenAIClient = () => {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
};

const parseJsonObject = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const stringField = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const scoreField = (value: unknown, fallback = 3) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(5, Math.round(value)));
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

const extractKeywords = (job: JobPosting, limit = 8) => {
  const text = [job.title, job.company, job.description].join(' ');
  const tokens =
    text
      .match(/[A-Za-z][A-Za-z0-9+#-]{2,}/g)
      ?.map((token) => token.toLowerCase())
      .filter((token) => !stopWords.has(token)) ?? [];

  return uniqueStrings(tokens).slice(0, limit);
};

const fallbackKnowledgeScore = ({
  candidateId,
  job,
}: {
  candidateId: string;
  job: JobPosting;
}): MatchScore => ({
  id: `mock_score_${job.id}`,
  candidateId,
  jobPostingId: job.id,
  overall: 50,
  keywordHits: extractKeywords(job, 12),
  gaps: [],
  reasons: [`Mock interview prepared from ${job.title} JD signals.`],
  recommendedAction: 'review',
  generatedAt: new Date().toISOString(),
});

const buildKnowledgeScore = ({
  candidateId,
  job,
  profile,
  preference,
}: {
  candidateId: string;
  job: JobPosting;
  profile: CandidateProfile | null;
  preference: JobPreference | null;
}) => {
  if (!profile || !preference) {
    return fallbackKnowledgeScore({ candidateId, job });
  }

  return scoreJobAgainstPreferences(profile, preference, job);
};

const sortPlaybooksForJob = ({
  playbooks,
  knowledgeMatches,
}: {
  playbooks: KnowledgeEntry[];
  knowledgeMatches: KnowledgeMatch[];
}) => {
  const matchedPaths = new Set(
    knowledgeMatches
      .filter((match) => match.relativePath.includes('/playbooks/'))
      .map((match) => match.relativePath),
  );

  return [...playbooks].sort((left, right) => {
    const leftMatched = matchedPaths.has(left.relativePath);
    const rightMatched = matchedPaths.has(right.relativePath);

    if (leftMatched !== rightMatched) {
      return leftMatched ? -1 : 1;
    }

    return left.title.localeCompare(right.title);
  });
};

const buildQuestionFromPlaybooks = ({
  context,
  roundIndex,
}: {
  context: MockInterviewContext;
  roundIndex: number;
}) => {
  const sortedPlaybooks = sortPlaybooksForJob({
    playbooks: context.playbooks,
    knowledgeMatches: context.knowledgeMatches,
  });
  const playbook =
    sortedPlaybooks[roundIndex % Math.max(sortedPlaybooks.length, 1)];
  const answerPoint =
    playbook?.reusableAnswerPoints[
      roundIndex % playbook.reusableAnswerPoints.length
    ] ??
    context.knowledgeMatches.flatMap((match) => match.answerPoints)[
      roundIndex
    ] ??
    'connect your answer to a concrete result';
  const keywords = extractKeywords(context.job);
  const keyword =
    keywords[roundIndex % Math.max(keywords.length, 1)] ?? context.job.title;
  const playbookTitle = playbook?.title ?? 'General interview playbook';
  const templates = [
    `Using "${playbookTitle}", give me your 60-second pitch for ${context.job.title} at ${context.job.company}. Anchor it in ${keyword}.`,
    `Tell me about a specific example that proves ${keyword}. Use this playbook point: ${answerPoint}`,
    `Why does this ${context.job.title} role make sense now? Tie your answer to "${playbookTitle}" and the JD signal ${keyword}.`,
    `Walk me through a tradeoff or failure related to ${keyword}. What did you change after that experience?`,
    `If ${context.job.company} asked what you would do in your first 90 days, how would you answer using ${answerPoint}?`,
    `What question would you ask the interviewer about ${keyword}, and what would their answer tell you?`,
    `Close the loop: summarize your fit for ${context.job.title} with one proof point, one risk, and one mitigation.`,
  ];

  return {
    question:
      templates[roundIndex % templates.length] ??
      `Using "${playbookTitle}", walk me through your fit for ${context.job.title} at ${context.job.company}.`,
    focus: playbookTitle,
  };
};

const includesAny = (text: string, values: string[]) => {
  const normalized = text.toLowerCase();

  return values.some((value) => normalized.includes(value.toLowerCase()));
};

export const evaluateDeterministicMockAnswer = ({
  answer,
  context,
}: {
  answer: string;
  context: MockInterviewContext;
}) => {
  const trimmed = answer.trim();
  const keywords = extractKeywords(context.job, 10);
  const knowledgePoints = uniqueStrings([
    ...context.knowledgeMatches.flatMap((match) => match.answerPoints),
    ...context.playbooks.flatMap((playbook) => playbook.reusableAnswerPoints),
  ]).slice(0, 12);
  const hasSpecificExample = trimmed.split(/\s+/).filter(Boolean).length >= 45;
  const hasStrongDetail = trimmed.split(/\s+/).filter(Boolean).length >= 90;
  const mentionsJdSignal = includesAny(trimmed, keywords);
  const mentionsKnowledgePoint = includesAny(trimmed, knowledgePoints);
  const hasMetric = /\b\d+[%+xkKmM]?\b/.test(trimmed);
  const score =
    1 +
    Number(hasSpecificExample) +
    Number(hasStrongDetail) +
    Number(mentionsJdSignal) +
    Number(mentionsKnowledgePoint || hasMetric);
  const suggestions = [
    !hasSpecificExample
      ? 'Add a concrete situation, action, and result.'
      : null,
    !mentionsJdSignal && keywords[0]
      ? `Name one JD signal directly, such as ${keywords[0]}.`
      : null,
    !mentionsKnowledgePoint && knowledgePoints[0]
      ? `Borrow one reusable proof point: ${knowledgePoints[0]}`
      : null,
    !hasMetric ? 'Add a metric, scale, or before/after outcome.' : null,
  ].filter((item): item is string => Boolean(item));

  return {
    score: Math.max(1, Math.min(5, score)),
    feedback:
      score >= 4
        ? 'Strong answer shape with relevant evidence.'
        : score >= 3
          ? 'Useful direction, but the answer needs sharper evidence.'
          : 'The answer is still too general for an interview round.',
    improvement:
      suggestions[0] ?? 'Tighten the ending into one memorable takeaway.',
  };
};

const loadMockInterviewContext = async ({
  candidateId,
  applicationId,
  appStore,
}: {
  candidateId: string;
  applicationId: string;
  appStore?: AppStore;
}): Promise<MockInterviewContext> => {
  const activeStore = getStore(appStore);
  const detail = await activeStore.getApplicationDetail(
    candidateId,
    applicationId,
  );

  if (!detail || !detail.job) {
    throw new Error('Application not found for mock interview.');
  }

  const [profile, preference, knowledgeEntries] = await Promise.all([
    activeStore.getProfile(candidateId),
    activeStore.getPreferences(candidateId),
    getKnowledgeBaseEntries(),
  ]);
  const score = buildKnowledgeScore({
    candidateId,
    job: detail.job,
    profile,
    preference,
  });

  return {
    candidateId,
    applicationId,
    job: detail.job,
    score,
    knowledgeMatches: matchKnowledgeEntriesForJob({
      entries: knowledgeEntries,
      job: detail.job,
      score,
      limit: 6,
    }),
    playbooks: knowledgeEntries.filter((entry) => entry.kind === 'playbooks'),
  };
};

const buildOpenAiContextPayload = (context: MockInterviewContext) => ({
  job: {
    title: context.job.title,
    company: context.job.company,
    location: context.job.location,
    description: context.job.description.slice(0, 4000),
  },
  scoreSignals: {
    keywordHits: context.score.keywordHits,
    gaps: context.score.gaps,
    reasons: context.score.reasons,
  },
  knowledgeMatches: context.knowledgeMatches.map((match) => ({
    title: match.title,
    kind: match.kindLabel,
    reason: match.reason,
    answerPoints: match.answerPoints,
  })),
  playbooks: sortPlaybooksForJob({
    playbooks: context.playbooks,
    knowledgeMatches: context.knowledgeMatches,
  })
    .slice(0, 5)
    .map((playbook) => ({
      title: playbook.title,
      context: playbook.context,
      answerPoints: playbook.reusableAnswerPoints.slice(0, 4),
      tags: playbook.tags.slice(0, 4),
    })),
});

const generateOpenAiOpening = async (
  client: OpenAI,
  context: MockInterviewContext,
): Promise<OpenAiOpening> => {
  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.25,
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'system',
        content:
          'You are a concise mock interviewer for a product job search assistant. Return strict JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Create the first question for a role-specific mock interview.',
          outputSchema: {
            question: 'string',
            focus: 'string',
          },
          context: buildOpenAiContextPayload(context),
        }),
      },
    ],
  });
  const parsed = parseJsonObject(completion.choices[0]?.message?.content);
  const question = stringField(parsed?.question);

  if (!question) {
    throw new Error('OpenAI did not return a mock interview question.');
  }

  return {
    question,
    focus: stringField(parsed?.focus) ?? 'Role fit',
  };
};

const evaluateOpenAiTurn = async ({
  client,
  context,
  session,
  answer,
}: {
  client: OpenAI;
  context: MockInterviewContext;
  session: MockInterviewSession;
  answer: string;
}): Promise<OpenAiEvaluation> => {
  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.25,
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'system',
        content:
          'You run practical mock interviews. Score answers from 1-5, give brief feedback, suggest one improvement, and ask the next question when the session is not complete. Return strict JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          outputSchema: {
            score: 'number from 1 to 5',
            feedback: 'one short sentence',
            improvement: 'one short sentence',
            nextQuestion: 'string or null',
            nextFocus: 'string or null',
            complete: 'boolean',
          },
          roundLimit: session.roundLimit,
          answeredRounds:
            session.turns.filter((turn) => turn.answer).length + 1,
          context: buildOpenAiContextPayload(context),
          transcript: session.turns,
          latestAnswer: answer,
        }),
      },
    ],
  });
  const parsed = parseJsonObject(completion.choices[0]?.message?.content);

  if (!parsed) {
    throw new Error('OpenAI did not return mock interview feedback.');
  }

  return {
    score: scoreField(parsed.score),
    feedback:
      stringField(parsed.feedback) ??
      'Relevant answer with room to sharpen evidence.',
    improvement:
      stringField(parsed.improvement) ??
      'Add one concrete result and connect it back to the JD.',
    nextQuestion: stringField(parsed.nextQuestion),
    nextFocus: stringField(parsed.nextFocus),
    complete: parsed.complete === true,
  };
};

const createTurn = ({
  question,
  focus,
}: {
  question: string;
  focus: string;
}): MockInterviewTurn => ({
  id: `mock_turn_${shortId()}`,
  question,
  focus,
  answer: null,
  score: null,
  feedback: null,
  improvement: null,
  createdAt: new Date().toISOString(),
  answeredAt: null,
});

export const startMockInterview = async ({
  candidateId,
  applicationId,
  appStore,
  forceDeterministic = false,
  roundLimit,
}: {
  candidateId: string;
  applicationId: string;
} & MockInterviewOptions) => {
  const context = await loadMockInterviewContext({
    candidateId,
    applicationId,
    appStore,
  });
  const client = forceDeterministic ? null : createOpenAIClient();
  const deterministicOpening = buildQuestionFromPlaybooks({
    context,
    roundIndex: 0,
  });
  let opening = deterministicOpening;
  let mode: MockInterviewMode = 'deterministic';

  if (client) {
    try {
      opening = await generateOpenAiOpening(client, context);
      mode = 'openai';
    } catch {
      opening = deterministicOpening;
    }
  }

  const now = new Date().toISOString();

  return {
    id: `mock_interview_${shortId()}`,
    applicationId,
    mode,
    status: 'active',
    roundLimit: clampRoundLimit(roundLimit),
    createdAt: now,
    updatedAt: now,
    job: {
      title: context.job.title,
      company: context.job.company,
    },
    knowledgeMatches: context.knowledgeMatches,
    turns: [createTurn(opening)],
  } satisfies MockInterviewSession;
};

export const answerMockInterviewTurn = async ({
  candidateId,
  session,
  answer,
  appStore,
  forceDeterministic = false,
}: {
  candidateId: string;
  session: MockInterviewSession;
  answer: string;
} & Pick<MockInterviewOptions, 'appStore' | 'forceDeterministic'>) => {
  const trimmedAnswer = answer.trim();

  if (!trimmedAnswer) {
    throw new Error('Answer is required.');
  }

  if (session.status === 'complete') {
    throw new Error('This mock interview is already complete.');
  }

  const turnIndex = session.turns.findIndex((turn) => !turn.answer);

  if (turnIndex < 0) {
    throw new Error('No active mock interview question found.');
  }

  const context = await loadMockInterviewContext({
    candidateId,
    applicationId: session.applicationId,
    appStore,
  });
  const client =
    !forceDeterministic && session.mode === 'openai'
      ? createOpenAIClient()
      : null;
  const answeredCount = turnIndex + 1;
  const mustComplete = answeredCount >= session.roundLimit;
  let mode = session.mode;
  let evaluation = evaluateDeterministicMockAnswer({
    answer: trimmedAnswer,
    context,
  });
  let nextQuestion: OpenAiEvaluation['nextQuestion'] = null;
  let nextFocus: OpenAiEvaluation['nextFocus'] = null;
  let openAiComplete = false;

  if (client) {
    try {
      const openAiEvaluation = await evaluateOpenAiTurn({
        client,
        context,
        session,
        answer: trimmedAnswer,
      });
      evaluation = {
        score: openAiEvaluation.score,
        feedback: openAiEvaluation.feedback,
        improvement: openAiEvaluation.improvement,
      };
      nextQuestion = openAiEvaluation.nextQuestion;
      nextFocus = openAiEvaluation.nextFocus;
      openAiComplete = openAiEvaluation.complete;
    } catch {
      mode = 'deterministic';
    }
  }

  const answeredTurn: MockInterviewTurn = {
    ...session.turns[turnIndex]!,
    answer: trimmedAnswer,
    score: evaluation.score,
    feedback: evaluation.feedback,
    improvement: evaluation.improvement,
    answeredAt: new Date().toISOString(),
  };
  const turns = session.turns.map((turn, index) =>
    index === turnIndex ? answeredTurn : turn,
  );
  const complete = mustComplete || openAiComplete;

  if (!complete) {
    const deterministicNext = buildQuestionFromPlaybooks({
      context,
      roundIndex: answeredCount,
    });

    turns.push(
      createTurn({
        question: nextQuestion ?? deterministicNext.question,
        focus: nextFocus ?? deterministicNext.focus,
      }),
    );
  }

  return {
    ...session,
    mode,
    status: complete ? 'complete' : 'active',
    updatedAt: new Date().toISOString(),
    knowledgeMatches: context.knowledgeMatches,
    turns,
  } satisfies MockInterviewSession;
};

const renderMockInterviewNotes = ({
  session,
  job,
}: {
  session: MockInterviewSession;
  job: JobPosting;
}) => {
  const lines = [
    `Mock interview for ${job.title} at ${job.company}`,
    `Mode: ${session.mode}`,
    `Status: ${session.status}`,
    '',
    'Knowledge sources:',
    ...session.knowledgeMatches.map(
      (match) => `- ${match.title} (${match.relativePath})`,
    ),
    '',
    'Transcript:',
    ...session.turns.flatMap((turn, index) => [
      '',
      `Round ${index + 1}: ${turn.focus}`,
      `Q: ${turn.question}`,
      `A: ${turn.answer ?? ''}`,
      turn.score ? `Score: ${turn.score}/5` : 'Score: not answered',
      turn.feedback ? `Feedback: ${turn.feedback}` : '',
      turn.improvement ? `Improve: ${turn.improvement}` : '',
    ]),
  ];

  return lines.filter((line) => line !== '').join('\n');
};

export const saveMockInterviewSession = async ({
  candidateId,
  session,
  appStore,
}: {
  candidateId: string;
  session: MockInterviewSession;
  appStore?: AppStore;
}) => {
  const activeStore = getStore(appStore);
  const detail = await activeStore.getApplicationDetail(
    candidateId,
    session.applicationId,
  );

  if (!detail || !detail.job) {
    throw new Error('Application not found for mock interview.');
  }

  const now = new Date().toISOString();
  const interview: InterviewRecord = {
    id: `interview_${shortId()}`,
    applicationId: session.applicationId,
    scheduledAt: null,
    interviewerNames: ['ApplyPilot mock interviewer'],
    stage: `Mock interview - ${detail.job.title}`,
    notes: renderMockInterviewNotes({
      session,
      job: detail.job,
    }),
    tags: ['mock-interview', session.mode, detail.job.company],
    createdAt: now,
    updatedAt: now,
  };

  return activeStore.saveInterview(interview);
};
