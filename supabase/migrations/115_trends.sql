-- Nieuwe app: de Trends-studio. Elke dag zoekt Claude op internet wat er viral gaat
-- (een dansje, een goal die iedereen namaakt, een AI-effect) en zet het als voorstel klaar,
-- met een maakmethode die bij díe trend past. Pas als Sam een trend live zet, zien klanten
-- hem en kunnen ze hem met hun eigen foto namaken (Sam, 24-10-2026: eerst keuren).
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.trends (
  id              uuid primary key default gen_random_uuid(),
  titel           text not null,
  -- Voor de klant: wat je krijgt, in gewone taal.
  uitleg          text not null default '',
  -- Voor Sam: waarom dit nu viral is, en wat het origineel was (echte opname, Kling, …).
  waarom_viral    text,
  origineel       text,
  -- [{ url, titel }]: waar de trend te zien is (TikTok, Instagram, YouTube, nieuws)
  bron_links      jsonb not null default '[]',
  icoon           text not null default '🔥',
  methode         text not null check (methode in ('foto', 'tekst-foto', 'foto-video', 'video-effect', 'tekst-video', 'beweging', 'pratend')),
  -- Wat de klant aanlevert: { fotos: [{ label }], tekst: { label, placeholder, verplicht } | null }
  velden          jsonb not null default '{"fotos": [], "tekst": null}',
  -- De verborgen opdracht (alleen de server): { scenePrompt, bewegingPrompt, formaat }
  opdracht        jsonb not null default '{}',
  -- Bij 'beweging' en 'pratend': de trendvideo waarvan de beweging/het geluid komt.
  voorbeeldclip   text,
  geluid          text,
  clip_sec        numeric,
  -- Een geslaagd resultaat om op de tegel te laten zien.
  voorbeeld_url   text,
  voorbeeld_soort text,
  gezicht         boolean not null default true,
  -- 1-10: hoe hard het nu gaat (sortering in de studio).
  hotness         int not null default 5,
  status          text not null default 'voorstel' check (status in ('voorstel', 'live', 'afgewezen', 'archief')),
  bron            text not null default 'speurtocht',
  live_op         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists trends_status on public.trends (status, hotness desc);

-- Alleen de server leest en schrijft (de verborgen opdracht mag niet naar de browser);
-- geen policies voor gebruikers.
alter table public.trends enable row level security;
