# ApplyPilot Demo Flow

This demo shows the portfolio-ready loop:

```text
save job -> score role -> retrieve prep assets -> prepare checklist -> sync tracker record
```

It runs with the default local JSON store. No Supabase or OpenAI key is required.

## 1. Start the App

```bash
pnpm install
pnpm dev:web
```

Open:

```text
http://localhost:3000
```

## 2. Review the Knowledge Base

Open:

```text
http://localhost:3000/knowledge-base
```

The page reads entries from:

- `knowledge_base/interviews`
- `knowledge_base/stories`
- `knowledge_base/job_profiles`
- `knowledge_base/playbooks`
- `local_workspace/knowledge_base_private` when present

Public entries should be sanitized before committing. Private interview notes belong in `local_workspace/knowledge_base_private/`.
Saved app data is written to `local_workspace/applypilot-store.json`.

## 3. Save a Demo Role

Open Daily Picks:

```text
http://localhost:3000/picks
```

Use the manual job form, or post this safe demo role:

```bash
curl -X POST http://localhost:3000/api/jobs/save \
  -H 'Content-Type: application/json' \
  --data '{
    "source": "linkedin",
    "title": "Product Manager, Workflow Automation",
    "company": "Demo Workflow Co",
    "location": "Remote",
    "url": "https://example.com/jobs/demo-workflow-automation",
    "description": "Own workflow automation strategy for onboarding, analytics dashboards, growth experiments, reporting, customer activation, and cross-functional delivery.",
    "salaryText": "USD 140k - 170k",
    "employmentType": "Full-time",
    "easyApply": true
  }'
```

## 4. Check Daily Picks

Refresh:

```text
http://localhost:3000/picks
```

Expected result:

- the saved role appears in the shortlist
- match reasons mention workflow/product/skill/location signals
- `Prep assets` includes relevant resume evidence and story/playbook entries

## 5. Check Application Tracker

Open:

```text
http://localhost:3000/applications
```

Expected result:

- the saved role is synced into the tracker
- the initial status is `drafted`
- saving the same job again does not reset an existing tracker status

## 6. Prepare the Application Workflow

Open the application detail page from the tracker or Daily Picks:

```text
http://localhost:3000/applications/attempt_1
```

Expected result:

- the workflow checklist includes role fit, job context, resume evidence, story assets, watchouts, application channel, and tracker state
- matched resume proof points and knowledge-base stories appear under the checklist
- preparing the checklist stores workflow metadata and can move a drafted application to `queued`

## 7. Verify

```bash
pnpm test
pnpm build
pnpm lint
```

The stable workflow currently covers 22 tests, including knowledge-base Markdown/JSON parsing, private local knowledge reading, retrieval, workflow preparation, and tracker sync.
