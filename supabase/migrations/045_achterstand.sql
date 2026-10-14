-- 045_achterstand.sql
-- Teruggeboekte incasso's terughalen: elke terugboeking wordt een openstaande
-- post met een eigen betaallink, een reeks mails (direct, na 7 en na 14 dagen)
-- en een account dat op slot staat tot er betaald is.
--
-- Bouwt voort op de tabel `chargebacks` uit 036. Die stond er al, maar werd op
-- de live-lijn nog nergens gevuld.

ALTER TABLE public.chargebacks
  -- Bankreden van Mollie (bv. MD06 = klant vroeg zelf om terugboeking,
  -- AM04 = onvoldoende saldo). Bepaalt de toon van de mail.
  ADD COLUMN IF NOT EXISTS reden_code        TEXT,
  ADD COLUMN IF NOT EXISTS reden             TEXT,
  ADD COLUMN IF NOT EXISTS email             TEXT,
  ADD COLUMN IF NOT EXISTS guest_checkout_id TEXT,
  -- Datum van de incasso die is teruggeboekt (niet van de terugboeking zelf).
  ADD COLUMN IF NOT EXISTS incasso_datum     TIMESTAMPTZ,
  -- open = nog te betalen, betaald = via de betaallink voldaan,
  -- kwijtgescholden = met de hand afgeboekt (dan stopt ook het mailen).
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS betaald_op        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS betaal_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mail_1_op         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mail_2_op         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mail_3_op         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mail_fout         TEXT;

ALTER TABLE public.chargebacks DROP CONSTRAINT IF EXISTS chargebacks_status_check;
ALTER TABLE public.chargebacks
  ADD CONSTRAINT chargebacks_status_check CHECK (status IN ('open', 'betaald', 'kwijtgescholden'));

CREATE INDEX IF NOT EXISTS chargebacks_open_klant
  ON public.chargebacks (mollie_customer_id)
  WHERE status = 'open';

-- Het slot op het account. Apart van billing_blocked: dat is de zwarte lijst
-- (nooit meer afrekenen), dit gaat vanzelf weer open zodra er betaald is.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS achterstand_sinds TIMESTAMPTZ;

-- RLS stond in 036 al aan met alleen toegang voor de service-rol; dat blijft zo.
ALTER TABLE public.chargebacks ENABLE ROW LEVEL SECURITY;
