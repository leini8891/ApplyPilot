insert into public.candidate_profiles (
  id,
  full_name,
  email,
  phone,
  location,
  years_experience,
  summary,
  work_experiences,
  skills,
  target_roles,
  industries,
  education
)
values (
  'demo-user',
  'Demo Candidate',
  'demo@example.com',
  '',
  'Remote',
  8,
  'Product lead with B2B SaaS, workflow automation, analytics, and growth experience.',
  '[{"company":"Demo SaaS Platform","title":"Product Lead","startDate":"2020-01","endDate":null,"summary":"Led onboarding, workflow automation, and reporting roadmap.","achievements":["Improved onboarding completion by 21%"]}]'::jsonb,
  '["Product strategy","Workflow automation","Analytics","Growth experiments"]'::jsonb,
  '["Product Manager","Product Lead"]'::jsonb,
  '["B2B SaaS","Analytics"]'::jsonb,
  '[]'::jsonb
)
on conflict (id) do nothing;
