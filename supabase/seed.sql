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
  'Elena Tan',
  'elena@example.com',
  '+65 8888 8888',
  'Singapore',
  12,
  'Senior product leader with deep fintech and Web3 operating experience across APAC.',
  '[{"company":"FinStride","title":"Senior Product Manager","startDate":"2020-01","endDate":null,"summary":"Led KYC, onboarding, and payments roadmap.","achievements":["Improved KYC completion by 21%"]}]'::jsonb,
  '["Product strategy","Payments","KYC","Growth experiments"]'::jsonb,
  '["Senior Product Manager","Lead Product Manager"]'::jsonb,
  '["Fintech","Web3","SaaS"]'::jsonb,
  '[]'::jsonb
)
on conflict (id) do nothing;

