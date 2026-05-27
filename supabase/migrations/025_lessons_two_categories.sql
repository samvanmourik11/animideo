-- 025_lessons_two_categories.sql
-- Merge 'aan-de-slag' + 'pro-tools' tot één 'tools' categorie.

alter table public.lessons drop constraint if exists lessons_category_check;

update public.lessons set category = 'tools' where category in ('aan-de-slag', 'pro-tools');

-- Logische volgorde binnen tools:
-- AI Wizard 10, Text to Video 20, Upload 30, Creator Studio 40, Playground 50
update public.lessons set sort_order = 40 where slug = 'creator-studio';
update public.lessons set sort_order = 50 where slug = 'playground';

alter table public.lessons
  add constraint lessons_category_check
  check (category in ('brand-setup', 'tools'));
