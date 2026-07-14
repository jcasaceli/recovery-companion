-- Medications list on a resident's profile. Staff-managed (owner/manager) —
-- a simple add/delete list of the medications the client is taking. Stored as
-- a JSON array of strings on the individual, mirroring how `tags` works.

alter table individuals
  add column if not exists medications jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
