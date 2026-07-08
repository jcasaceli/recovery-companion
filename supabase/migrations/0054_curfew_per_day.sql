-- Per-day curfew times. `times` stays as the "same time every day" fallback;
-- `day_times` (when non-empty) overrides it per weekday.
--   day_times = { "0": ["22:00"], "1": ["22:30"], ... }   -- 0 = Sunday … 6 = Saturday
-- A weekday missing from day_times falls back to `times`.
alter table curfews add column if not exists day_times jsonb not null default '{}';

notify pgrst, 'reload schema';
