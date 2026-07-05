-- Track whether an org connected via Express (new account) or Standard (their
-- existing Stripe account, linked via OAuth). Purely informational for the app.
alter table organizations add column if not exists stripe_account_type text;

notify pgrst, 'reload schema';
