-- 026_hide_leren.sql
-- Per-gebruiker vlag om de e-learning ("Leren") af te schermen. Bedoeld voor
-- klanten die de cursus al los kochten; voor hen oogt gratis dezelfde content niet netjes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_leren BOOLEAN NOT NULL DEFAULT false;

-- Bestaande cursus-/webinar-klanten meteen verbergen: alle profielen waarvan het
-- e-mailadres hoort bij een cursus-checkout (is_cursus = true).
UPDATE public.profiles p
  SET hide_leren = true
  WHERE EXISTS (
    SELECT 1 FROM public.pending_checkouts pc
    WHERE pc.is_cursus = true
      AND lower(pc.email) = lower(p.email)
  );
