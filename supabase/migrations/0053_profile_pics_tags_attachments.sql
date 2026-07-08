-- Profile pictures (resident avatars), note/UA file attachments (STAFF-ONLY),
-- and confirming the free-text tags column.
--
-- Two new Storage buckets:
--   avatars      – a resident's profile photo. The resident AND their staff can
--                  read/write it (path: <individual_id>/...).
--   staff-files  – files attached to clinical notes and UA results. STAFF ONLY:
--                  residents have NO read policy, so they can never open these,
--                  even though they can see the note/UA row itself.

-- ── Resident profile picture ────────────────────────────────────────────────
alter table individuals add column if not exists avatar_path text;

-- tags text[] already exists on individuals (0001_init) — this is a no-op guard.
alter table individuals add column if not exists tags text[] not null default '{}';

-- ── Note & UA attachments (metadata; the file lives in staff-files) ──────────
alter table notes add column if not exists attachment_path text;
alter table notes add column if not exists attachment_name text;
alter table notes add column if not exists attachment_mime text;

alter table ua_tests add column if not exists attachment_path text;
alter table ua_tests add column if not exists attachment_name text;
alter table ua_tests add column if not exists attachment_mime text;

-- ── avatars bucket (resident + staff read/write) ────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (
  bucket_id = 'avatars' and (
    is_facilitator_for(((storage.foldername(name))[1])::uuid)
    or ((storage.foldername(name))[1])::uuid in (select id from individuals where profile_id = auth.uid())
  )
);

drop policy if exists "avatars write" on storage.objects;
create policy "avatars write" on storage.objects for insert with check (
  bucket_id = 'avatars' and (
    is_facilitator_for(((storage.foldername(name))[1])::uuid)
    or ((storage.foldername(name))[1])::uuid in (select id from individuals where profile_id = auth.uid())
  )
);

drop policy if exists "avatars update" on storage.objects;
create policy "avatars update" on storage.objects for update using (
  bucket_id = 'avatars' and (
    is_facilitator_for(((storage.foldername(name))[1])::uuid)
    or ((storage.foldername(name))[1])::uuid in (select id from individuals where profile_id = auth.uid())
  )
);

drop policy if exists "avatars delete" on storage.objects;
create policy "avatars delete" on storage.objects for delete using (
  bucket_id = 'avatars' and (
    is_facilitator_for(((storage.foldername(name))[1])::uuid)
    or ((storage.foldername(name))[1])::uuid in (select id from individuals where profile_id = auth.uid())
  )
);

-- ── staff-files bucket (STAFF ONLY — residents get no policy at all) ─────────
insert into storage.buckets (id, name, public)
values ('staff-files', 'staff-files', false)
on conflict (id) do nothing;

drop policy if exists "staff-files read" on storage.objects;
create policy "staff-files read" on storage.objects for select using (
  bucket_id = 'staff-files' and is_facilitator_for(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "staff-files insert" on storage.objects;
create policy "staff-files insert" on storage.objects for insert with check (
  bucket_id = 'staff-files' and is_facilitator_for(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "staff-files delete" on storage.objects;
create policy "staff-files delete" on storage.objects for delete using (
  bucket_id = 'staff-files' and is_facilitator_for(((storage.foldername(name))[1])::uuid)
);

notify pgrst, 'reload schema';
