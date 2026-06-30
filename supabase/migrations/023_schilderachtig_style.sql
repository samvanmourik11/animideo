-- Voegt de nieuwe stijl-pack "Schilderachtig" (Schilderachtige animatie) toe aan
-- de toegestane visual_style-waarden. Reference-image gebaseerd, net als de
-- andere packs in lib/style-packs.ts. Oude/legacy waarden blijven toegestaan.

alter table public.projects drop constraint if exists projects_visual_style_check;
alter table public.projects
  add constraint projects_visual_style_check
  check (visual_style in (
    -- Nieuwe packs
    'Schilderachtig',
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
