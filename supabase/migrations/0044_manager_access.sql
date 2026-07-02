-- Give house managers (non-owner org staff) owner-level operational access.
-- Billing / Stripe stay owner-only.

-- Houses: any org staff can manage (was owner-only).
drop policy if exists "owner writes houses" on houses;
drop policy if exists "staff writes houses" on houses;
create policy "staff writes houses" on houses for all
  using (org_id in (select org_id from org_members where profile_id = auth.uid()))
  with check (org_id in (select org_id from org_members where profile_id = auth.uid()));

-- Payment handles: staff can set CashApp/Zelle via a safe RPC that touches only
-- those two columns — the organizations UPDATE policy stays owner-only, so
-- billing (subscription_status) and the join code can't be changed by managers.
create or replace function set_org_payment_handles(p_cashapp text, p_zelle text)
returns void language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  select org_id into oid from org_members where profile_id = auth.uid() limit 1;
  if oid is null then raise exception 'not a staff member'; end if;
  update organizations set cashapp_tag = nullif(p_cashapp, ''), zelle_tag = nullif(p_zelle, '') where id = oid;
end;
$$;

notify pgrst, 'reload schema';
