-- Synthetic staging seed data for Teazy AI.
-- No real student data. Safe to re-run.
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v seed_password="$SEED_PASSWORD" \
--     -f src/db/seed/staging-demo.sql

\set ON_ERROR_STOP on

\if :{?seed_password}
\else
  \echo 'ERROR: pass the synthetic demo password with -v seed_password=...'
  \quit
\endif

begin;

-- Storage buckets used by the legacy web app.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('workspace-files', 'workspace-files', false, 52428800),
  ('lesson-videos', 'lesson-videos', false, 209715200),
  ('assessment-uploads', 'assessment-uploads', false, 20971520)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Synthetic auth users. Password comes from SEED_PASSWORD, never the repo.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'admin@staging.teazy.test',
   extensions.crypt(:'seed_password', extensions.gen_salt('bf')),
   now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Staging Admin","country":"NG"}'::jsonb,
   now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'free@staging.teazy.test',
   extensions.crypt(:'seed_password', extensions.gen_salt('bf')),
   now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Free Teacher","country":"NG"}'::jsonb,
   now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'standard@staging.teazy.test',
   extensions.crypt(:'seed_password', extensions.gen_salt('bf')),
   now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Standard Teacher","country":"GH"}'::jsonb,
   now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'pro@staging.teazy.test',
   extensions.crypt(:'seed_password', extensions.gen_salt('bf')),
   now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Pro Teacher","country":"KE"}'::jsonb,
   now(), now(), false, false)
on conflict (id) do update
  set email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = now();

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('admin@staging.teazy.test', '11111111-1111-4111-8111-111111111111',
   jsonb_build_object('sub','11111111-1111-4111-8111-111111111111','email','admin@staging.teazy.test','email_verified',true,'phone_verified',false,'provider','email'),
   'email', now(), now(), now()),
  ('free@staging.teazy.test', '22222222-2222-4222-8222-222222222222',
   jsonb_build_object('sub','22222222-2222-4222-8222-222222222222','email','free@staging.teazy.test','email_verified',true,'phone_verified',false,'provider','email'),
   'email', now(), now(), now()),
  ('standard@staging.teazy.test', '33333333-3333-4333-8333-333333333333',
   jsonb_build_object('sub','33333333-3333-4333-8333-333333333333','email','standard@staging.teazy.test','email_verified',true,'phone_verified',false,'provider','email'),
   'email', now(), now(), now()),
  ('pro@staging.teazy.test', '44444444-4444-4444-8444-444444444444',
   jsonb_build_object('sub','44444444-4444-4444-8444-444444444444','email','pro@staging.teazy.test','email_verified',true,'phone_verified',false,'provider','email'),
   'email', now(), now(), now())
on conflict (provider_id, provider) do update
  set identity_data = excluded.identity_data,
      user_id = excluded.user_id,
      updated_at = now();

insert into public.profiles (id, display_name, country, full_name, phone)
values
  ('11111111-1111-4111-8111-111111111111', 'Staging Admin', 'NG', 'Staging Admin', '+2348000000001'),
  ('22222222-2222-4222-8222-222222222222', 'Free Teacher', 'NG', 'Free Teacher', '+2348000000002'),
  ('33333333-3333-4333-8333-333333333333', 'Standard Teacher', 'GH', 'Standard Teacher', '+233200000003'),
  ('44444444-4444-4444-8444-444444444444', 'Pro Teacher', 'KE', 'Pro Teacher', '+254700000004')
on conflict (id) do update
  set display_name = excluded.display_name,
      country = excluded.country,
      full_name = excluded.full_name,
      phone = excluded.phone,
      updated_at = now();

