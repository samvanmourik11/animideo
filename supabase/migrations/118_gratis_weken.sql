-- De gratis week (Sam, 25-10-2026): 7 dagen gratis met 200 credits, daarna het gekozen
-- abonnement. De klant verifieert met iDEAL voor een paar cent (dat zet het mandaat klaar)
-- en krijgt dat bedrag meteen terug. Eén gratis week per bankrekening en per e-mailadres;
-- de rekening bewaren we alleen als hash.

CREATE TABLE IF NOT EXISTS public.gratis_weken (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id        UUID NOT NULL UNIQUE REFERENCES public.pending_checkouts(id) ON DELETE CASCADE,
  email              TEXT NOT NULL,
  plan               TEXT NOT NULL,
  bedrag             TEXT NOT NULL,
  mollie_payment_id  TEXT,
  rekening_hash      TEXT,
  status             TEXT NOT NULL DEFAULT 'open', -- open | bezig | gestart | dubbel | mislukt
  terugbetaald_op    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gratis_weken_rekening ON public.gratis_weken (rekening_hash);
CREATE INDEX IF NOT EXISTS gratis_weken_email ON public.gratis_weken (lower(email));

ALTER TABLE public.gratis_weken ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gratis_weken FROM anon, authenticated;
