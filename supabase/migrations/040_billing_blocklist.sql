-- 040_billing_blocklist.sql
-- Zwarte lijst voor afrekenen.
--
-- `profiles.billing_blocked` (zie 036) werkt op een bestaand account. Dat is te
-- laat voor iemand die telkens een níeuw e-mailadres gebruikt: die heeft nog
-- geen account als hij afrekent. Deze lijst blokkeert daarom op wat wél
-- hetzelfde blijft — de bankrekening — en daarnaast op adressen en namen die we
-- al kennen.
--
-- Aanleiding: één persoon heeft sinds juni negen keer de eerste-maand-actie
-- gebruikt met zes verschillende e-mailadressen en twee rekeningnummers, en de
-- vervolgincasso's teruggeboekt.

CREATE TABLE IF NOT EXISTS public.billing_blocklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'email' | 'iban' | 'naam'. Geen enum: we willen er zonder migratie een
  -- soort bij kunnen zetten als er een nieuwe truc langskomt.
  soort      TEXT NOT NULL CHECK (soort IN ('email', 'iban', 'naam')),
  -- Genormaliseerd opgeslagen: kleine letters, en bij een IBAN zonder spaties.
  waarde     TEXT NOT NULL,
  reden      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eén regel per waarde; opnieuw toevoegen mag stil mislukken.
CREATE UNIQUE INDEX IF NOT EXISTS billing_blocklist_uniek
  ON public.billing_blocklist (soort, waarde);

ALTER TABLE public.billing_blocklist ENABLE ROW LEVEL SECURITY;

-- Alleen de service-rol (checkout-routes, webhook, admin) mag hierbij. Een
-- klant hoort niet te kunnen zien of opvragen wie er op de lijst staat.
DROP POLICY IF EXISTS "Service role full access on billing_blocklist" ON public.billing_blocklist;
CREATE POLICY "Service role full access on billing_blocklist"
  ON public.billing_blocklist FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Bekende gevallen ────────────────────────────────────────────────────────
-- Bewust wél de rekeningnummers en de e-mailadressen, en NIET de naam: op naam
-- blokkeren zou ook een naamgenoot buitensluiten.
INSERT INTO public.billing_blocklist (soort, waarde, reden) VALUES
  ('iban',  'nl90ingb0006659002',                  'Misbruik eerste-maand-actie + terugboekingen (21-08-2026)'),
  ('iban',  'nl75ingb0006057775',                  'Misbruik eerste-maand-actie + terugboekingen (21-08-2026)'),
  ('email', 'e.matzer@outlook.com',                'Misbruik eerste-maand-actie + terugboekingen (21-08-2026)'),
  ('email', 'gratisproeven@hotmail.com',           'Misbruik eerste-maand-actie + terugboekingen (21-08-2026)'),
  ('email', 'thuiszelfbierbrouwboek@outlook.com',  'Misbruik eerste-maand-actie + terugboekingen (21-08-2026)'),
  ('email', 'thuiszelfbierbrouwenboek@outlook.com','Misbruik eerste-maand-actie + terugboekingen (21-08-2026)'),
  ('email', 'eddydewereld@hotmail.com',            'Misbruik eerste-maand-actie + terugboekingen (21-08-2026)')
ON CONFLICT (soort, waarde) DO NOTHING;