insert into public.user_roles (user_id, role)
values
  ('11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'user'),
  ('33333333-3333-4333-8333-333333333333', 'user'),
  ('44444444-4444-4444-8444-444444444444', 'user')
on conflict (user_id, role) do nothing;

insert into public.subscriptions (user_id, status, plan, current_period_end)
values
  ('11111111-1111-4111-8111-111111111111', 'active', 'pro_monthly', now() + interval '30 days'),
  ('22222222-2222-4222-8222-222222222222', 'expired', 'pro_monthly', now() - interval '10 days'),
  ('33333333-3333-4333-8333-333333333333', 'active', 'standard', now() + interval '20 days'),
  ('44444444-4444-4444-8444-444444444444', 'active', 'pro_monthly', now() + interval '15 days')
on conflict (user_id) do update
  set status = excluded.status,
      plan = excluded.plan,
      current_period_end = excluded.current_period_end,
      updated_at = now();

insert into public.assessment_credits (user_id, remaining)
values
  ('11111111-1111-4111-8111-111111111111', 100),
  ('22222222-2222-4222-8222-222222222222', 0),
  ('33333333-3333-4333-8333-333333333333', 8),
  ('44444444-4444-4444-8444-444444444444', 40)
on conflict (user_id) do update set remaining = excluded.remaining, updated_at = now();

insert into public.video_credits (user_id, remaining)
values
  ('11111111-1111-4111-8111-111111111111', 10),
  ('33333333-3333-4333-8333-333333333333', 2),
  ('44444444-4444-4444-8444-444444444444', 5)
on conflict (user_id) do update set remaining = excluded.remaining, updated_at = now();

insert into public.usage_counters (user_id, kind, count)
values ('22222222-2222-4222-8222-222222222222', 'free_assessment', 1)
on conflict (user_id, kind) do update set count = excluded.count, updated_at = now();

insert into public.monthly_feature_usage (user_id, kind, period_start, count)
values
  ('22222222-2222-4222-8222-222222222222', 'lesson', date_trunc('month', now())::date, 3),
  ('22222222-2222-4222-8222-222222222222', 'quiz', date_trunc('month', now())::date, 2),
  ('22222222-2222-4222-8222-222222222222', 'writing', date_trunc('month', now())::date, 1),
  ('33333333-3333-4333-8333-333333333333', 'lesson', date_trunc('month', now())::date, 5),
  ('33333333-3333-4333-8333-333333333333', 'quiz', date_trunc('month', now())::date, 3),
  ('33333333-3333-4333-8333-333333333333', 'worksheet', date_trunc('month', now())::date, 1),
  ('33333333-3333-4333-8333-333333333333', 'slides', date_trunc('month', now())::date, 1),
  ('44444444-4444-4444-8444-444444444444', 'lesson', date_trunc('month', now())::date, 2),
  ('44444444-4444-4444-8444-444444444444', 'quiz', date_trunc('month', now())::date, 1)
on conflict (user_id, kind, period_start) do update set count = excluded.count, updated_at = now();

insert into public.monthly_assessment_usage (user_id, period_start, uploads_used)
values
  ('11111111-1111-4111-8111-111111111111', date_trunc('month', now())::date, 12),
  ('33333333-3333-4333-8333-333333333333', date_trunc('month', now())::date, 7),
  ('44444444-4444-4444-8444-444444444444', (now() - interval '15 days')::date, 9)
on conflict (user_id, period_start) do update set uploads_used = excluded.uploads_used, updated_at = now();

insert into public.feature_flags (user_id, flag, enabled)
values
  ('33333333-3333-4333-8333-333333333333', 'assessment_batches', true),
  ('44444444-4444-4444-8444-444444444444', 'assessment_batches', true),
  ('44444444-4444-4444-8444-444444444444', 'video_generation', true),
  ('22222222-2222-4222-8222-222222222222', 'assessment_batches', false)
on conflict (user_id, flag) do update set enabled = excluded.enabled;

insert into public.promo_codes (id, code, kind, value, currency, applies_to, max_uses, used_count, expires_at, active, notes)
values
  ('a5000000-0000-4000-8000-000000000001', 'STAGING10', 'percent_off', 10, null,
   array['sub_standard','sub_pro','assessment_pack_5','assessment_pack_10','assessment_pack_30'],
   100, 0, now() + interval '90 days', true, 'Synthetic staging promo'),
  ('a5000000-0000-4000-8000-000000000002', 'WELCOME5', 'bonus_assessments', 5, null,
   array['assessment_pack_5','assessment_pack_10','assessment_pack_30'],
   100, 0, now() + interval '90 days', true, 'Synthetic staging bonus'),
  ('a5000000-0000-4000-8000-000000000003', 'FREEPRO30', 'pro_days', 30, null,
   array['sub_pro','sub_standard'],
   50, 0, now() + interval '90 days', true, 'Synthetic staging trial')
on conflict (code) do update
  set kind = excluded.kind,
      value = excluded.value,
      applies_to = excluded.applies_to,
      max_uses = excluded.max_uses,
      expires_at = excluded.expires_at,
      active = excluded.active,
      notes = excluded.notes,
      updated_at = now();

insert into public.saved_marking_schemes (id, user_id, name, subject, question_paper, marking_scheme)
values
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'JSS 1 Basic Science Mock', 'Basic Science',
   'Answer all questions. Section A is multiple choice; Section B is short answer.',
   'Section A: 1 mark each. Section B: award 2 marks for a correct definition, 1 for a relevant example.'),
  ('b0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'SHS 2 Algebra Test', 'Mathematics',
   'Solve all questions. Show all working.',
   'Award method marks for a correct first step even when the final answer is wrong.'),
  ('b0000000-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444',
   'Grade 8 English Comprehension', 'English',
   'Read the passage and answer the questions that follow.',
   '1 mark per accurate point; 2 marks for a supported inference.')
