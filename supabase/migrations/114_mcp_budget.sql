-- Nieuwe app, Animideo in Claude: één keer toestemming per project (Sam, 24-10-2026).
-- Claude schat vooraf wat het hele projectje kost en vraagt één keer akkoord; daarna werkt
-- hij binnen dat budget zonder per stap te vragen, zoals het automatisch-knopje in de app.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.mcp_budgetten (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  omschrijving text not null,
  posten       jsonb not null default '[]',   -- [{ wat, credits }]
  totaal       int not null check (totaal between 1 and 2000),
  uitgegeven   int not null default 0,
  status       text not null default 'voorstel' check (status in ('voorstel', 'actief', 'afgewezen')),
  verloopt_op  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists mcp_budgetten_user on public.mcp_budgetten (user_id, created_at desc);

-- Alleen de server leest en schrijft hierin.
alter table public.mcp_budgetten enable row level security;
