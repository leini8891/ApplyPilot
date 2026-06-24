# ApplyPilot Demo Flow

This demo shows the portfolio-ready V0 loop:

```text
save job -> score role -> retrieve prep assets -> sync tracker record
```

It runs with the default in-memory store. No Supabase or OpenAI key is required.

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
    "title": "Senior Product Manager, Payments Platform",
    "company": "CheckoutCo",
    "location": "Singapore",
    "url": "https://example.com/jobs/checkoutco-payments-platform",
    "description": "Own payment platform strategy for checkout, KYC, AML, compliance dashboards, data insights, growth experiments, merchant onboarding, and cross-functional delivery.",
    "salaryText": "SGD 160k - 190k",
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
- match reasons mention payments/product/skill/location signals
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

## 6. Verify

```bash
pnpm test
pnpm build
pnpm lint
```

The stable V0 currently covers 20 tests, including knowledge-base Markdown/JSON parsing, private local knowledge reading, retrieval, and tracker sync.