on conflict (id) do nothing;

insert into public.assessment_folders (id, user_id, name)
values ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'JSS 1 Assessments')
on conflict (id) do nothing;

insert into public.assessment_batches (
  id, user_id, name, curriculum, subject, class_level, assessment_type, marking_style,
  language, question_paper, marking_scheme, script_count, status, folder_id,
  total_marks, scheme_name, instructions
)
values (
  'a1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
  'JSS 1 Basic Science · Mid-term', 'Nigeria (NERDC)', 'Basic Science', 'JSS 1',
  'Mid-term test', 'standard', 'English',
  '1. Define photosynthesis. 2. Name two products of photosynthesis.',
  'Award 5 marks for each correct definition and 5 marks for each valid product.',
  3, 'pending', 'a0000000-0000-4000-8000-000000000001', 30, 'JSS 1 Basic Science Mock',
  'Mark neatly and flag any unreadable script.'
)
on conflict (id) do nothing;

insert into public.assessment_batch_items (
  id, batch_id, user_id, student_name, source_file, ocr_text, result_json,
  awarded, max_score, percent, grade, confidence, status
)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'Ada Sample', 'ada-sample.pdf',
   'Photosynthesis is how plants make food using sunlight.',
   '{"perQuestion":[{"number":"1","awarded":4,"max":5,"feedback":"Clear definition; add chlorophyll."},{"number":"2","awarded":5,"max":5,"feedback":"Correct products."}]}'::jsonb,
   9, 10, 90, 'A', 0.94, 'done'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'Bola Sample', 'bola-sample.pdf',
   'Plants use sunlight to make food.',
   '{"perQuestion":[{"number":"1","awarded":3,"max":5,"feedback":"Definition is incomplete."},{"number":"2","awarded":4,"max":5,"feedback":"One product missing."}]}'::jsonb,
   7, 10, 70, 'B', 0.81, 'needs_review'),
  ('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'Chidi Sample', 'chidi-sample.pdf',
   null, null, null, null, null, null, null, 'failed')
on conflict (id) do nothing;

update public.assessment_batch_items
set error = 'Synthetic unreadable upload for staging UI testing.'
where id = 'a2000000-0000-4000-8000-000000000003';

insert into public.saved_lessons (id, user_id, title, curriculum, subject, class_level, topic, language, content, created_at)
values
  ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'Photosynthesis', 'Nigeria (NERDC)', 'Basic Science', 'JSS 1', 'Photosynthesis', 'English',
   $lesson$# Photosynthesis

**Class:** JSS 1  
**Subject:** Basic Science  
**Curriculum:** Nigeria (NERDC)

## Learning objectives
By the end of the lesson, learners should be able to:
1. Define photosynthesis.
2. State the raw materials and products of photosynthesis.
3. Explain why photosynthesis is important to life on Earth.

## Introduction
Plants make their own food. The process they use is called photosynthesis. It happens mainly in the leaves.

## Content
Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose and oxygen. Chlorophyll traps light energy.

### Word equation
carbon dioxide + water → glucose + oxygen

## Class activity
Name two things a plant needs for photosynthesis.

## Summary
Photosynthesis feeds plants and supplies oxygen to other living things.$lesson$, now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'Fractions: Equivalent Fractions', 'Nigeria (NERDC)', 'Mathematics', 'JSS 1', 'Equivalent fractions', 'English',
   $lesson$# Equivalent Fractions

## Learning objectives
Learners should be able to identify and generate equivalent fractions.

## Content
Equivalent fractions name the same amount. Multiply or divide the numerator and denominator by the same non-zero number.

Example: 1/2 = 2/4 = 3/6 = 4/8.

