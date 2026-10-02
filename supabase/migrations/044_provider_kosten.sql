-- Logboek van wat elke aanroep naar fal ons kost.
--
-- Credits zeggen wat een klant betaalt, niet wat wij inkopen. En de interne
-- accounts (UNLIMITED_ACCOUNTS) schrijven helemaal niets af, terwijl daar met
-- demo's het meeste verbruik zit. Zonder dit logboek was de fal-rekening een
-- raadsel: in de week van 25-09-2026 ging er ~€500 aan opwaarderingen doorheen
-- terwijl klanten voor ~$85 aan credits verbruikten.
--
-- Bedragen zijn een schatting op basis van de fal-tarieven per model (zie
-- lib/provider-kosten.ts), niet de factuur zelf.
--
-- Alleen de server schrijft en leest hier (service-client); daarom RLS aan en
-- bewust geen policies voor gewone gebruikers.

CREATE TABLE IF NOT EXISTS provider_kosten (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email       text,
  provider    text NOT NULL DEFAULT 'fal',
  model       text NOT NULL,
  kosten_usd  numeric(10,4) NOT NULL,
  -- Waar de aanroep vandaan kwam (de reden van de creditafschrijving, als die er was).
  actie       text,
  details     jsonb
);

CREATE INDEX IF NOT EXISTS provider_kosten_created_at_idx ON provider_kosten (created_at DESC);
CREATE INDEX IF NOT EXISTS provider_kosten_user_idx ON provider_kosten (user_id, created_at DESC);

ALTER TABLE provider_kosten ENABLE ROW LEVEL SECURITY;
