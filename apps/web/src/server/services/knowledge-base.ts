import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { JobPosting, MatchScore } from '@applypilot/domain';

export const knowledgeEntryKinds = ['interviews', 'stories', 'job_profiles', 'playbooks'] as const;

const requiredSectionNames = [
  'Context',
  'Core facts',
  'Interview value',
  'Reusable answer points',
  'Related roles',
  'Tags',
] as const;
const optionalSectionNames = ['Search terms', 'Resume signals'] as const;
const sectionNames = [...requiredSectionNames, ...optionalSectionNames] as const;

export type KnowledgeEntryKind = (typeof knowledgeEntryKinds)[number];
type SectionName = (typeof sectionNames)[number];
type RequiredSectionName = (typeof requiredSectionNames)[number];

export type KnowledgeEntryInput = {
  kind: KnowledgeEntryKind;
  title: string;
  context: string;
  coreFacts: string[];
  interviewValue: string;
  reusableAnswerPoints: string[];
  relatedRoles: string[];
  tags: string[];
  searchTerms?: string[];
  resumeSignals?: string[];
};

export type KnowledgeEntry = Omit<KnowledgeEntryInput, 'searchTerms' | 'resumeSignals'> & {
  id: string;
  kindLabel: string;
  sourcePath: string;
  metadataPath: string | null;
  relativePath: string;
  sourceLabel: string;
  isPrivate: boolean;
  updatedAt: string | null;
  wordCount: number;
  missingSections: RequiredSectionName[];
  searchTerms: string[];
  resumeSignals: string[];
};

export type KnowledgeMatch = {
  title: string;
  kindLabel: string;
  relativePath: string;
  tags: string[];
  reason: string;
  answerPoints: string[];
};

export const knowledgeEntryKindLabels: Record<KnowledgeEntryKind, string> = {
  interviews: 'Interview notes',
  stories: 'Career stories',
  job_profiles: 'Job profiles',
  playbooks: 'Answer playbooks',
};

export const isKnowledgeEntryKind = (value: string | undefined): value is KnowledgeEntryKind =>
  knowledgeEntryKinds.some((kind) => kind === value);

const toTitle = (fileName: string) =>
  fileName
    .replace(/\.(md|json)$/i, '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const normalizeHeading = (heading: string): SectionName | null => {
  const normalized = heading.trim().toLowerCase();

  return sectionNames.find((name) => name.toLowerCase() === normalized) ?? null;
};

const splitList = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);

const wordCount = (content: string) => content.trim().split(/\s+/).filter(Boolean).length;

const extractSections = (content: string) => {
  const sections: Partial<Record<SectionName, string[]>> = {};
  let currentSection: SectionName | null = null;

  content.split(/\r?\n/).forEach((line) => {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);

    if (headingMatch) {
      const heading = headingMatch[1];
      currentSection = heading ? normalizeHeading(heading) : null;

      if (currentSection) {
        sections[currentSection] = sections[currentSection] ?? [];
      }

      return;
    }

    if (currentSection) {
      sections[currentSection]?.push(line);
    }
  });

  const text = (name: SectionName) => (sections[name] ?? []).join('\n').trim();

  return {
    context: text('Context'),
    coreFacts: splitList(text('Core facts')),
    interviewValue: text('Interview value'),
    reusableAnswerPoints: splitList(text('Reusable answer points')),
    relatedRoles: splitList(text('Related roles')),
    tags: splitList(text('Tags')),
    searchTerms: splitList(text('Search terms')),
    resumeSignals: splitList(text('Resume signals')),
  };
};

