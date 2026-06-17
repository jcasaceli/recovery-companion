-- Real file uploads (PDF / Word / images) for resident documents, stored in a
-- private Supabase Storage bucket. The `documents` table keeps metadata; the file
-- itself lives in Storage at  documents/<individual_id>/<filename>.
-- (Older image documents stored inline in file_data still work.)

alter table documents add column if not exists storage_path text;
alter table documents add column if not exists file_name text;
alter table documents add column if not exists mime_type text;
alter table documents add column if not exists size_bytes bigint;

-- Private bucket for resident documents.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- RLS on the bucket: the first path segment is the individual_id. Staff for that
-- resident can read/write; the resident can read their own.
drop policy if exists "documents read" on storage.objects;
create policy "documents read" on storage.objects for select using (
  bucket_id = 'documents' and (
    is_facilitator_for(((storage.foldername(name))[1])::uuid)
    or ((storage.foldername(name))[1])::uuid in (select id from individuals where profile_id = auth.uid())
  )
);

drop policy if exists "documents staff insert" on storage.objects;
create policy "documents staff insert" on storage.objects for insert with check (
  bucket_id = 'documents' and is_facilitator_for(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "documents staff delete" on storage.objects;
create policy "documents staff delete" on storage.objects for delete using (
  bucket_id = 'documents' and is_facilitator_for(((storage.foldername(name))[1])::uuid)
);

notify pgrst, 'reload schema';
