-- Style-refs bucket: publiek leesbaar (de URLs gaan rechtstreeks naar Nano
-- Banana Pro), alleen schrijven via service-role (admin upload). Geen
-- user-facing upload, dus geen authenticated-write policy nodig.

insert into storage.buckets (id, name, public)
values ('style-refs', 'style-refs', true)
on conflict (id) do nothing;

-- Publieke read policy zodat browser én fal.ai de referenties kunnen ophalen.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Public read for style-refs'
  ) then
    execute $policy$
      create policy "Public read for style-refs"
        on storage.objects
        for select
        to public
        using (bucket_id = 'style-refs')
    $policy$;
  end if;
end $$;
