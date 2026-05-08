-- Audio bucket missed UPDATE/DELETE policies, so voice-over regeneration
-- via upload(..., { upsert: true }) hit an RLS error on the second attempt
-- once a voice.mp3 already existed.
-- Mirrors the patterns used for scene-assets in migration 003.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update audio'
  ) then
    execute $policy$
      create policy "Authenticated users can update audio"
        on storage.objects for update
        to authenticated
        using (bucket_id = 'audio')
    $policy$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete audio'
  ) then
    execute $policy$
      create policy "Authenticated users can delete audio"
        on storage.objects for delete
        to authenticated
        using (bucket_id = 'audio')
    $policy$;
  end if;
end $$;
