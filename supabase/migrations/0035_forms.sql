-- Fillable lease / intake forms. Staff build a form (or use a template), assign it
-- to a resident, and the resident fills it in and e-signs (date + time + IP, like
-- agreements). Answers are stored as structured data.
--
-- SENSITIVE PII: forms may include the last 4 of an SSN and a mailing address.
-- We store the SSN as last-4 ONLY (never the full number) and protect every
-- response with row-level security: only the resident and their own house's staff
-- can read it. (Supabase encrypts data at rest at the disk level.)

create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  title text not null,
  description text,
  fields jsonb not null default '[]',   -- [{ key, label, type, required }]
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table form_templates enable row level security;

drop policy if exists "org staff manage form_templates" on form_templates;
create policy "org staff manage form_templates" on form_templates for all
  using (org_id in (select org_id from org_members where profile_id = auth.uid()))
  with check (org_id in (select org_id from org_members where profile_id = auth.uid()));

create table if not exists form_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  template_id uuid references form_templates(id) on delete set null,
  title text not null,                  -- snapshot of the template title
  fields jsonb not null default '[]',   -- snapshot of the field definitions (immutable once assigned)
  answers jsonb not null default '{}',  -- { fieldKey: value }
  status text not null default 'pending',   -- 'pending' | 'completed'
  signature_paths jsonb,                -- SVG path strings (the signature)
  signer_name text,
  signed_at timestamptz,
  signed_ip text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists form_responses_individual_idx on form_responses (individual_id, created_at desc);

alter table form_responses enable row level security;

-- The resident and their house's staff can read a response.
drop policy if exists "read form_responses" on form_responses;
create policy "read form_responses" on form_responses for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

-- Staff assign a form to a resident.
drop policy if exists "staff inserts form_responses" on form_responses;
create policy "staff inserts form_responses" on form_responses for insert with check (is_facilitator_for(individual_id));

-- Staff may edit; the resident updates only to fill in / sign their own.
drop policy if exists "update form_responses" on form_responses;
create policy "update form_responses" on form_responses for update using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

drop policy if exists "staff deletes form_responses" on form_responses;
create policy "staff deletes form_responses" on form_responses for delete using (is_facilitator_for(individual_id));

notify pgrst, 'reload schema';
