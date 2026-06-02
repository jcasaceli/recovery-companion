-- Org-level join code (one code per sober living), facilitator org auto-created
-- at signup with a name, member self-join via org code, and meeting check-ins.

alter table organizations add column if not exists join_code text unique;

-- Recreate the signup trigger to ALSO create the facilitator's organization
-- (named from signup) with a join code + owner membership.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid; code text;
begin
  insert into public.profiles (id, role, full_name, email, phone, verify_channel)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'individual'),
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'verify_channel')::verify_channel
  )
  on conflict (id) do nothing;

  if (new.raw_user_meta_data->>'role') = 'facilitator' then
    code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into organizations (name, created_by, join_code)
    values (coalesce(nullif(new.raw_user_meta_data->>'org_name', ''), 'My Sober Living'), new.id, code)
    returning id into new_org;
    insert into org_members (org_id, profile_id, is_owner) values (new_org, new.id, true);
  end if;
  return new;
end;
$$;

-- Member self-joins an org with the org code → creates their resident record.
create or replace function redeem_org_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare oid uuid; iid uuid; nm text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into oid from organizations where upper(join_code) = upper(p_code) limit 1;
  if oid is null then raise exception 'Invalid join code'; end if;
  -- already linked? return it
  select id into iid from individuals where profile_id = auth.uid() limit 1;
  if iid is not null then return iid; end if;
  select coalesce(nullif(full_name, ''), 'Member') into nm from profiles where id = auth.uid();
  insert into individuals (org_id, profile_id, first_name, level_of_care, status)
  values (oid, auth.uid(), split_part(nm, ' ', 1), 'sober_living', 'in_care')
  returning id into iid;
  insert into care_relationships (individual_id, profile_id, relation, consented_at)
  values (iid, auth.uid(), 'individual', now())
  on conflict (individual_id, profile_id) do nothing;
  return iid;
end;
$$;

-- Meeting check-ins (member taps "I'm at a meeting" → location recorded).
create table if not exists meeting_checkins (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  address text,
  created_at timestamptz not null default now()
);
alter table meeting_checkins enable row level security;
drop policy if exists "read meeting_checkins" on meeting_checkins;
create policy "read meeting_checkins" on meeting_checkins
  for select using (can_access(individual_id));
drop policy if exists "member checks in" on meeting_checkins;
create policy "member checks in" on meeting_checkins
  for insert with check (
    exists (select 1 from individuals i where i.id = meeting_checkins.individual_id and i.profile_id = auth.uid())
  );
create index if not exists meeting_checkins_idx on meeting_checkins (individual_id, created_at desc);

-- Members may add their own schedule events too.
drop policy if exists "write schedule" on schedule_events;
create policy "write schedule" on schedule_events
  for insert with check (
    can_access(individual_id) and my_role() in ('facilitator', 'supporter', 'individual')
  );

notify pgrst, 'reload schema';
