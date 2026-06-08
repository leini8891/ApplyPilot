<div align="center">

# 🛫 ApplyPilot

**A LinkedIn-first job-application copilot — score, tailor, and semi-autonomously apply.**

Built for the Singapore market, where the off-the-shelf auto-apply tools are expensive and none are tuned for local boards.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#testing)

</div>

---

## Why this exists

Commercial auto-apply services are pricey and US-centric. None of them handle **LinkedIn _and_ MyCareersFuture** (Singapore's national jobs board) together, with local screening logic (work authorization, notice period, salary in SGD). ApplyPilot is a single-user, self-hosted copilot that does the tedious 80% — finding, scoring, tailoring, and form-filling — while keeping a human firmly in the loop for anything risky.

> **Honest status:** MVP. The scoring, resume-tailoring, dashboard, and review pipeline are solid and tested. The browser auto-fill layer works against current LinkedIn / MyCareersFuture DOM but, like every scraper, is in a permanent cat-and-mouse with their anti-automation defenses — treat it as *assisted* applying, not fire-and-forget.

## What it does

| Capability | How |
| --- | --- |
| **🎯 Match scoring** | Heuristic keyword/skill/region scoring with an optional LLM pass; every job gets a 0–100 fit score, hit/gap keywords, and an apply / review / skip recommendation. |
| **📝 Tailored resumes** | Per-job resume rewrite (LLM-assisted, with a deterministic fallback) rendered to a clean one-page PDF. |
| **🤖 Semi-auto apply** | Chrome MV3 extension drives the LinkedIn Easy Apply / MyCareersFuture flow inside *your own* authenticated session, filling contact fields, screening questions, and resume upload. |
| **🛟 Review routing** | VIP companies, non-Easy-Apply roles, and unanswerable knockout questions are pushed to a review queue instead of being submitted blindly. |
| **📊 Batch runs** | Set a target (1–50) and ApplyPilot works down the search-results list, scrolling and paginating, until the target is hit. |
| **🗂️ Pipeline tracking** | Dashboard records applications, receipts (screenshots), and interview notes. |

## Architecture

```
applypilot/  (pnpm monorepo)
├── apps/
│   ├── web/          Next.js dashboard + API routes (onboarding, scoring, runs, review, interviews)
│   └── extension/    Chrome MV3 extension (popup, service worker, LinkedIn + MyCareersFuture content scripts)
├── packages/
│   ├── domain/       Shared zod schemas, scoring + review-routing logic (framework-agnostic, unit-tested)
│   ├── ui/           Shared React primitives
│   └── config/       Environment validation
└── supabase/         SQL migrations and row-level-security policies
```

**Design choices worth noting**

- **Domain logic is isolated and pure** (`packages/domain`) — scoring and review-routing have zero framework deps and are the unit-tested core.
- **The extension never stores LinkedIn credentials** and only ever runs inside a session the user is already logged into.
- **Graceful degradation** — every AI call (profile parse, scoring, resume tailoring) has a deterministic fallback, so the app is fully usable with no OpenAI key.
- **Supabase-optional** — an in-memory store with seed data lets you run the whole thing locally with zero external services.

## Quick start

```bash
# 1. Prereqs: Node 22 + pnpm
pnpm install

# 2. Run the dashboard + API (works with zero config thanks to the in-memory demo store)
pnpm dev:web            # http://localhost:3000

# 3. Build the extension in watch mode, then load apps/extension/dist as an unpacked extension
pnpm dev:extension
```

For a real setup, copy `.env.example` → `.env.local`, fill in Supabase + OpenAI keys, and apply `supabase/migrations/0001_init.sql`.

## Batch apply

1. Open a LinkedIn **jobs search results** page (filtered to your roles + location).
2. Set **Run target** in the popup (1–50) and press **Start run**.
3. ApplyPilot walks the results list — selecting each job, completing Easy Apply, scrolling and paginating — until the target is reached.
4. VIP / non-Easy-Apply / risky roles are routed to review instead of auto-submitted. Counts update live.

## Testing

```bash
pnpm test        # unit tests (domain scoring, store, MyCareersFuture flow)
pnpm test:e2e    # Playwright fixtures
pnpm lint        # typecheck
```

## Tech stack

TypeScript · Next.js 15 · React 19 · Chrome Manifest V3 · Vite + CRXJS · Supabase (Postgres) · Zod · Vitest · Playwright · pnpm workspaces

## Roadmap

- [ ] Resilient selectors / self-healing against LinkedIn DOM drift
- [ ] MyCareersFuture batch parity
- [ ] Cover-letter generation (currently feature-flagged off)
- [ ] Multi-user mode with per-user Supabase RLS

---

<div align="center">
<sub>Built as a practical AI-product exercise: data ingestion → scoring → generation → guarded automation → human review.</sub>
</div>
