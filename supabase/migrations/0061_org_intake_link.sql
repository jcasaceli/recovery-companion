-- Intake link on every org. Each organization gets a public application URL that
-- the owner/manager can open and share from the app's dashboard. Homes with a
-- hand-built custom page (Sea Change, Resilient) keep theirs; every other home
-- uses the generic /apply?o=<slug> form. The app reads organizations.intake_url.

alter table organizations add column if not exists intake_slug text;
alter table organizations add column if not exists intake_url text;

-- URL-safe slug: org name + short id suffix (keeps it unique, human-readable).
create or replace function gen_intake_slug(p_name text, p_id uuid)
returns text language sql immutable as $$
  select trim(both '-' from
           regexp_replace(lower(coalesce(nullif(trim(p_name), ''), 'home')), '[^a-z0-9]+', '-', 'g'))
         || '-' || substr(replace(p_id::text, '-', ''), 1, 6)
$$;

-- Backfill 1) orgs that already have a custom intake form -> point at that slug.
update organizations o
set intake_slug = f.slug
from intake_forms f
where f.org_id = o.id and o.intake_slug is null;

-- Backfill 2) everyone else -> generate a slug + create an intake_forms row so
-- /api/intake/<slug> resolves.
with need as (select id, name from organizations where intake_slug is null)
insert into intake_forms (slug, org_id, title)
select gen_intake_slug(n.name, n.id), n.id,
       coalesce(nullif(trim(n.name), ''), 'Sober Living') || ' Application'
from need n
on conflict (slug) do nothing;

update organizations o
set intake_slug = gen_intake_slug(o.name, o.id)
where o.intake_slug is null;

-- intake_url: custom homes get their bespoke page; everyone else the generic form.
update organizations set intake_url =
  case
    when intake_slug = 'sea-change' then '/apply-sea-change'
    when intake_slug = 'resilient-recovery' then '/apply-resilient'
    else '/apply?o=' || intake_slug
  end
where intake_url is null or intake_url = '';

-- New orgs: auto-provision a slug + intake_forms row + generic url on creation.
create or replace function provision_intake_for_org()
returns trigger language plpgsql security definer as $$
declare s text;
begin
  s := gen_intake_slug(new.name, new.id);
  insert into intake_forms (slug, org_id, title)
    values (s, new.id, coalesce(nullif(trim(new.name), ''), 'Sober Living') || ' Application')
    on conflict (slug) do nothing;
  update organizations set intake_slug = s, intake_url = '/apply?o=' || s where id = new.id;
  return new;
end $$;

drop trigger if exists trg_provision_intake on organizations;
create trigger trg_provision_intake
  after insert on organizations
  for each row execute function provision_intake_for_org();

notify pgrst, 'reload schema';
