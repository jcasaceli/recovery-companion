-- Payment tracking, CashApp/Zelle handles, and rent due dates.

-- Operator payment handles so members can pay by CashApp or Zelle.
alter table organizations add column if not exists cashapp_tag text;
alter table organizations add column if not exists zelle_tag text;

-- Rent due day of the month (1-31). monthly_rent_cents already exists.
alter table individuals add column if not exists rent_due_day smallint
  check (rent_due_day between 1 and 31);

-- Payment records (card via Stripe webhook, or manually recorded cash/CashApp/Zelle).
create table payments (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  amount_cents integer not null,
  method text not null default 'card' check (method in ('card','cashapp','zelle','cash','other')),
  status text not null default 'paid',
  on_time boolean,
  period_month text,                       -- 'YYYY-MM' the rent period it covers
  source text not null default 'manual',   -- 'stripe' | 'manual'
  paid_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table payments enable row level security;

create policy "read payments" on payments
  for select using (can_access(individual_id));
create policy "record payment" on payments
  for insert with check (can_access(individual_id));
create policy "fac manage payments" on payments
  for all using (is_facilitator_for(individual_id)) with check (is_facilitator_for(individual_id));

-- Org owner can update org settings (CashApp/Zelle tags, etc.).
drop policy if exists "owner updates org" on organizations;
create policy "owner updates org" on organizations
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

-- A resident can read their own org row (to see CashApp/Zelle handles).
drop policy if exists "resident sees their org" on organizations;
create policy "resident sees their org" on organizations
  for select using (
    exists (select 1 from individuals i where i.org_id = organizations.id and i.profile_id = auth.uid())
  );

-- A member is linked to their individual record via individuals.profile_id.
-- Let them read that record and their own payments, and report a payment.
drop policy if exists "member sees own record" on individuals;
create policy "member sees own record" on individuals
  for select using (profile_id = auth.uid());

drop policy if exists "member reads own payments" on payments;
create policy "member reads own payments" on payments
  for select using (
    exists (select 1 from individuals i where i.id = payments.individual_id and i.profile_id = auth.uid())
  );

drop policy if exists "member reports own payment" on payments;
create policy "member reports own payment" on payments
  for insert with check (
    exists (select 1 from individuals i where i.id = payments.individual_id and i.profile_id = auth.uid())
  );

create index on payments (individual_id, paid_at desc);
create index on payments (org_id, period_month);
