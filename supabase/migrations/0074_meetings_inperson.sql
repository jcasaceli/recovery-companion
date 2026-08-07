-- In-person meeting search (Phase 1: AA feeds ingested nightly; NA queried live).
-- Holds AA "Meeting Guide" meetings ingested by the backend from public intergroup
-- feeds. NA is fetched live from the BMLT aggregator and is NOT stored here.
-- Only real feed data lands here; the backend skips any feed it can't fetch.

create table if not exists public.meetings_aa (
  id          bigint generated always as identity primary key,
  source      text not null,               -- feed key, e.g. 'aa-san-diego'
  slug        text not null,
  name        text not null,
  day         smallint,                    -- 0=Sun .. 6=Sat (null = varies)
  time        text,                        -- 'HH:MM' 24h
  fellowship  text not null default 'AA',
  types       text[],                      -- Meeting Guide type codes (O, C, ...)
  location    text,
  address     text,                        -- formatted address
  city        text,
  region      text,
  lat         double precision not null,
  lng         double precision not null,
  notes       text,
  url         text,
  timezone    text,
  updated_at  timestamptz not null default now()
);

create index if not exists meetings_aa_lat_lng_idx on public.meetings_aa (lat, lng);
create index if not exists meetings_aa_day_idx     on public.meetings_aa (day);
create unique index if not exists meetings_aa_source_slug_idx on public.meetings_aa (source, slug);

-- Meetings are public info. Allow read to everyone; writes happen only via the
-- backend service-role key (which bypasses RLS), never from the client.
alter table public.meetings_aa enable row level security;

drop policy if exists "public read meetings_aa" on public.meetings_aa;
create policy "public read meetings_aa"
  on public.meetings_aa for select
  using (true);
