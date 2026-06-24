import OpenAI from 'openai';
import {
  candidateProfileSchema,
  scoreJobAgainstPreferences,
  type CandidateProfile,
  type JobPosting,
  type JobPreference,
  type MatchScore,
  type ResumeVersion,
  type TailoredResume,
} from '@applypilot/domain';

import { env } from '@/lib/env';
import { shortId } from '@/lib/utils';

const createOpenAIClient = () => {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
};

const parseJsonContent = <T>(value: string | null | undefined, fallback: T) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const NAME_LINE_PATTERN = /^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/;
const NAME_STOPWORDS =
  /\b(experience|specialize|specialise|product|growth|strategy|data|analyst|manager|lead|summary|profile|singapore|fintech|web3)\b/i;

const inferLikelyNameFromResumeText = (text: string) => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    const candidate = line.replace(/\s+/g, ' ').trim();
    if (candidate.length > 2 && candidate.length <= 60 && NAME_LINE_PATTERN.test(candidate) && !NAME_STOPWORDS.test(candidate)) {
      return candidate;
    }
  }

  return '';
};

const sanitizeCandidateProfile = (candidateId: string, resumeText: string, profile: CandidateProfile) => {
  const inferredName = inferLikelyNameFromResumeText(resumeText);
  const safeFullName =
    profile.fullName.trim().length > 0 &&
    profile.fullName.trim().split(/\s+/).length <= 5 &&
    !NAME_STOPWORDS.test(profile.fullName)
      ? profile.fullName.trim()
      : inferredName || profile.fullName.trim() || 'Candidate';

  return candidateProfileSchema.parse({
    ...profile,
    id: candidateId,
    fullName: safeFullName,
    phone: profile.phone.trim(),
    location: profile.location.trim(),
    lastParsedAt: new Date().toISOString(),
  });
};

const fallbackParseProfile = (candidateId: string, text: string): CandidateProfile => {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const phone = text.match(/(\+\d{1,3}[\s-]?)?(\d[\s-]?){8,}/)?.[0] ?? '';
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines.slice(0, 5).join(' ');
  const inferredName = lines[0] ?? 'Candidate';
  const skills = [...new Set((text.match(/\b[A-Z][A-Za-z0-9+#]{2,}\b/g) ?? []).slice(0, 12))];

  return sanitizeCandidateProfile(candidateId, text, candidateProfileSchema.parse({
    id: candidateId,
    fullName: inferredName,
    email,
    phone,
    location: header.includes('Singapore') ? 'Singapore' : '',
    yearsExperience: text.includes('12 years') ? 12 : 8,
    summary: lines.slice(0, 3).join(' '),
    workExperiences: [],
    skills,
    targetRoles: ['Senior Product Manager', 'Lead Product Manager'],
    industries: ['Fintech'],
    education: [],
    lastParsedAt: new Date().toISOString(),
  }));
};

export const parseCandidateProfileWithAi = async ({
  candidateId,
  resumeText,
}: {
  candidateId: string;
  resumeText: string;
}) => {
  const client = createOpenAIClient();

  if (!client) {
    return fallbackParseProfile(candidateId, resumeText);
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      response_format: {
        type: 'json_object',
      },
      messages: [
        {
          role: 'system',
          content:
            'Extract a structured candidate profile for a single-user job application assistant. Return strict JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            candidateId,
            resumeText,
            schemaHint: {
              fullName: 'string',
              email: 'string',
              phone: 'string',
              location: 'string',
              yearsExperience: 'number',
              summary: 'string',
              workExperiences: [
                {
                  company: 'string',
                  title: 'string',
                  startDate: 'string',
                  endDate: 'string | null',
                  summary: 'string',
                  achievements: ['string'],
                },
              ],
              skills: ['string'],
              targetRoles: ['string'],
              industries: ['string'],
              education: [
                {
                  institution: 'string',
                  degree: 'string',
                  field: 'string',
                  graduationYear: 'string | null',
                },
              ],
            },
          }),
        },
      ],
    });

    const response = completion.choices[0]?.message?.content;
    return sanitizeCandidateProfile(candidateId, resumeText, candidateProfileSchema.parse({
      ...parseJsonContent<Record<string, unknown>>(response, {}),
      id: candidateId,
      lastParsedAt: new Date().toISOString(),
    }));
  } catch {
    return fallbackParseProfile(candidateId, resumeText);
  }
};

export const scoreJobWithAi = async ({
  profile,
  preferences,
  job,
}: {
  profile: CandidateProfile;
  preferences: JobPreference;
  job: JobPosting;
}): Promise<MatchScore> => {
  const client = createOpenAIClient();
  const fallback = scoreJobAgainstPreferences(profile, preferences, job);

  if (!client) {
    return fallback;
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      response_format: {
        type: 'json_object',
      },
      messages: [
        {
          role: 'system',
          content:
            'Score job fit from 0-100. Return JSON with overall, keywordHits, gaps, reasons, recommendedAction.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            profile,
            preferences,
            job,
          }),
        },
      ],
    });

    const response = parseJsonContent<Record<string, unknown>>(
      completion.choices[0]?.message?.content,
      {},
    );

    return {
      ...fallback,
      overall: typeof response.overall === 'number' ? response.overall : fallback.overall,
      keywordHits: Array.isArray(response.keywordHits)
        ? response.keywordHits.map(String)
        : fallback.keywordHits,
      gaps: Array.isArray(response.gaps) ? response.gaps.map(String) : fallback.gaps,
      reasons: Array.isArray(response.reasons) ? response.reasons.map(String) : fallback.reasons,
      recommendedAction:
        response.recommendedAction === 'apply' ||
        response.recommendedAction === 'review' ||
        response.recommendedAction === 'skip'
          ? response.recommendedAction
          : fallback.recommendedAction,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
};

