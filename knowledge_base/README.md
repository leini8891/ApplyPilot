# ApplyPilot Knowledge Base

This folder is the shareable, GitHub-safe knowledge base for ApplyPilot.

It should contain sanitized interview prep, reusable career stories, role profiles, and answer playbooks that can support retrieval, filtering, and answer generation without exposing private job-search details.

## Public-Safe Boundary

Content in this folder should be safe to commit after review. Keep it focused on reusable patterns:

- payment, risk, compliance, analytics, product, and automation positioning
- reusable career stories with clear tags
- generic or lightly sanitized interview playbooks
- company or role notes that do not reveal private application state

Do not store:

- recruiter private emails or phone numbers
- exact compensation expectations or current salary details
- passport, ID, visa, PR, or sponsorship documents
- private interview links, meeting times, or interviewer contact details
- local filesystem paths to resumes or documents
- confidential company information
- application workflow notes such as "do not submit yet" or private approval status

Private notes belong in `local_workspace/knowledge_base_private/`, which is intentionally ignored by Git.

## Structure

- `interviews/`: sanitized interview prep notes or public-safe sample prep
- `stories/`: reusable career stories
- `job_profiles/`: sanitized company, role, or job-profile notes
- `playbooks/`: reusable answer frameworks

ApplyPilot also reads the same folder structure from `local_workspace/knowledge_base_private/`.
That private folder is ignored by Git and can hold local-only Markdown or JSON entries that should not be committed.

## Entry Format

Each markdown entry should include:

```md
# Title

## Context

## Core facts

## Interview value

## Reusable answer points

## Related roles

## Tags
```

Tags should be short and retrieval-friendly, for example `payments`, `KYC`, `AML`, `data product`, `automation`, `merchant experience`, `Adyen`, or `APAC`.

## JSON Convention

Every entry can also have a JSON sidecar with the same basename, for example:

```text
knowledge_base/stories/payment_recovery.md
knowledge_base/stories/payment_recovery.json
```

Markdown is the human-readable source of the story. JSON is optional structured metadata for retrieval. Sidecar JSON augments the Markdown sections; standalone `.json` entries are also supported when the content is already structured.

Supported JSON fields:

```json
{
  "id": "payment_recovery",
  "title": "Payment Recovery",
  "context": "Use this for payment reliability conversations.",
  "coreFacts": ["Mapped failure states.", "Defined recovery ownership."],
  "interviewValue": "Shows product judgment around operational reliability.",
  "reusableAnswerPoints": ["Start with customer impact."],
  "relatedRoles": ["Payments Product Manager"],
  "tags": ["payments", "reliability"],
  "searchTerms": ["payment failure recovery", "merchant trust"],
  "resumeSignals": ["Reduced order-loss risk by about 30%."]
}
```

Snake-case aliases such as `core_facts`, `related_roles`, `search_terms`, and `resume_signals` are accepted too.
