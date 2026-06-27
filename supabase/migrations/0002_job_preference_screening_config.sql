alter table public.job_preferences
  add column if not exists target_roles jsonb not null default '[]'::jsonb,
  add column if not exists application_salary_amount integer not null default 0,
  add column if not exists years_experience_override integer,
  add column if not exists notice_period_weeks integer,
  add column if not exists work_authorization text not null default 'unknown',
  add column if not exists requires_visa_sponsorship text not null default 'unknown',
  add column if not exists willing_to_relocate text not null default 'unknown';

alter table public.job_preferences
  alter column salary_currency set default 'USD';
