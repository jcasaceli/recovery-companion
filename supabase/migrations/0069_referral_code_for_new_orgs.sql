-- Fix: 0068 backfilled referral codes for orgs that existed at the time, but
-- nothing assigned one to orgs created afterwards — so every new operator would
-- have had no referral link at all.
--
-- A plain column DEFAULT can't recover from the (rare) code collision: the
-- unique index would abort the whole org insert. A BEFORE INSERT trigger can
-- retry, so signup never fails because of a duplicate code.

create or replace function set_referral_code()
returns trigger language plpgsql as $$
declare c text;
begin
  if new.referral_code is not null then return new; end if;
  for i in 1..10 loop
    c := gen_referral_code();
    if not exists (select 1 from organizations where referral_code = c) then
      new.referral_code := c;
      return new;
    end if;
  end loop;
  -- Vanishingly unlikely (30^6 combinations). Leave it null rather than block
  -- signup; the operator simply has no link until one is assigned.
  return new;
end $$;

drop trigger if exists organizations_referral_code on organizations;
create trigger organizations_referral_code
  before insert on organizations
  for each row execute function set_referral_code();

notify pgrst, 'reload schema';
