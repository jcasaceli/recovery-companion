-- Let a resident complete a form from an emailed link, with no app download.
--
-- Most residents never create a login (3 of 31 at the time of writing), so a
-- form assigned to them was effectively unreachable. Each assigned form now
-- carries an unguessable token; the emailed link resolves it server-side
-- (service role only) and lets them fill in + sign that ONE form.
--
-- Security notes:
--   * The token is the credential, so it must be long and random. It is
--     generated server-side (32 random bytes, base64url) — never client-side.
--   * It grants access to exactly one form_responses row. It is NOT a login:
--     it cannot read the resident's other documents, notes, or payments.
--   * No RLS policy is added for it on purpose. The public link is served by
--     the backend using the service role, which scopes every read/write to the
--     single row matching the token. Anon/authenticated clients gain nothing.
--   * Revocable: clear access_token to kill a link that was forwarded or leaked.

alter table form_responses
  add column if not exists access_token text,
  add column if not exists token_created_at timestamptz,
  add column if not exists emailed_at timestamptz,
  add column if not exists completed_via text;   -- 'app' | 'link'

-- One token maps to one form. Partial index: many rows have no token.
create unique index if not exists form_responses_access_token_key
  on form_responses (access_token)
  where access_token is not null;

notify pgrst, 'reload schema';
