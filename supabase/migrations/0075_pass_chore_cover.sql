-- Pass requests: optional "who's covering your chores while you're out?" field.
-- Org-scoped opt-in so it only appears for homes that want it (currently just
-- Rise & Thrive Transitional Living). Off for every other org by default.

alter table passes add column if not exists chore_cover text;

alter table organizations add column if not exists passes_ask_chore boolean not null default false;

-- Enable the chore-coverage question for Rise & Thrive Transitional Living only.
update organizations set passes_ask_chore = true
  where id = '0cd7b183-e818-4ceb-be27-616ab459dd20';

notify pgrst, 'reload schema';