## Class activity
Complete the pattern: 1/3, 2/6, 3/9, __/12.

## Summary
Equivalent fractions look different but have the same value.$lesson$, now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333',
   'Algebra: Solving Linear Equations', 'Ghana (NaCCA)', 'Mathematics', 'SHS 1', 'Linear equations', 'English',
   $lesson$# Solving Linear Equations

## Learning objectives
Solve one-variable linear equations using inverse operations.

## Worked example
2x + 5 = 17  
2x = 12  
x = 6

## Class activity
Solve 3x - 4 = 11.

## Summary
Keep the equation balanced by doing the same operation to both sides.$lesson$, now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444',
   'The Water Cycle', 'Kenya (CBC)', 'Science', 'Grade 8', 'Water cycle', 'English',
   $lesson$# The Water Cycle

## Learning objectives
Describe evaporation, condensation, precipitation and collection.

## Content
The Sun heats water, causing evaporation. Water vapour rises, cools and condenses into clouds. Precipitation returns water to the ground.

## Class activity
Draw and label the water cycle.

## Summary
Water moves through the environment in a continuous cycle.$lesson$, now() - interval '5 hours')
on conflict (id) do nothing;

insert into public.saved_quizzes (id, user_id, title, curriculum, subject, class_level, topic, language, quiz)
values
  ('d0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'Quiz · Photosynthesis', 'Nigeria (NERDC)', 'Basic Science', 'JSS 1', 'Photosynthesis', 'English',
   $quiz${"multipleChoice":[{"question":"What gas do plants take in during photosynthesis?","options":{"A":"Oxygen","B":"Carbon dioxide","C":"Nitrogen","D":"Hydrogen"},"answer":"B"},{"question":"Which substance traps light energy?","options":{"A":"Chlorophyll","B":"Glucose","C":"Water","D":"Oxygen"},"answer":"A"}],"shortAnswer":[{"question":"Name one product of photosynthesis.","answer":"Glucose (or oxygen)"}]}$quiz$::jsonb),
  ('d0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'Quiz · Linear Equations', 'Ghana (NaCCA)', 'Mathematics', 'SHS 1', 'Linear equations', 'English',
   $quiz${"multipleChoice":[{"question":"Solve 2x + 5 = 17.","options":{"A":"x = 4","B":"x = 6","C":"x = 8","D":"x = 11"},"answer":"B"}],"shortAnswer":[{"question":"Solve 3x - 4 = 11.","answer":"x = 5"}]}$quiz$::jsonb),
  ('d0000000-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444',
   'Quiz · The Water Cycle', 'Kenya (CBC)', 'Science', 'Grade 8', 'Water cycle', 'English',
   $quiz${"multipleChoice":[{"question":"What is the change from water vapour to liquid water called?","options":{"A":"Evaporation","B":"Condensation","C":"Precipitation","D":"Collection"},"answer":"B"}],"shortAnswer":[{"question":"Name two stages of the water cycle.","answer":"Any two of evaporation, condensation, precipitation, collection."}]}$quiz$::jsonb)
on conflict (id) do nothing;

