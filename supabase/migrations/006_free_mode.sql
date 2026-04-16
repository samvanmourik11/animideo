-- Add mode column to distinguish wizard projects from free-upload projects
alter table public.projects
  add column if not exists mode text not null default 'wizard'
    check (mode in ('wizard', 'free'));
