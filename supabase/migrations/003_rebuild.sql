-- Add new columns for the rebuilt Animideo app
alter table public.projects
  add column if not exists visual_style text default 'Flat Illustration'
    check (visual_style in ('Flat Illustration','3D Render','Realistic','Whiteboard','Cinematic')),
  add column if not exists scenes jsonb not null default '[]'::jsonb,
  add column if not exists bg_music_url text;

-- Expand status constraint to include new states
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check (status in (
    'Draft','ScriptReady','ImagesReady','MotionReady',
    'VoiceReady','Rendering','Done','Error'
  ));

-- Storage bucket for scene images and video clips
insert into storage.buckets (id, name, public)
values ('scene-assets', 'scene-assets', true)
on conflict (id) do nothing;

-- Policies for scene-assets bucket
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public scene asset access'
  ) then
    execute $policy$
      create policy "Public scene asset access"
        on storage.objects for select
        to public
        using (bucket_id = 'scene-assets')
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload scene assets'
  ) then
    execute $policy$
      create policy "Authenticated users can upload scene assets"
        on storage.objects for insert
        to authenticated
        with check (bucket_id = 'scene-assets')
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own scene assets'
  ) then
    execute $policy$
      create policy "Users can update own scene assets"
        on storage.objects for update
        to authenticated
        using (bucket_id = 'scene-assets')
    $policy$;
  end if;
end $$;
