-- Muziekbibliotheek-bucket: publiek leesbaar (de browser speelt de previews
-- rechtstreeks af en de export-routes halen het nummer op), schrijven alleen
-- via service-role (scripts/upload-music-library.mjs). Geen user-facing upload
-- naar deze bucket, dus geen authenticated-write policy.

insert into storage.buckets (id, name, public)
values ('music', 'music', true)
on conflict (id) do nothing;

-- Publieke read policy zodat preview én export het bestand kunnen ophalen.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Public read for music'
  ) then
    execute $policy$
      create policy "Public read for music"
        on storage.objects
        for select
        to public
        using (bucket_id = 'music')
    $policy$;
  end if;
end $$;
