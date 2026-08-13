-- Payment flexibility (all orgs):
--  • rent_start_date        — optional plan start; nothing is due before it.
--  • balance_adjustment_cents — a one-time carryover balance. Positive = the
--    resident owes extra (e.g. a prior balance); negative = a credit (paid
--    ahead / owed less). Factored into what their card shows as due.
--  • balance_note           — a short label for the adjustment ("Prior balance").

alter table individuals add column if not exists rent_start_date date;
alter table individuals add column if not exists balance_adjustment_cents integer not null default 0;
alter table individuals add column if not exists balance_note text;

notify pgrst, 'reload schema';
