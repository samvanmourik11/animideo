-- Update visual_style constraint voor de nieuwe stijl-packs (reference-image
-- gebaseerd in plaats van prompt-modifiers). Oude waarden blijven toegestaan
-- zodat bestaande projecten niet stuk gaan; remapLegacyStyle() in
-- lib/style-packs.ts zet ze automatisch om bij het laden.

alter table public.projects drop constraint if exists projects_visual_style_check;
alter table public.projects
  add constraint projects_visual_style_check
  check (visual_style in (
    -- Nieuwe packs
    'Kurzgezagt',
    'Realistic',
    'Cartoon',
    '3D Animatie',
    '3D Pixar',
    -- Legacy waarden, alleen voor read-compatibility met oude rijen
    'Cinematic',
    'Whiteboard',
    '2D Cartoon',
    '2D SaaS',
    'Motion Graphic'
  ));
