-- Org branding: logo, address, and contact info shown on (and printed with) a
-- home's forms — e.g. a Guest Agreement an operator prints as proof of residence.
--
-- Set by the owner in Settings. Public-safe fields (they appear on documents the
-- home hands out), so no new RLS beyond the existing org read/update policies.

alter table organizations
  add column if not exists logo_url text,
  add column if not exists address text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

-- Let the owner/managers update these via the existing "owner updates org" path.
-- (Payment handles already go through set_org_payment_handles; branding is set
--  directly by the owner, whose update policy already covers organizations.)

notify pgrst, 'reload schema';

-- RPC so an owner/manager can set branding (mirrors set_org_payment_handles).
create or replace function set_org_branding(
  p_org_id uuid, p_logo_url text, p_address text, p_phone text, p_email text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from org_members where org_id = p_org_id and profile_id = auth.uid()) then
    raise exception 'not a staff member of this org';
  end if;
  update organizations set
    logo_url = nullif(p_logo_url, ''),
    address = nullif(p_address, ''),
    contact_phone = nullif(p_phone, ''),
    contact_email = nullif(p_email, '')
  where id = p_org_id;
end;
$$;

revoke all on function set_org_branding(uuid, text, text, text, text) from public;
grant execute on function set_org_branding(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
