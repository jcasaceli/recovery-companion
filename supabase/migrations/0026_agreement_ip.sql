-- DocuSign-style audit trail: record the IP address a resident signed from.
-- (Signed date/time is already captured in agreements.signed_at.)
alter table agreements add column if not exists signed_ip text;

notify pgrst, 'reload schema';
