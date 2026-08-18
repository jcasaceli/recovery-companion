-- Weekly balance accrual (opt-in, per org).
--
-- Until now the Payments tab was a monthly snapshot: it compared payments
-- logged in the current calendar month against a resident's fee. For homes that
-- bill weekly that hid the real picture — unpaid weeks never stacked up, so
-- nothing ever showed as "due". This adds an OPT-IN mode where each weekly
-- resident accrues one fee on every due-day that passes, and unpaid weeks add
-- into a running balance.
--
-- weekly_accrual_enabled: off by default, so every existing operator is
--   completely unaffected. A monthly-only home never sees any change.
-- weekly_accrual_since: stamped the first time the toggle is turned on, and
--   used as the earliest accrual anchor so NOBODY is retroactively back-charged
--   for weeks before they opted in ("today forward"). Kept across re-toggles.

alter table organizations
  add column if not exists weekly_accrual_enabled boolean not null default false,
  add column if not exists weekly_accrual_since date;
