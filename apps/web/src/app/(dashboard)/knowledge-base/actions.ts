'use server';

import { revalidatePath } from 'next/cache';

import {
  isKnowledgeEntryKind,
  saveKnowledgeBaseEntry,
  type KnowledgeEntryKind,
} from '@/server/services/knowledge-base';
import { requirePageAuth } from '@/server/auth';

const getText = (formData: FormData, key: string) => {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
};

const getRequiredText = (formData: FormData, key: string, label: string) => {
  const value = getText(formData, key);

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
};

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const splitLooseList = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

const getKind = (formData: FormData): KnowledgeEntryKind => {
  const value = getText(formData, 'kind');

  if (!isKnowledgeEntryKind(value)) {
    throw new Error('Choose a valid knowledge base type.');
  }

  return value;
};

export async function createKnowledgeBaseEntry(formData: FormData) {
  await requirePageAuth();

  await saveKnowledgeBaseEntry({
    kind: getKind(formData),
    title: getRequiredText(formData, 'title', 'Title'),
    context: getText(formData, 'context'),
    coreFacts: splitLines(getText(formData, 'coreFacts')),
    interviewValue: getText(formData, 'interviewValue'),
    reusableAnswerPoints: splitLines(getText(formData, 'reusableAnswerPoints')),
    relatedRoles: splitLooseList(getText(formData, 'relatedRoles')),
    tags: splitLooseList(getText(formData, 'tags')),
    searchTerms: splitLooseList(getText(formData, 'searchTerms')),
    resumeSignals: splitLines(getText(formData, 'resumeSignals')),
  });

  revalidatePath('/knowledge-base');
}
