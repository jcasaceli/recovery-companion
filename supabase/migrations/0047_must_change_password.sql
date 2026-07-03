-- Force a password change on first login for accounts created with a temporary
-- password (house managers). Cleared once they set their own password.
alter table profiles add column if not exists must_change_password boolean not null default false;

notify pgrst, 'reload schema';
