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
  '+65 0000 0000',
  'Singapore',
  12,
  'Senior product leader with fintech, payments, data product, and automation experience across APAC.',
  '[{"company":"Demo Fintech App","title":"Senior Product Manager","startDate":"2020-01","endDate":null,"summary":"Led KYC, onboarding, and payments roadmap.","achievements":["Improved KYC completion by 21%"]}]'::jsonb,
  '["Product strategy","Payments","KYC","Growth experiments"]'::jsonb,
  '["Senior Product Manager","Lead Product Manager"]'::jsonb,
  '["Fintech","Payments","SaaS"]'::jsonb,
  '[]'::jsonb
)
on conflict (id) do nothing;