const fallbackResumeMarkdown = ({
  profile,
  job,
  score,
}: {
  profile: CandidateProfile;
  job: JobPosting;
  score: MatchScore;
}) => {
  const bullets = [
    `${profile.fullName} is aligned to ${job.title} with ${profile.yearsExperience}+ years of experience.`,
    `Relevant themes: ${score.keywordHits.join(', ') || 'product leadership and fintech execution'}.`,
    `Recent strengths include ${profile.skills.slice(0, 4).join(', ')}.`,
    `Prioritised for ${job.company} because of ${score.reasons.join('; ')}.`,
  ];

  return `# ${profile.fullName}\n\n## Professional Summary\n${profile.summary}\n\n## Tailored Highlights\n${bullets
    .map((bullet) => `- ${bullet}`)
    .join('\n')}\n\n## Selected Experience\n${profile.workExperiences
    .map(
      (experience) =>
        `- ${experience.title}, ${experience.company}: ${experience.summary || experience.achievements.join('; ')}`,
    )
    .join('\n')}\n\n## Skills\n${profile.skills.join(', ')}`;
};

export const generateTailoredResumeWithAi = async ({
  candidateId,
  resume,
  profile,
  job,
  score,
}: {
  candidateId: string;
  resume: ResumeVersion;
  profile: CandidateProfile;
  job: JobPosting;
  score: MatchScore;
}): Promise<TailoredResume> => {
  const client = createOpenAIClient();
  const fallbackMarkdown = fallbackResumeMarkdown({ profile, job, score });

  if (!client) {
    return {
      id: `tailored_${shortId()}`,
      candidateId,
      jobPostingId: job.id,
      baseResumeId: resume.id,
      title: `${job.title} - tailored resume`,
      markdownContent: fallbackMarkdown,
      pdfStoragePath: null,
      downloadUrl: null,
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the resume as concise markdown for a one-page tailored application. Focus on relevance and truthfulness.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            baseResumeText: resume.textContent,
            profile,
            job,
            score,
          }),
        },
      ],
    });

    return {
      id: `tailored_${shortId()}`,
      candidateId,
      jobPostingId: job.id,
      baseResumeId: resume.id,
      title: `${job.title} - tailored resume`,
      markdownContent: completion.choices[0]?.message?.content ?? fallbackMarkdown,
      pdfStoragePath: null,
      downloadUrl: null,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      id: `tailored_${shortId()}`,
      candidateId,
      jobPostingId: job.id,
      baseResumeId: resume.id,
      title: `${job.title} - tailored resume`,
      markdownContent: fallbackMarkdown,
      pdfStoragePath: null,
      downloadUrl: null,
      generatedAt: new Date().toISOString(),
    };
  }
};