insert into public.saved_assessments (
  id, user_id, title, curriculum, subject, class_level, assessment_type, student_name,
  awarded, max_score, percent, grade, result, script_text
)
values
  ('e0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'Basic Science · Mid-term sample', 'Nigeria (NERDC)', 'Basic Science', 'JSS 1',
   'Mid-term test', 'Ada Sample', 23, 30, 76.67, 'A',
   $result${"overallScore":23,"maxScore":30,"percentage":76.67,"grade":"A","confidence":0.93,"manualReviewRecommended":false,"summary":"A strong response with clear definitions and relevant examples.","perQuestion":[{"number":"1","questionText":"Define photosynthesis.","studentAnswer":"Plants use sunlight to make food.","awarded":8,"max":10,"feedback":"Accurate definition; include chlorophyll and carbon dioxide."},{"number":"2","studentAnswer":"Oxygen and glucose.","awarded":9,"max":10,"feedback":"Both products stated."},{"number":"3","studentAnswer":"Plants release oxygen.","awarded":6,"max":10,"feedback":"Add that oxygen supports respiration."}],"strengths":["Clear scientific vocabulary","Correct use of examples"],"improvements":["Include all raw materials","Write fuller explanations"],"commonErrors":["Omitting chlorophyll"],"suggestedIntervention":"Revise the word equation with a labelled diagram.","suggestedHomework":"Draw and label the photosynthesis process.","curriculumObjectives":["Define photosynthesis","State the products of photosynthesis"],"teacherComment":"Good work. Add the word equation next time.","meta":{"curriculum":"Nigeria (NERDC)","subject":"Basic Science","classLevel":"JSS 1","assessmentType":"Mid-term test","markingStyle":"standard"}}$result$::jsonb,
   'Photosynthesis is the process by which plants make food using sunlight, water and carbon dioxide. The products are glucose and oxygen.'),
  ('e0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444',
   'Science · Water Cycle sample', 'Kenya (CBC)', 'Science', 'Grade 8',
   'Class assessment', 'Bola Sample', 17, 20, 85, 'A',
   $result${"overallScore":17,"maxScore":20,"percentage":85,"grade":"A","confidence":0.95,"manualReviewRecommended":false,"summary":"Confident understanding of the water cycle.","perQuestion":[{"number":"1","studentAnswer":"Evaporation, condensation, precipitation and collection.","awarded":8,"max":10,"feedback":"All stages named; add a short description."},{"number":"2","studentAnswer":"The Sun provides energy.","awarded":9,"max":10,"feedback":"Correct and concise."}],"strengths":["Accurate sequence","Good use of scientific terms"],"improvements":["Add explanations for each stage"],"commonErrors":[],"suggestedIntervention":"Use a diagram to connect each stage.","suggestedHomework":"Label a water-cycle diagram.","curriculumObjectives":["Describe the stages of the water cycle"],"teacherComment":"Very good. Explain each stage in one sentence.","meta":{"curriculum":"Kenya (CBC)","subject":"Science","classLevel":"Grade 8","assessmentType":"Class assessment","markingStyle":"standard"}}$result$::jsonb,
   'Water evaporates, condenses into clouds, falls as precipitation and collects in rivers and lakes.')
on conflict (id) do nothing;

insert into public.saved_resources (id, user_id, kind, title, content, metadata)
values
  ('f0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'worksheet', 'Photosynthesis worksheet',
   '1. Define photosynthesis.\n2. List the raw materials.\n3. Name the products.',
   '{"curriculum":"Nigeria (NERDC)","subject":"Basic Science","seed":true}'::jsonb),
  ('f0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
   'slide_deck', 'Linear equations slides',
   'Slide 1: What is an equation?\nSlide 2: Inverse operations\nSlide 3: Worked example',
   '{"curriculum":"Ghana (NaCCA)","subject":"Mathematics","seed":true}'::jsonb),
  ('f0000000-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444',
   'lesson_plan', 'Water cycle lesson plan',
   'Starter: brainstorm water sources.\nMain: diagram and stages.\nPlenary: exit ticket.',
   '{"curriculum":"Kenya (CBC)","subject":"Science","seed":true}'::jsonb)
on conflict (id) do nothing;

insert into public.cached_lessons (id, curriculum, subject, class_level, topic_normalized, language, content, hit_count)
values
  ('c1000000-0000-4000-8000-000000000001', 'Nigeria (NERDC)', 'Basic Science', 'JSS 1',
   'photosynthesis', 'English', 'Cached synthetic lesson note for staging only.', 2)
on conflict (id) do nothing;

insert into public.cached_quizzes (id, lesson_hash, language, quiz, hit_count)
values
  ('d1000000-0000-4000-8000-000000000001', 'seed-lesson-hash', 'English',
   $quiz${"multipleChoice":[{"question":"What is photosynthesis?","options":{"A":"Making food using sunlight","B":"Breathing","C":"Digestion","D":"Evaporation"},"answer":"A"}],"shortAnswer":[]}$quiz$::jsonb,
   1)
on conflict (id) do nothing;

insert into public.payments (id, user_id, paystack_reference, amount_minor, currency, purpose, status, metadata)
values
  ('a3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333',
   'staging_seed_standard', 100000, 'NGN', 'sub_standard', 'success', '{"seed":true}'::jsonb),
  ('a3000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444',
   'staging_seed_pro', 200000, 'NGN', 'sub_pro', 'success', '{"seed":true}'::jsonb)
on conflict (paystack_reference) do nothing;

insert into public.entitlements (id, user_id, lesson_hash, kind)
values ('a4000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'demo-lesson-hash', 'download_pdf')
on conflict (user_id, lesson_hash, kind) do nothing;

commit;
