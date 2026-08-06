-- Two small additions:
--  1. notes.flagged — lets staff flag a note so a 📌 reminder shows on the
--     all-members list (missed house meeting, missed case-management session…).
--  2. payments.third_party_name — when someone other than the resident pays
--     (agency, family member), record who. A third-party invoice that hasn't
--     been paid yet is stored with status='reported' so it does NOT count
--     toward the resident's balance until confirmed ("Mark paid").
--
-- Both are staff-managed columns; existing RLS (facilitator access) already
-- covers reads/writes, so no policy changes are needed.

alter table notes    add column if not exists flagged boolean not null default false;
alter table payments add column if not exists third_party_name text;

notify pgrst, 'reload schema';
