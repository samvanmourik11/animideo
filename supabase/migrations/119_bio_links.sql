-- Links in de bio van de niche-pagina's (TikTok/Instagram) meten: kliks + aankopen per pagina.
-- Gelezen door het CRM (jav-outreach, Socials-dashboard) met de service-sleutel.
CREATE TABLE IF NOT EXISTS bio_kliks (
  id bigserial PRIMARY KEY,
  bron text NOT NULL,            -- bv. ig:kraak.je.brein / tt:brein.weetjes
  op timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bio_kliks_bron_op ON bio_kliks (bron, op);

CREATE TABLE IF NOT EXISTS bio_aankopen (
  id bigserial PRIMARY KEY,
  bron text NOT NULL,
  soort text NOT NULL,           -- gratis_week / proef / abonnement
  plan text,
  email text,
  mollie_customer_id text,
  mollie_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bio_aankopen_bron ON bio_aankopen (bron);

ALTER TABLE bio_kliks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bio_aankopen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bio_kliks, bio_aankopen FROM anon, authenticated;
