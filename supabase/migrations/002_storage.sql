-- Storage bucket for audio files
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload audio
create policy "Authenticated users can upload audio"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'audio');

-- Allow public read access to audio files
create policy "Public audio access"
  on storage.objects for select
  to public
  using (bucket_id = 'audio');
