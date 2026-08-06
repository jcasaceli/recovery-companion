-- Let staff hide an uploaded document from the resident's Documents tab.
--
-- Mirrors the form-visibility pattern (migration 0065): enforced in RLS so a
-- hidden document — AND its stored file — never reaches the resident's device.
-- Staff branches are untouched, so staff always see everything. Default is
-- false, so nothing changes until a staffer explicitly hides a document.

alter table documents
  add column if not exists hidden_from_member boolean not null default false;

-- Table read: staff unchanged; the resident sees their own doc only when not hidden.
drop policy if exists "read documents" on documents;
create policy "read documents" on documents for select using (
  is_facilitator_for(individual_id)
  or (
    individual_id in (select id from individuals where profile_id = auth.uid())
    and hidden_from_member = false
  )
);

-- Storage read: also block the resident from fetching a hidden document's file.
-- Staff and non-hidden documents are unaffected.
drop policy if exists "documents read" on storage.objects;
create policy "documents read" on storage.objects for select using (
  bucket_id = 'documents' and (
    is_facilitator_for(((storage.foldername(name))[1])::uuid)
    or (
      ((storage.foldername(name))[1])::uuid in (select id from individuals where profile_id = auth.uid())
      and not exists (
        select 1 from documents d
        where d.storage_path = storage.objects.name and d.hidden_from_member = true
      )
    )
  )
);

notify pgrst, 'reload schema';
