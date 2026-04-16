-- Update visual_style constraint to include new styles
alter table public.projects drop constraint if exists projects_visual_style_check;
alter table public.projects
  add constraint projects_visual_style_check
  check (visual_style in (
    'Cinematic',
    'Realistic',
    'Whiteboard',
    '2D Cartoon',
    '2D SaaS',
    'Motion Graphic',
    '3D Pixar',
    '3D Animatie'
  ));
