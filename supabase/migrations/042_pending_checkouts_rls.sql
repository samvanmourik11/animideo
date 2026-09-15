-- pending_checkouts op slot voor iedereen behalve de server.
--
-- Migratie 005 liet deze tabel bewust zonder Row-Level Security ("alleen via de
-- service role"). Maar zonder RLS kon iedereen met de publieke anon-sleutel — die
-- staat in elke browser — alle 184 rijen lezen, wijzigen en verwijderen: e-mailadressen,
-- Mollie-ids en de status. Met status op "paid" zetten kon je zo zonder betalen een
-- account met credits aanmaken. Supabase meldde het op 15-09-2026 (rls_disabled_in_public).
--
-- Alle code gebruikt voor deze tabel de service role, die RLS omzeilt; daarom geen
-- policies. Opnieuw te draaien.

ALTER TABLE public.pending_checkouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pending_checkouts FROM anon, authenticated;
