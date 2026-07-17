-- Let staff hide an assigned form from the resident with one tap.
--
-- Use cases: prepare a form ahead of time and release it when ready, or pull
-- back one sent by mistake without deleting it and losing the record.
--
-- Enforced in RLS, not just the app: a hidden form must never reach the
-- resident's device. Both the read AND update policies get the check —
-- read alone would still let a resident sign a form they can't see.
-- Staff branches are untouched, so staff always see everything.

alter table form_responses
  add column if not exists hidden_from_member boolean not null default false;

-- Read: staff unchanged; the resident's own row only when not hidden.
-- (Third branch = house-level forms, individual_id is null, staff-only.)
drop policy if exists "read form_responses" on form_responses;
create policy "read form_responses" on form_responses for select using (
  is_facilitator_for(individual_id)
  or (
    individual_id in (select id from individuals where profile_id = auth.uid())
    and hidden_from_member = false
  )
  or (individual_id is null and org_id in (select org_id from org_members where profile_id = auth.uid()))
);

-- Update: same shape. Without the hidden check here a resident could still
-- fill in / sign a form that is hidden from their list.
drop policy if exists "update form_responses" on form_responses;
create policy "update form_responses" on form_responses for update using (
  is_facilitator_for(individual_id)
  or (
    individual_id in (select id from individuals where profile_id = auth.uid())
    and hidden_from_member = false
  )
  or (individual_id is null and org_id in (select org_id from org_members where profile_id = auth.uid()))
);

notify pgrst, 'reload schema';
