-- Iconenbibliotheek-bucket: publiek leesbaar (de editor toont ze rechtstreeks en
-- de render haalt ze op), schrijven alleen via service-role
-- (scripts/generate-icon-library.mjs) of via de editor-route die een icoon op
-- verzoek bijmaakt.
--
-- Zelfde opzet als de `music`-bucket: één keer vullen, daarna gratis en direct
-- beschikbaar in plaats van elke keer opnieuw laten genereren.

insert into storage.buckets (id, name, public)
values ('icons', 'icons', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Public read for icons'
  ) then
    execute $policy$
      create policy "Public read for icons"
        on storage.objects
        for select
        to public
        using (bucket_id = 'icons')
    $policy$;
  end if;
end $$;

-- Zelfgemaakte iconen ("genereer mijn icoon"): die horen bij één gebruiker en
-- gaan in zijn eigen map, zodat ze elkaar niet in de weg zitten.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Users can add own icons'
  ) then
    execute $policy$
      create policy "Users can add own icons"
        on storage.objects
        for insert
        to authenticated
        with check (
          bucket_id = 'icons'
          and (storage.foldername(name))[1] = 'eigen'
          and (storage.foldername(name))[2] = auth.uid()::text
        )
    $policy$;
  end if;
end $$;
