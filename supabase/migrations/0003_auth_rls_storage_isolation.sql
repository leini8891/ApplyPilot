grant usage on schema public to authenticated;

grant select, insert, update, delete on public.candidate_profiles to authenticated;
grant select, insert, update, delete on public.resume_versions to authenticated;
grant select, insert, update, delete on public.job_preferences to authenticated;
grant select, insert, update, delete on public.job_postings to authenticated;
grant select, insert, update, delete on public.match_scores to authenticated;
grant select, insert, update, delete on public.tailored_resumes to authenticated;
grant select, insert, update, delete on public.application_runs to authenticated;
grant select, insert, update, delete on public.application_attempts to authenticated;
grant select, insert, update, delete on public.review_queue_items to authenticated;
grant select, insert, update, delete on public.interview_records to authenticated;

alter table public.job_postings
  add column if not exists candidate_id text references public.candidate_profiles(id) on delete cascade;

create index if not exists idx_job_postings_candidate_id on public.job_postings(candidate_id);

alter table public.job_postings enable row level security;

drop policy if exists "candidate profiles are owner-readable" on public.candidate_profiles;
drop policy if exists "resume versions are owner-readable" on public.resume_versions;
drop policy if exists "job preferences are owner-readable" on public.job_preferences;
drop policy if exists "match scores are owner-readable" on public.match_scores;
drop policy if exists "tailored resumes are owner-readable" on public.tailored_resumes;
drop policy if exists "application runs are owner-readable" on public.application_runs;
drop policy if exists "application attempts follow owning run" on public.application_attempts;
drop policy if exists "review queue follows owning attempt" on public.review_queue_items;
drop policy if exists "interview records follow owning attempt" on public.interview_records;
drop policy if exists "job postings are visible to owner or public" on public.job_postings;
drop policy if exists "job postings are owner-insertable" on public.job_postings;
drop policy if exists "job postings are owner-updatable" on public.job_postings;
drop policy if exists "job postings are owner-deletable" on public.job_postings;

create policy "candidate profiles are owner-readable"
  on public.candidate_profiles
  for all
  to authenticated
  using ((select auth.uid()) is not null and id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and id = (select auth.uid())::text);

create policy "resume versions are owner-readable"
  on public.resume_versions
  for all
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "job preferences are owner-readable"
  on public.job_preferences
  for all
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "job postings are visible to owner or public"
  on public.job_postings
  for select
  to authenticated
  using (candidate_id is null or candidate_id = (select auth.uid())::text);

create policy "job postings are owner-insertable"
  on public.job_postings
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "job postings are owner-updatable"
  on public.job_postings
  for update
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "job postings are owner-deletable"
  on public.job_postings
  for delete
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "match scores are owner-readable"
  on public.match_scores
  for all
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "tailored resumes are owner-readable"
  on public.tailored_resumes
  for all
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "application runs are owner-readable"
  on public.application_runs
  for all
  to authenticated
  using ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text)
  with check ((select auth.uid()) is not null and candidate_id = (select auth.uid())::text);

create policy "application attempts follow owning run"
  on public.application_attempts
  for all
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.application_runs runs
      where runs.id = run_id
        and runs.candidate_id = (select auth.uid())::text
    )
  )
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.application_runs runs
      where runs.id = run_id
        and runs.candidate_id = (select auth.uid())::text
    )
  );

create policy "review queue follows owning attempt"
  on public.review_queue_items
  for all
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = (select auth.uid())::text
    )
  )
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = (select auth.uid())::text
    )
  );

create policy "interview records follow owning attempt"
  on public.interview_records
  for all
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = (select auth.uid())::text
    )
  )
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.application_attempts attempts
      join public.application_runs runs on runs.id = attempts.run_id
      where attempts.id = application_id
        and runs.candidate_id = (select auth.uid())::text
    )
  );

update storage.buckets
set public = false
where id = 'applypilot-assets';

drop policy if exists "applypilot users can read own assets" on storage.objects;
drop policy if exists "applypilot users can upload own assets" on storage.objects;
drop policy if exists "applypilot users can update own assets" on storage.objects;
drop policy if exists "applypilot users can delete own assets" on storage.objects;

create policy "applypilot users can read own assets"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'applypilot-assets'
    and (storage.foldername(name))[1] in ('resumes', 'tailored-resumes', 'receipts')
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "applypilot users can upload own assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'applypilot-assets'
    and (storage.foldername(name))[1] in ('resumes', 'tailored-resumes', 'receipts')
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "applypilot users can update own assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'applypilot-assets'
    and (storage.foldername(name))[1] in ('resumes', 'tailored-resumes', 'receipts')
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'applypilot-assets'
    and (storage.foldername(name))[1] in ('resumes', 'tailored-resumes', 'receipts')
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "applypilot users can delete own assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'applypilot-assets'
    and (storage.foldername(name))[1] in ('resumes', 'tailored-resumes', 'receipts')
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
