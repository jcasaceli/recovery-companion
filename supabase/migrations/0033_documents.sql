-- Document storage: staff store documents (intake paperwork, IDs, insurance,
-- house rules, etc.) on a member's file. Images are stored inline as base64 data
-- URIs (same approach as agreements — no Storage bucket needed). The member can
-- view their own documents; staff manage them.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  title text not null,
  file_data text,                      -- base64 data URI of the document image
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists documents_individual_idx on documents (individual_id, created_at desc);

alter table documents enable row level security;

drop policy if exists "read documents" on documents;
create policy "read documents" on documents for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

drop policy if exists "staff inserts documents" on documents;
create policy "staff inserts documents" on documents for insert with check (is_facilitator_for(individual_id));

drop policy if exists "staff deletes documents" on documents;
create policy "staff deletes documents" on documents for delete using (is_facilitator_for(individual_id));

notify pgrst, 'reload schema';
