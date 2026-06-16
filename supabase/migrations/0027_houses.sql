-- Multi-house: one account (organization) can run multiple sober living homes.
-- Each house has its own members and its own join code; house managers are
-- assigned to specific houses. This migration is ADDITIVE and backward
-- compatible — existing single-home accounts become one "default" house, and
-- the core access function (is_facilitator_for) is left unchanged, so nothing
-- about current permissions breaks. (Manager-to-house scoping is applied in the
-- app for now and can be hardened in RLS later.)

create table if not exists houses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  join_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists house_staff (
  house_id uuid not null references houses(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (house_id, profile_id)
);

alter table individuals add column if not exists house_id uuid references houses(id) on delete set null;

-- Backfill: one default house per existing org (reusing the org's join code so
-- existing codes keep working), then place existing members into it.
insert into houses (org_id, name, join_code)
select o.id, coalesce(nullif(o.name, ''), 'Main House'), o.join_code
from organizations o
where not exists (select 1 from houses h where h.org_id = o.id);

update individuals i
set house_id = (select h.id from houses h where h.org_id = i.org_id order by h.created_at limit 1)
where i.house_id is null and i.org_id is not null;

-- RLS
alter table houses enable row level security;
drop policy if exists "read houses" on houses;
create policy "read houses" on houses for select using (
  org_id in (select org_id from org_members where profile_id = auth.uid())
  or org_id in (select org_id from individuals where profile_id = auth.uid())
);
drop policy if exists "owner writes houses" on houses;
create policy "owner writes houses" on houses for all
  using (org_id in (select org_id from org_members where profile_id = auth.uid() and is_owner = true))
  with check (org_id in (select org_id from org_members where profile_id = auth.uid() and is_owner = true));

alter table house_staff enable row level security;
drop policy if exists "read house_staff" on house_staff;
create policy "read house_staff" on house_staff for select using (
  house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid()))
);
drop policy if exists "owner writes house_staff" on house_staff;
create policy "owner writes house_staff" on house_staff for all
  using (house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid() and is_owner = true)))
  with check (house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid() and is_owner = true)));

-- Member self-join: accept either a HOUSE code or an org code, and place the
-- new member into the right house.
create or replace function redeem_org_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h_id uuid; o_id uuid; iid uuid; nm text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into iid from individuals where profile_id = auth.uid() limit 1;
  if iid is not null then return iid; end if;

  select id, org_id into h_id, o_id from houses where upper(join_code) = upper(p_code) limit 1;
  if h_id is null then
    select id into o_id from organizations where upper(join_code) = upper(p_code) limit 1;
    if o_id is null then raise exception 'Invalid join code'; end if;
    select id into h_id from houses where org_id = o_id order by created_at limit 1;
  end if;

  select coalesce(nullif(full_name, ''), 'Member') into nm from profiles where id = auth.uid();
  insert into individuals (org_id, house_id, profile_id, first_name, level_of_care, status)
  values (o_id, h_id, auth.uid(), split_part(nm, ' ', 1), 'sober_living', 'in_care')
  returning id into iid;
  insert into care_relationships (individual_id, profile_id, relation, consented_at)
  values (iid, auth.uid(), 'individual', now())
  on conflict (individual_id, profile_id) do nothing;
  return iid;
end;
$$;

notify pgrst, 'reload schema';
