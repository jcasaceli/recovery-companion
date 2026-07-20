-- Refer-a-friend: every operator gets a link; a referral that actually pays
-- earns them a free month.
--
-- The credit is NOT applied automatically. A referral only reaches 'qualified'
-- when the referred org's subscription actually goes active, and an owner still
-- approves it before any money moves — self-referrals and abuse would otherwise
-- cost real money with no review.

-- Short, unambiguous code (no 0/O/1/I) derived from the org id.
create or replace function gen_referral_code()
returns text language sql stable as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random() * 30)::int + 1, 1), '')
  from generate_series(1, 6);
$$;

alter table organizations
  add column if not exists referral_code text;

-- Backfill every existing org, retrying on the (unlikely) collision.
do $$
declare o record; c text;
begin
  for o in select id from organizations where referral_code is null loop
    loop
      c := gen_referral_code();
      begin
        update organizations set referral_code = c where id = o.id;
        exit;
      exception when unique_violation then null;  -- try another code
      end;
    end loop;
  end loop;
end $$;

create unique index if not exists organizations_referral_code_key
  on organizations (referral_code) where referral_code is not null;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references organizations(id) on delete cascade,
  referred_org_id uuid references organizations(id) on delete set null,
  referred_email text,
  -- pending   : signed up using the code, not yet paying
  -- qualified : their subscription went active — the credit is now earned
  -- approved  : you approved it; the free month is granted
  -- rejected  : declined (self-referral, duplicate, etc.)
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  approved_at timestamptz,
  note text,
  constraint referrals_status_check check (status in ('pending', 'qualified', 'approved', 'rejected')),
  -- One org can only ever be referred once.
  constraint referrals_referred_once unique (referred_org_id)
);

create index if not exists referrals_referrer_idx on referrals (referrer_org_id, created_at desc);

alter table referrals enable row level security;

-- An operator can see referrals they made (to track their own credits).
-- Nobody can write from the client: rows are created server-side when a signup
-- uses a code, and only the backend flips status.
drop policy if exists "see own referrals" on referrals;
create policy "see own referrals" on referrals for select using (
  referrer_org_id in (select org_id from org_members where profile_id = auth.uid())
);

notify pgrst, 'reload schema';
