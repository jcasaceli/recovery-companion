-- Stripe Connect (rent) + platform billing fields.

-- The operator's connected Stripe account + whether they can accept charges.
alter table organizations add column if not exists stripe_account_id text;
alter table organizations add column if not exists charges_enabled boolean not null default false;

-- Optional preset monthly rent per resident (cents). Facilitator sets it; the
-- resident's "Pay rent" screen uses it as the default amount.
alter table individuals add column if not exists monthly_rent_cents integer;

-- Facilitator can set a resident's rent amount.
drop policy if exists "fac set rent" on individuals;
create policy "fac set rent" on individuals
  for update using (is_facilitator_for(id)) with check (is_facilitator_for(id));
