-- Add image_model column to allow per-project model selection
alter table public.projects
  add column if not exists image_model text not null default 'flux-schnell'
    check (image_model in ('flux-schnell', 'flux-pro', 'dall-e-3'));
