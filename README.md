# ApplyPilot

ApplyPilot is a LinkedIn-first job application copilot built as a `pnpm` monorepo. This MVP includes:

- A Next.js dashboard and API surface for onboarding, resume management, matching, review queues, applications, and interview notes
- A Chrome Manifest V3 extension for LinkedIn Easy Apply guidance and controlled front-of-screen automation
- Shared domain schemas, UI primitives, environment validation, tests, and Supabase schema

## Workspace

- `apps/web`: Next.js dashboard and API routes
- `apps/extension`: Chrome extension (popup, service worker, LinkedIn content script)
- `packages/domain`: shared schemas, helpers, scoring and review logic
- `packages/ui`: shared React UI primitives
- `packages/config`: environment validation helpers
- `supabase`: SQL migrations and policies
- `tests`: end-to-end fixtures and smoke coverage

## Quick Start

1. Install Node.js 22 and `pnpm`.
2. Copy `.env.example` to `.env.local` and fill in Supabase and OpenAI credentials.
3. Run `pnpm install`.
4. Apply the SQL in `supabase/migrations/0001_init.sql`, then optionally load `supabase/seed.sql`.
5. Run `pnpm dev:web` to start the dashboard.
6. Run `pnpm dev:extension` to build the Chrome extension in watch mode, then load `apps/extension/dist` as an unpacked extension.

## MVP Safety Boundaries

- ApplyPilot operates only inside a user-controlled, already-authenticated LinkedIn session.
- Unknown knockout questions, non-Easy Apply jobs, VIP companies, and risk signals are routed to review.
- The extension never stores LinkedIn credentials.
- Cover letter generation is feature-flagged out of the first release.

## Batch Apply

- Open a LinkedIn jobs **search results** page (e.g. filtered to your target roles and Singapore).
- Set **Run target** in the popup to the number of applications you want this run (1–50).
- Press **Start run**. ApplyPilot walks down the results list, selecting each job, completing the
  Easy Apply flow, and continuing to the next until the target is reached or the list is exhausted
  (it scrolls to load more and advances to the next results page automatically).
- VIP companies, non-Easy-Apply roles, and jobs with risky/unanswerable questions are routed to the
  review queue instead of being auto-submitted. Submitted and review counts update live in the popup.
- A run target of `1`, or starting from a single job detail page, applies only to the selected job.

## Manual Acceptance

- Upload a PDF or DOCX resume and inspect parsed profile output.
- Save job preferences and VIP companies.
- Start a single-job LinkedIn run and verify review routing for unsupported jobs.
- Start a batch run (target > 1) on a search results page and confirm it applies to multiple jobs
  in sequence and stops at the target.
- Confirm dashboard records applications, receipts, and interview notes.

## Commands

- `pnpm dev:web`: run the dashboard and API locally on `http://localhost:3000`
- `pnpm dev:extension`: watch-build the Chrome extension
- `pnpm test`: run unit tests
- `pnpm test:e2e`: run Playwright fixture coverage

## Deployment Notes

- Deploy `apps/web` to Vercel or another Node-compatible host with the same environment variables.
- Point `VITE_DASHBOARD_URL` and `VITE_API_BASE_URL` at the deployed web app before building the extension.
- Keep Supabase storage bucket `applypilot-assets` public if you want extension upload flows to fetch tailored resume PDFs directly.

## Monitoring Suggestions

- Track API route failures for `/api/jobs/score`, `/api/runs/start`, and `/api/applications/:id/receipt`.
- Alert on repeated review routing spikes because they usually indicate LinkedIn DOM drift.
- Watch Supabase storage growth for `receipts/` and `tailored-resumes/`.
