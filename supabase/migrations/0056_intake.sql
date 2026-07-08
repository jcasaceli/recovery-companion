-- Public intake links. Each row maps a public application URL slug to the org
-- that receives the applicants. The backend (service role) reads this to know
-- which org a submission belongs to, then creates an unclaimed individual with
-- the applicant's answers. When the applicant later signs up and redeems the
-- org's join code, redeem_org_code() smart-matches them by email/phone and
-- links this record — so all their intake info pre-populates their app account.

create table if not exists intake_forms (
  slug text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Application',
  -- Optional: the form schema (for reference / future dynamic rendering).
  schema jsonb,
  created_at timestamptz not null default now()
);

-- Locked down: only the service-role backend reads/writes this. RLS on, no
-- policies -> no anon/authenticated access (service role bypasses RLS).
alter table intake_forms enable row level security;

-- Store the full submitted application + when they applied on the resident row.
alter table individuals add column if not exists intake_data jsonb;
alter table individuals add column if not exists applied_at timestamptz;

notify pgrst, 'reload schema';
