-- Table for guest checkouts (pay before account creation)
CREATE TABLE IF NOT EXISTS public.pending_checkouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL,
  plan                  TEXT NOT NULL,
  mollie_customer_id    TEXT,
  mollie_payment_id     TEXT,
  mollie_subscription_id TEXT,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | paid | claimed
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by email + status (used when user logs in)
CREATE INDEX IF NOT EXISTS pending_checkouts_email_status
  ON public.pending_checkouts (email, status);

-- No RLS — only accessed via service role key from API routes
