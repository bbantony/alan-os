-- Alan OS — somewhere to put a profile photo.
--
-- `profiles.avatar_url` has existed since migration 0001 and has never had a
-- way to set it: no upload, no bucket, no UI. The crew feed has been drawing
-- initials in a circle this whole time because there was never anything else
-- to draw.
--
-- Public, unlike `receipts` and `journal`. An avatar is shown to the rest of
-- your crew on every feed card, and a private bucket would mean signing a URL
-- per member per card on every render — a lot of machinery to protect a
-- thumbnail you're deliberately showing other people. The write policy is still
-- per-user: only you can put a file in your own folder, and the path convention
-- ("<user_id>/<uuid>.<ext>") is the same one 0017 established for receipts.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_read_all" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_write_own" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