const extractTitle = (content: string, fileName: string) => {
  const titleLine = content.split(/\r?\n/).find((line) => /^#\s+/.test(line));

  if (titleLine) {
    return titleLine.replace(/^#\s+/, '').trim();
  }

  const lines = content.split(/\r?\n/);
  const titleSectionIndex = lines.findIndex((line) => /^##\s+Title\s*$/i.test(line));
  const titleSectionLines: string[] = [];

  if (titleSectionIndex >= 0) {
    for (const line of lines.slice(titleSectionIndex + 1)) {
      if (/^##\s+/.test(line)) {
        break;
      }

      titleSectionLines.push(line);
    }
  }

  const titleSection = titleSectionLines.map((line) => line.trim()).find(Boolean);

  return titleSection || toTitle(fileName);
};

type KnowledgeEntryMetadata = Partial<Omit<KnowledgeEntryInput, 'kind'>> & {
  id?: string;
};

type KnowledgeBaseRoot = {
  root: string;
  relativeRoot: string;
  sourceLabel: string;
  isPrivate: boolean;
};

const normalizeListItem = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const uniqueList = (...lists: string[][]) => {
  const seen = new Set<string>();
  const items: string[] = [];

  lists.flat().forEach((item) => {
    const normalized = item.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    items.push(normalized);
  });

  return items;
};

const textField = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined);

const listField = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map(normalizeListItem).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
};

const metadataValue = (metadata: Record<string, unknown>, camelKey: string, snakeKey: string) =>
  metadata[camelKey] ?? metadata[snakeKey];

const parseKnowledgeEntryMetadata = async (filePath: string): Promise<KnowledgeEntryMetadata> => {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Knowledge JSON must be an object: ${filePath}`);
  }

  const metadata = parsed as Record<string, unknown>;

  return {
    id: textField(metadata.id),
    title: textField(metadata.title),
    context: textField(metadata.context),
    coreFacts: listField(metadataValue(metadata, 'coreFacts', 'core_facts')),
    interviewValue: textField(metadataValue(metadata, 'interviewValue', 'interview_value')),
    reusableAnswerPoints: listField(
      metadataValue(metadata, 'reusableAnswerPoints', 'reusable_answer_points'),
    ),
    relatedRoles: listField(metadataValue(metadata, 'relatedRoles', 'related_roles')),
    tags: listField(metadata.tags),
    searchTerms: listField(metadataValue(metadata, 'searchTerms', 'search_terms')),
    resumeSignals: listField(metadataValue(metadata, 'resumeSignals', 'resume_signals')),
  };
};

const statUpdatedAt = async (filePath: string | null) => {
  if (!filePath) {
    return null;
  }

  const stat = await fs.stat(filePath);

  return stat.mtime.toISOString();
};

const latestTimestamp = (...timestamps: Array<string | null>) => {
  const validTimestamps = timestamps.filter((timestamp): timestamp is string => Boolean(timestamp));

  if (validTimestamps.length === 0) {
    return null;
  }

  return new Date(
    Math.max(...validTimestamps.map((timestamp) => new Date(timestamp).getTime())),
  ).toISOString();
};

const buildEntryWordSource = (content: string, metadata: KnowledgeEntryMetadata | null) =>
  [
    content,
    metadata?.context,
    metadata?.interviewValue,
    ...(metadata?.coreFacts ?? []),
    ...(metadata?.reusableAnswerPoints ?? []),
    ...(metadata?.relatedRoles ?? []),
    ...(metadata?.tags ?? []),
    ...(metadata?.searchTerms ?? []),
    ...(metadata?.resumeSignals ?? []),
  ]
    .filter(Boolean)
    .join(' ');

const parseKnowledgeEntry = async ({
  markdownContent,
  markdownFileName,
  markdownPath,
  metadata,
  metadataFileName,
  metadataPath,
  kind,
  root,
}: {
  markdownContent: string;
  markdownFileName: string | null;
  markdownPath: string | null;
  metadata: KnowledgeEntryMetadata | null;
  metadataFileName: string | null;
  metadataPath: string | null;
  kind: KnowledgeEntryKind;
  root: KnowledgeBaseRoot;
}): Promise<KnowledgeEntry> => {
  const entryFileName = markdownFileName ?? metadataFileName ?? 'entry.json';
  const entryPath = markdownPath ?? metadataPath ?? path.join(root.root, kind, entryFileName);
  const sections = extractSections(markdownContent);
  const markdownUpdatedAt = await statUpdatedAt(markdownPath);
  const metadataUpdatedAt = await statUpdatedAt(metadataPath);
  const merged = {
    title: metadata?.title ?? extractTitle(markdownContent, entryFileName),
    context: metadata?.context ?? sections.context,
    coreFacts: uniqueList(sections.coreFacts, metadata?.coreFacts ?? []),
    interviewValue: metadata?.interviewValue ?? sections.interviewValue,
    reusableAnswerPoints: uniqueList(
      sections.reusableAnswerPoints,
      metadata?.reusableAnswerPoints ?? [],
    ),
    relatedRoles: uniqueList(sections.relatedRoles, metadata?.relatedRoles ?? []),
    tags: uniqueList(sections.tags, metadata?.tags ?? []),
    searchTerms: uniqueList(sections.searchTerms, metadata?.searchTerms ?? []),
    resumeSignals: uniqueList(sections.resumeSignals, metadata?.resumeSignals ?? []),
  };
  const missingSections = requiredSectionNames.filter((name) => {
    if (name === 'Core facts') {
      return merged.coreFacts.length === 0;
    }

    if (name === 'Reusable answer points') {
      return merged.reusableAnswerPoints.length === 0;
    }

    if (name === 'Related roles') {
      return merged.relatedRoles.length === 0;
    }

    if (name === 'Tags') {
      return merged.tags.length === 0;
    }

    if (name === 'Context') {
      return merged.context.length === 0;
    }

    return merged.interviewValue.length === 0;
  });
  const entryId =
    metadata?.id ??
    entryFileName
      .replace(/\.md$/i, '')
      .replace(/\.json$/i, '');

  return {
    id: entryId,
    kind,
    kindLabel: knowledgeEntryKindLabels[kind],
    ...merged,
    sourcePath: entryPath,
    metadataPath,
    relativePath: [root.relativeRoot, kind, entryFileName].join('/'),
    sourceLabel: root.sourceLabel,
    isPrivate: root.isPrivate,
    updatedAt: latestTimestamp(markdownUpdatedAt, metadataUpdatedAt),
    wordCount: wordCount(buildEntryWordSource(markdownContent, metadata)),
    missingSections,
  };
};

export const findKnowledgeBaseRoot = async () => {
  const candidates = [
    path.resolve(process.cwd(), 'knowledge_base'),
    path.resolve(process.cwd(), '..', '..', 'knowledge_base'),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);

      if (stat.isDirectory()) {
        return candidate;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return candidates[0]!;
};

const getKnowledgeBaseRoots = async (): Promise<KnowledgeBaseRoot[]> => {
  const publicRoot = await findKnowledgeBaseRoot();
  const privateRoot = path.join(path.dirname(publicRoot), 'local_workspace', 'knowledge_base_private');

  return [
    {
      root: publicRoot,
      relativeRoot: 'knowledge_base',
      sourceLabel: 'Public knowledge base',
      isPrivate: false,
    },
    {
      root: privateRoot,
      relativeRoot: 'local_workspace/knowledge_base_private',
      sourceLabel: 'Private local knowledge base',
      isPrivate: true,
    },
  ];
};

const readKnowledgeDirectory = async (directory: string) => {
  const dirents = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (!dirents) {
    return [];
  }

  return dirents.filter(
    (dirent) => dirent.isFile() && /\.(md|json)$/i.test(dirent.name),
  );
};

const readKindEntries = async (root: KnowledgeBaseRoot, kind: KnowledgeEntryKind) => {
  const directory = path.join(root.root, kind);
  const files = await readKnowledgeDirectory(directory);
  const filesByEntry = new Map<
    string,
    {
      markdownFileName: string | null;
      metadataFileName: string | null;
    }
  >();

  files.forEach((file) => {
    const baseName = file.name.replace(/\.(md|json)$/i, '');
    const existing = filesByEntry.get(baseName) ?? {
      markdownFileName: null,
      metadataFileName: null,
    };

    if (/\.md$/i.test(file.name)) {
      existing.markdownFileName = file.name;
    } else {
      existing.metadataFileName = file.name;
    }

    filesByEntry.set(baseName, existing);
  });

  return Promise.all(
    [...filesByEntry.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([, filesForEntry]) => {
        const markdownPath = filesForEntry.markdownFileName
          ? path.join(directory, filesForEntry.markdownFileName)
          : null;
        const metadataPath = filesForEntry.metadataFileName
          ? path.join(directory, filesForEntry.metadataFileName)
          : null;
        const [markdownContent, metadata] = await Promise.all([
          markdownPath ? fs.readFile(markdownPath, 'utf8') : Promise.resolve(''),
          metadataPath ? parseKnowledgeEntryMetadata(metadataPath) : Promise.resolve(null),
        ]);

        return parseKnowledgeEntry({
          markdownContent,
          markdownFileName: filesForEntry.markdownFileName,
          markdownPath,
          metadata,
          metadataFileName: filesForEntry.metadataFileName,
          metadataPath,
          kind,
          root,
        });
      }),
  );
};

export const getKnowledgeBaseEntries = async () => {
  const roots = await getKnowledgeBaseRoots();
  const entriesByKind = await Promise.all(
    roots.flatMap((root) => knowledgeEntryKinds.map((kind) => readKindEntries(root, kind))),
  );

  return entriesByKind.flat().sort((left, right) => {
    const kindDiff = knowledgeEntryKinds.indexOf(left.kind) - knowledgeEntryKinds.indexOf(right.kind);

    if (kindDiff !== 0) {
      return kindDiff;
    }

    if (left.isPrivate !== right.isPrivate) {
      return left.isPrivate ? 1 : -1;
    }

    return left.title.localeCompare(right.title);
  });
};

export const getKnowledgeBaseTags = async () => {
  const entries = await getKnowledgeBaseEntries();
  const tagsByLowercase = new Map<string, string>();

  entries.flatMap((entry) => entry.tags).forEach((tag) => {
    const normalized = tag.toLowerCase();

    if (!tagsByLowercase.has(normalized)) {
      tagsByLowercase.set(normalized, tag);
    }
  });

  return [...tagsByLowercase.values()].sort((left, right) => left.localeCompare(right));
};

const slugifyEntryTitle = (title: string) => {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || `entry_${Date.now()}`;
};

const renderList = (items: string[]) => items.map((item) => `- ${item}`).join('\n');

const renderOptionalSection = (title: string, items: string[] | undefined) =>
  items && items.length > 0 ? `\n## ${title}\n\n${renderList(items)}\n` : '';

const renderKnowledgeEntry = (input: KnowledgeEntryInput) => `# ${input.title}

## Context

${input.context}

## Core facts

${renderList(input.coreFacts)}

## Interview value

${input.interviewValue}

## Reusable answer points

${renderList(input.reusableAnswerPoints)}

## Related roles

${renderList(input.relatedRoles)}

## Tags

${renderList(input.tags)}
${renderOptionalSection('Search terms', input.searchTerms)}
${renderOptionalSection('Resume signals', input.resumeSignals)}
`;

const getUniqueEntryPath = async (directory: string, slug: string) => {
  let suffix = 1;

  while (true) {
    const fileName = suffix === 1 ? `${slug}.md` : `${slug}_${suffix}.md`;
    const filePath = path.join(directory, fileName);

    try {
      await fs.access(filePath);
      suffix += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { fileName, filePath };
      }

      throw error;
    }
  }
};

export const saveKnowledgeBaseEntry = async (input: KnowledgeEntryInput) => {
  const root = await findKnowledgeBaseRoot();
  const directory = path.join(root, input.kind);
  const slug = slugifyEntryTitle(input.title);

  await fs.mkdir(directory, { recursive: true });

  const { fileName, filePath } = await getUniqueEntryPath(directory, slug);
  const content = renderKnowledgeEntry(input);

  await fs.writeFile(filePath, content, 'utf8');

  return parseKnowledgeEntry({
    markdownContent: content,
    markdownFileName: fileName,
    markdownPath: filePath,
    metadata: null,
    metadataFileName: null,
    metadataPath: null,
    kind: input.kind,
    root: {
      root,
      relativeRoot: 'knowledge_base',
      sourceLabel: 'Public knowledge base',
      isPrivate: false,
    },
  });
};

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9+#]+/i)
    .filter(Boolean)
    .join(' ');

const phraseMatches = (haystack: string, value: string) => {
  const normalized = normalizeSearchText(value);

  return normalized.length > 0 && ` ${haystack} `.includes(` ${normalized} `);
};

const termMatches = (haystack: string, value: string) => {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return false;
  }

  if (phraseMatches(haystack, value)) {
    return true;
  }

  const haystackTokens = new Set(haystack.split(' ').filter(Boolean));
  const tokens = normalized.split(' ').filter(Boolean);

  return tokens.length > 0 && tokens.every((token) => haystackTokens.has(token));
};

