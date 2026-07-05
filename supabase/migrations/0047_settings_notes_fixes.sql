-- Batch fixes: payment-handle save targets the RIGHT org, note authors are
-- readable to co-org staff, and force-password-change flag for new managers.

-- 1) Force password change for temp-password (manager) accounts.
alter table profiles add column if not exists must_change_password boolean not null default false;

-- 2) Payment handles: take an explicit org id so the save lands on the org the
--    owner is actually viewing (the old limit-1 version could write to a stray org).
drop function if exists set_org_payment_handles(text, text);
create or replace function set_org_payment_handles(p_org_id uuid, p_cashapp text, p_zelle text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from org_members where org_id = p_org_id and profile_id = auth.uid()) then
    raise exception 'not a staff member of this org';
  end if;
  update organizations set cashapp_tag = nullif(p_cashapp, ''), zelle_tag = nullif(p_zelle, '') where id = p_org_id;
end;
$$;

-- 3) Note authors: let any org member read the basic profile (full_name, role)
--    of their co-members, so a note written by another manager shows THEIR name
--    instead of the generic "Care team" fallback.
drop policy if exists "read co-org profiles" on profiles;
create policy "read co-org profiles" on profiles for select using (
  id in (
    select om2.profile_id
    from org_members om1
    join org_members om2 on om2.org_id = om1.org_id
    where om1.profile_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
