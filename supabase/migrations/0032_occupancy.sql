-- Bed occupancy + intake/discharge management for the facilitator CRM.
-- Each house has a bed capacity; each resident can be assigned a bed label and
-- has a move-in date. Discharging a resident sets status='completed' and records
-- the discharge date (their bed frees up).

alter table houses      add column if not exists capacity int;
alter table individuals add column if not exists bed_label text;
alter table individuals add column if not exists move_in_date date;
alter table individuals add column if not exists discharge_date date;

notify pgrst, 'reload schema';
