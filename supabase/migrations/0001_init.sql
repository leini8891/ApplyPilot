create extension if not exists pgcrypto;

create table if not exists public.candidate_profiles (
  id text primary key,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  location text not null default '',
  years_experience integer not null default 0,
  summary text not null default '',
  work_experiences jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  target_roles jsonb not null default '[]'::jsonb,
  industries jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  last_parsed_at timestamptz
);

create table if not exists public.resume_versions (
  id text primary key,
  candidate_id text not null references public.candidate_profiles(id) on delete cascade,
  label text not null,
  source_file_name text not null,
  source_file_type text not null,
  text_content text not null default '',
  storage_path text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  parsed_profile_id text references public.candidate_profiles(id)
);

create table if not exists public.job_preferences (
  candidate_id text primary key references public.candidate_profiles(id) on delete cascade,
  keywords jsonb not null default '[]'::jsonb,
  industries jsonb not null default '[]'::jsonb,
  regions jsonb not null default '[]'::jsonb,
  min_salary integer not null default 0,
  salary_currency text not null default 'SGD',
  daily_target integer not null default 25,
  vip_companies jsonb not null default '[]'::jsonb,
  remote_policy text not null default 'any',
  easy_apply_only boolean not null default true
);

create table if not exists public.job_postings (
  id text primary key,
  source text not null,
  external_job_id text not null,
  title text not null,
  company text not null,
  location text not null default '',
  salary_text text,
  employment_type text,
  url text not null,
  description text not null default '',
  easy_apply boolean not null default false,
  detected_questions jsonb not null default '[]'::jsonb,
  scraped_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.match_scores (
  id text primary key,
  candidate_id text not null references public.candidate_profiles(id) on delete cascade,
  job_posting_id text not null references public.job_postings(id) on delete cascade,
  overall integer not null,
  keyword_hits jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  recommended_action text not null,
  generated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.tailored_resumes (
  id text primary key,
  candidate_id text not null references public.candidate_profiles(id) on delete cascade,
  job_posting_id text not null references public.job_postings(id) on delete cascade,
  base_resume_id text not null references public.resume_versions(id) on delete cascade,
  title text not null,
  markdown_content text not null default '',
  pdf_storage_path text,
  download_url text,
  generated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.application_runs (
  id text primary key,
  candidate_id text not null references public.candidate_profiles(id) on delete cascade,
  source text not null,
  target_count integer not null default 0,
  processed_count integer not null default 0,
  successful_count integer not null default 0,
  failed_count integer not null default 0,
  paused_count integer not null default 0,
  status text not null default 'idle',
  started_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  notes text not null default ''
);

create table if not exists public.application_attempts (
  id text primary key,
  run_id text not null references public.application_runs(id) on delete cascade,
  job_posting_id text not null references public.job_postings(id) on delete cascade,
  tailored_resume_id text references public.tailored_resumes(id) on delete set null,
  status text not null default 'queued',
  review_reason text,
  receipt_path text,
  receipt_url text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.review_queue_items (
  id text primary key,
  application_id text not null references public.application_attempts(id) on delete cascade,
  reason text not null,
  company text not null,
  title text not null,
  priority text not null default 'medium',
  created_at timestamptz not null default timezone('utc'::text, now()),
  resolved_at timestamptz,
  resolution_notes text
);

create table if not exists public.interview_records (
  id text primary key,
  application_id text not null references public.application_attempts(id) on delete cascade,
  scheduled_at timestamptz,
  interviewer_names jsonb not null default '[]'::jsonb,
  stage text not null,
  notes text not null default '',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_resume_versions_candidate_id on public.resume_versions(candidate_id);
create index if not exists idx_match_scores_candidate_id on public.match_scores(candidate_id);
create index if not exists idx_tailored_resumes_candidate_id on public.tailored_resumes(candidate_id);
create index if not exists idx_application_runs_candidate_id on public.application_runs(candidate_id);
create index if not exists idx_application_attempts_run_id on public.application_attempts(run_id);
create index if not exists idx_review_queue_items_application_id on public.review_queue_items(application_id);
create index if not exists idx_interview_records_application_id on public.interview_records(application_id);

alter table public.candidate_profiles enable row level security;
alter table public.resume_versions enable row level security;
alter table public.job_preferences enable row level security;
alter table public.match_scores enable row level security;
alter table public.tailored_resumes enable row level security;
alter table public.application_runs enable row level security;
alter table public.application_attempts enable row level security;
alter table public.review_queue_items enable row level security;
alter table public.interview_records enable row level security;

create policy "candidate profiles are owner-readable"
  on public.candidate_profiles
  for all
  using (id = auth.uid()::text)
  with check (id = auth.uid()::text);

create policy "resume versions are owner-readable"
  on public.resume_versions
  for all
  using (candidate_id = auth.uid()::text)
  with check (candidate_id = auth.uid()::text);

create policy "job preferences are owner-readable"
  on public.job_preferences
  for all
  using (candidate_id = auth.uid()::text)
  with check (candidate_id = auth.uid()::text);

create policy "match scores are owner-readable"
  on public.match_scores
  for all
  using (candidate_id = auth.uid()::text)
  with check (candidate_id = auth.uid()::text);

create policy "tailored resumes are owner-readable"
  on public.tailored_resumes
  for all
  using (candidate_id = auth.uid()::text)
  with check (candidate_id = auth.uid()::text);

create policy "application runs are owner-readable"
  on public.application_runs
  for all
  using (candidate_id = auth.uid()::text)
  with check (candidate_id = auth.uid()::text);

create policy "application attempts follow owning run"
  on public.application_attempts
  for all
  using (
    exists (
      select 1
      from public.application_runs runs
      where runs.id = run_id
        and runs.candidate_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.application_runs runs
      where runs.id = run_id
        and runs.candidate_id = auth.uid()::text
    )
  );

create policy "review queue follows owning attempt"
  on public.review_queue_items
  for all
  using (
    exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = auth.uid()::text
    )
  );

create policy "interview records follow owning attempt"
  on public.interview_records
  for all
  using (
    exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = auth.uid()::text
    )
  );

insert into storage.buckets (id, name, public)
values ('applypilot-assets', 'applypilot-assets', true)
on conflict (id) do nothing;

