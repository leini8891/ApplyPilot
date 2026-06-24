import Link from 'next/link';

import { EmptyState, SectionCard, StatCard, StatusPill } from '@applypilot/ui';

import { formatDateTime } from '@/lib/utils';
import {
  getKnowledgeBaseEntries,
  getKnowledgeBaseTags,
  isKnowledgeEntryKind,
  knowledgeEntryKindLabels,
  knowledgeEntryKinds,
  type KnowledgeEntry,
  type KnowledgeEntryKind,
} from '@/server/services/knowledge-base';

import { createKnowledgeBaseEntry } from './actions';

type KnowledgeBasePageProps = {
  searchParams?: Promise<{
    kind?: string | string[];
    tag?: string | string[];
  }>;
};

type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const normalizeParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const matchesTag = (entry: KnowledgeEntry, selectedTag: string) =>
  entry.tags.some((tag) => tag.toLowerCase() === selectedTag.toLowerCase());

const structureTone = (entry: KnowledgeEntry): StatusTone =>
  entry.missingSections.length === 0 ? 'success' : 'warning';

const previewList = (items: string[]) => items.slice(0, 3);

export default async function KnowledgeBasePage({ searchParams }: KnowledgeBasePageProps) {
  const params = await searchParams;
  const requestedKind = normalizeParam(params?.kind);
  const selectedKind = isKnowledgeEntryKind(requestedKind) ? requestedKind : null;
  const selectedTag = normalizeParam(params?.tag) ?? null;
  const [entries, tags] = await Promise.all([getKnowledgeBaseEntries(), getKnowledgeBaseTags()]);
  const completeEntries = entries.filter((entry) => entry.missingSections.length === 0);
  const visibleEntries = entries.filter((entry) => {
    const kindMatch = selectedKind ? entry.kind === selectedKind : true;
    const tagMatch = selectedTag ? matchesTag(entry, selectedTag) : true;

    return kindMatch && tagMatch;
  });

  const createFilterHref = ({
    kind,
    tag,
  }: {
    kind?: KnowledgeEntryKind | null;
    tag?: string | null;
  } = {}) => {
    const nextKind = kind === undefined ? selectedKind : kind;
    const nextTag = tag === undefined ? selectedTag : tag;
    const nextParams = new URLSearchParams();

    if (nextKind) {
      nextParams.set('kind', nextKind);
    }

    if (nextTag) {
      nextParams.set('tag', nextTag);
    }

    const query = nextParams.toString();

    return query ? `/knowledge-base?${query}` : '/knowledge-base';
  };

  return (
    <div className="page-grid">
      <section className="stats-row">
        <StatCard label="Entries" tone="accent" value={entries.length} />
        <StatCard label="Ready" tone="success" value={completeEntries.length} />
        <StatCard label="Tags" value={tags.length} />
        <StatCard label="Visible" tone="warning" value={visibleEntries.length} />
      </section>

      <div className="two-column-grid">
        <SectionCard
          description="Create markdown-backed notes, stories, role profiles, and reusable answer frameworks."
          eyebrow="Add"
          title="New knowledge entry"
        >
          <form action={createKnowledgeBaseEntry} className="knowledge-form">
            <div className="field-grid">
              <label className="field">
                <span>Type</span>
                <select defaultValue="stories" name="kind" required>
                  {knowledgeEntryKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {knowledgeEntryKindLabels[kind]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Title</span>
                <input name="title" placeholder="Payment reliability story" required />
              </label>
            </div>

            <label className="field">
              <span>Context</span>
              <textarea name="context" rows={3} />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Core facts</span>
                <textarea name="coreFacts" rows={5} />
              </label>

              <label className="field">
                <span>Reusable answer points</span>
                <textarea name="reusableAnswerPoints" rows={5} />
              </label>
            </div>

            <label className="field">
              <span>Interview value</span>
              <textarea name="interviewValue" rows={3} />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Related roles</span>
                <input name="relatedRoles" placeholder="Payments PM, Data PM" />
              </label>

              <label className="field">
                <span>Tags</span>
                <input name="tags" placeholder="payments, KYC, automation" />
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Search terms</span>
                <textarea name="searchTerms" placeholder="payment reliability, merchant trust" rows={3} />
              </label>

              <label className="field">
                <span>Resume signals</span>
                <textarea name="resumeSignals" placeholder="Reduced order-loss risk by about 30%." rows={3} />
              </label>
            </div>

            <button className="primary-button" type="submit">
              Save entry
            </button>
          </form>
        </SectionCard>

        <SectionCard
          actions={
            selectedKind || selectedTag ? (
              <Link className="ghost-link" href="/knowledge-base">
                Clear filters
              </Link>
            ) : null
          }
          description="Track the library by type, tag, and markdown structure."
          eyebrow="Manage"
          title="Library controls"
        >
          <div className="knowledge-filter-stack">
            <div>
              <p className="detail-label">Types</p>
              <div className="knowledge-filter-row">
                <Link
                  className={!selectedKind ? 'filter-pill filter-pill-active' : 'filter-pill'}
                  href={createFilterHref({ kind: null })}
                >
                  All
                </Link>
                {knowledgeEntryKinds.map((kind) => (
                  <Link
                    className={selectedKind === kind ? 'filter-pill filter-pill-active' : 'filter-pill'}
                    href={createFilterHref({ kind })}
                    key={kind}
                  >
                    {knowledgeEntryKindLabels[kind]}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="detail-label">Tags</p>
              <div className="knowledge-filter-row">
                <Link
                  className={!selectedTag ? 'filter-pill filter-pill-active' : 'filter-pill'}
                  href={createFilterHref({ tag: null })}
                >
                  All
                </Link>
                {tags.slice(0, 20).map((tag) => (
                  <Link
                    className={
                      selectedTag?.toLowerCase() === tag.toLowerCase()
                        ? 'filter-pill filter-pill-active'
                        : 'filter-pill'
                    }
                    href={createFilterHref({ tag })}
                    key={tag}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </div>

            <div className="knowledge-kind-counts">
              {knowledgeEntryKinds.map((kind) => (
                <div className="knowledge-count-row" key={kind}>
                  <span>{knowledgeEntryKindLabels[kind]}</span>
                  <strong>{entries.filter((entry) => entry.kind === kind).length}</strong>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      {visibleEntries.length > 0 ? (
        <div className="knowledge-grid">
          {visibleEntries.map((entry) => (
            <article className="knowledge-card" key={`${entry.kind}-${entry.id}`}>
              <div className="knowledge-card-header">
                <div>
                  <p className="panel-eyebrow">{entry.kindLabel}</p>
                  <h3>{entry.title}</h3>
                </div>
                <StatusPill
                  label={entry.missingSections.length === 0 ? 'Ready' : `${entry.missingSections.length} gaps`}
                  tone={structureTone(entry)}
                />
              </div>

              <p className="knowledge-summary">
                {entry.interviewValue || entry.context || 'No interview value captured yet.'}
              </p>

              <div className="knowledge-card-body">
                <div>
                  <h4>Core facts</h4>
                  {entry.coreFacts.length > 0 ? (
                    <ul className="signal-list">
                      {previewList(entry.coreFacts).map((fact) => (
                        <li className="signal-positive" key={fact}>
                          {fact}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-copy">No core facts yet.</p>
                  )}
                </div>

                <div>
                  <h4>Answer points</h4>
                  {entry.reusableAnswerPoints.length > 0 ? (
                    <ul className="signal-list">
                      {previewList(entry.reusableAnswerPoints).map((point) => (
                        <li className="signal-positive" key={point}>
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-copy">No answer points yet.</p>
                  )}
                </div>
              </div>

              <div className="tag-row">
                {entry.tags.length > 0 ? (
                  entry.tags.map((tag) => (
                    <Link className="tag" href={createFilterHref({ tag })} key={tag}>
                      {tag}
                    </Link>
                  ))
                ) : (
                  <span className="tag">untagged</span>
                )}
              </div>

              {entry.missingSections.length > 0 ? (
                <p className="knowledge-warning">
                  Missing: {entry.missingSections.join(', ')}
                </p>
              ) : null}

              <div className="knowledge-source">
                <span>
                  {entry.relativePath} · {entry.sourceLabel}
                </span>
                <span>
                  {entry.wordCount} words | {formatDateTime(entry.updatedAt)}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <SectionCard eyebrow="Library" title="No matching entries">
          <EmptyState
            title="No entries found"
            description="Add a story, interview note, job profile, or playbook to start building the reusable career library."
          />
        </SectionCard>
      )}
    </div>
  );
}
