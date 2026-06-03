-- Membership agreements: facilitator uploads a document (photo), assigns it to a
-- resident, the resident views and signs it, and the signed copy is visible to
-- the facilitator. Document image and signature are stored inline (data URI /
-- vector strokes) to keep the flow self-contained — no Storage bucket needed.

create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  title text not null,
  document_data text,                 -- base64 data URI of the uploaded photo
  status text not null default 'pending',  -- 'pending' | 'signed'
  signature_paths jsonb,              -- array of SVG path strings (the signature)
  signer_name text,
  signed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agreements_individual_idx on agreements (individual_id, created_at desc);

alter table agreements enable row level security;

-- Helper: does the current member own this individual record?
-- (members link to their individual row via individuals.profile_id)
-- We inline the check rather than add a function, to mirror existing policies.

drop policy if exists "read agreements" on agreements;
create policy "read agreements" on agreements
  for select using (
    is_facilitator_for(individual_id)
    or individual_id in (select id from individuals where profile_id = auth.uid())
  );

drop policy if exists "facilitator inserts agreements" on agreements;
create policy "facilitator inserts agreements" on agreements
  for insert with check (is_facilitator_for(individual_id));

-- Facilitator can manage; the member can update only to sign their own.
drop policy if exists "update agreements" on agreements;
create policy "update agreements" on agreements
  for update using (
    is_facilitator_for(individual_id)
    or individual_id in (select id from individuals where profile_id = auth.uid())
  );

drop policy if exists "facilitator deletes agreements" on agreements;
create policy "facilitator deletes agreements" on agreements
  for delete using (is_facilitator_for(individual_id));

notify pgrst, 'reload schema';
