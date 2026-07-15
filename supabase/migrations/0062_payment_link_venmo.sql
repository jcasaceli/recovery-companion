-- More ways for owners to accept payments: a Venmo tag and a "bring your own"
-- payment link (their existing portal / another processor). These sit alongside
-- Stripe, Cash App, and Zelle — residents pick how to pay. The set_org_payment_handles
-- RPC (usable by owners AND managers) is widened to save them.

alter table organizations add column if not exists venmo_tag text;
alter table organizations add column if not exists payment_link text;

drop function if exists set_org_payment_handles(uuid, text, text);
create or replace function set_org_payment_handles(
  p_org_id uuid,
  p_cashapp text,
  p_zelle text,
  p_venmo text default '',
  p_payment_link text default ''
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from org_members where org_id = p_org_id and profile_id = auth.uid()) then
    raise exception 'not a staff member of this org';
  end if;
  update organizations set
    cashapp_tag  = nullif(btrim(p_cashapp), ''),
    zelle_tag    = nullif(btrim(p_zelle), ''),
    venmo_tag    = nullif(btrim(p_venmo), ''),
    payment_link = nullif(btrim(p_payment_link), '')
  where id = p_org_id;
end;
$$;

notify pgrst, 'reload schema';
