-- Weekly membership fees + a one-time application/intake fee.
--
-- Rent was monthly-only (monthly_rent_cents + rent_due_day 1-31). Operators like
-- All-In bill weekly, so add a period + a weekday. The amount stays in
-- monthly_rent_cents (now "the fee amount per period"); rent_period says whether
-- that amount is due monthly (on rent_due_day) or weekly (on rent_due_dow).
alter table individuals
  add column if not exists rent_period text not null default 'monthly'
    check (rent_period in ('monthly','weekly')),
  add column if not exists rent_due_dow smallint
    check (rent_due_dow between 0 and 6);   -- 0=Sunday … 6=Saturday (weekly only)

-- Org-level application / intake fee: a yes/no toggle + amount. When enabled,
-- new residents owe this one-time fee (surfaced on the Pay screen).
alter table organizations
  add column if not exists intake_fee_enabled boolean not null default false,
  add column if not exists intake_fee_cents integer;

notify pgrst, 'reload schema';
