-- 014_cursus_admin.sql
-- Admin flag for generating cursus-payment links + cursus marker on pending checkouts

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.pending_checkouts
  ADD COLUMN IF NOT EXISTS is_cursus BOOLEAN NOT NULL DEFAULT false;

UPDATE public.profiles
  SET is_admin = true
  WHERE email = 'sam@jouwanimatievideo.nl';
