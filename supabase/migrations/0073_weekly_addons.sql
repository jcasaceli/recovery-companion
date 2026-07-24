-- Toggleable weekly add-on fees: $5 house dues and $10 A/C fee. Owner or manager
-- flips these on/off per resident; the resident's weekly total = base fee +
-- whichever add-ons are on. Amounts are fixed ($5 / $10) in the app.
alter table individuals
  add column if not exists dues_enabled boolean not null default false,
  add column if not exists ac_enabled boolean not null default false;

notify pgrst, 'reload schema';
