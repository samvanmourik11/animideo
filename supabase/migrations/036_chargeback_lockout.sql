-- 036_chargeback_lockout.sql
-- Terugboekingen (chargebacks / SEPA-storno's) automatisch afhandelen.
--
-- Bij een terugboeking wordt het account teruggezet naar 'free' en vergrendeld:
-- Mollie-abonnementen en -mandaten worden ingetrokken, zodat er geen enkele
-- vervolgincasso meer plaatsvindt. De vergrendeling is bewust een apart veld en
-- geen extra waarde in subscription_status, zodat bestaande queries op
-- 'active' / 'canceled' ongewijzigd blijven werken.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_blocked        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_blocked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_blocked_reason TEXT;

-- Opzoeken van geblokkeerde accounts in het adminoverzicht.
CREATE INDEX IF NOT EXISTS profiles_billing_blocked
  ON public.profiles (billing_blocked)
  WHERE billing_blocked;

-- Auditspoor: elke terugboeking die binnenkomt, ook die van gast-checkouts
-- waar (nog) geen profiel bij hoort.
CREATE TABLE IF NOT EXISTS public.chargebacks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  mollie_payment_id  TEXT NOT NULL,
  mollie_customer_id TEXT,
  amount             NUMERIC(10,2),
  currency           TEXT DEFAULT 'EUR',
  -- Wat er als gevolg hiervan is ingetrokken, voor navraag achteraf.
  canceled_subscriptions TEXT[] DEFAULT '{}',
  revoked_mandates       TEXT[] DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Eén rij per betaling: Mollie roept dezelfde webhook meerdere keren aan en de
-- afhandeling moet idempotent zijn.
CREATE UNIQUE INDEX IF NOT EXISTS chargebacks_payment_unique
  ON public.chargebacks (mollie_payment_id);

ALTER TABLE public.chargebacks ENABLE ROW LEVEL SECURITY;

-- Alleen de service-rol (webhook + admin-routes) mag hierbij.
DROP POLICY IF EXISTS "Service role full access on chargebacks" ON public.chargebacks;
CREATE POLICY "Service role full access on chargebacks"
  ON public.chargebacks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