const buildEntrySearchText = (entry: KnowledgeEntry) =>
  normalizeSearchText(
    [
      entry.title,
      entry.context,
      entry.interviewValue,
      ...entry.coreFacts,
      ...entry.reusableAnswerPoints,
      ...entry.relatedRoles,
      ...entry.tags,
      ...entry.searchTerms,
      ...entry.resumeSignals,
    ].join(' '),
  );

export const matchKnowledgeEntriesForJob = ({
  entries,
  job,
  score,
  limit = 3,
}: {
  entries: KnowledgeEntry[];
  job: JobPosting;
  score: MatchScore;
  limit?: number;
}): KnowledgeMatch[] => {
  const jobText = normalizeSearchText(
    [
      job.title,
      job.company,
      job.location,
      job.employmentType ?? '',
      job.description,
      score.keywordHits.join(' '),
      score.reasons.join(' '),
    ].join(' '),
  );

  return entries
    .map((entry) => {
      const entryText = buildEntrySearchText(entry);
      const matchedTags = entry.tags.filter((tag) => termMatches(jobText, tag));
      const matchedRoles = entry.relatedRoles.filter((role) => termMatches(jobText, role));
      const matchedSearchTerms = entry.searchTerms.filter((term) => termMatches(jobText, term));
      const matchedKeywords = score.keywordHits.filter((keyword) => termMatches(entryText, keyword));
      const titleMatch = termMatches(jobText, entry.title);
      const matchScore =
        matchedRoles.length * 6 +
        matchedTags.length * 4 +
        matchedSearchTerms.length * 4 +
        matchedKeywords.length * 2 +
        (titleMatch ? 2 : 0);
      const scoreValue =
        matchScore > 0
          ? matchScore +
            (entry.kind === 'stories' ? 1 : 0) +
            (entry.kind === 'playbooks' ? 1 : 0)
          : 0;

      const reason =
        matchedRoles.length > 0
          ? `Related role match: ${matchedRoles.slice(0, 2).join(', ')}`
          : matchedTags.length > 0
            ? `Matched tags: ${matchedTags.slice(0, 3).join(', ')}`
            : matchedSearchTerms.length > 0
              ? `Matched search terms: ${matchedSearchTerms.slice(0, 3).join(', ')}`
              : matchedKeywords.length > 0
                ? `Resume/job keyword overlap: ${matchedKeywords.slice(0, 3).join(', ')}`
                : titleMatch
                  ? 'Title overlaps with this role'
                  : '';

      return {
        entry,
        reason,
        scoreValue,
      };
    })
    .filter((match) => match.scoreValue > 0)
    .sort((left, right) => {
      if (right.scoreValue !== left.scoreValue) {
        return right.scoreValue - left.scoreValue;
      }

      return left.entry.title.localeCompare(right.entry.title);
    })
    .slice(0, limit)
    .map(({ entry, reason }) => ({
      title: entry.title,
      kindLabel: entry.kindLabel,
      relativePath: entry.relativePath,
      tags: entry.tags.slice(0, 4),
      reason,
      answerPoints: uniqueList(entry.resumeSignals, entry.reusableAnswerPoints, entry.coreFacts).slice(0, 3),
    }));
};
