-- House-level forms: a form_response not tied to any individual resident (e.g. a
-- blank Head of House Agreement or Definition of Terms the operator fills/signs).
-- These rows have individual_id = NULL and are scoped to the org. Staff of the
-- org can read/insert/update/delete them; residents never see them.

alter table form_responses alter column individual_id drop not null;

create index if not exists form_responses_org_idx on form_responses (org_id, created_at desc);

-- Helper: is the caller a member (staff) of this org?
-- (Existing per-resident policies use is_facilitator_for(individual_id); for
--  house-level rows individual_id is null, so we add an org-membership branch.)

drop policy if exists "read form_responses" on form_responses;
create policy "read form_responses" on form_responses for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
  or (individual_id is null and org_id in (select org_id from org_members where profile_id = auth.uid()))
);

drop policy if exists "staff inserts form_responses" on form_responses;
create policy "staff inserts form_responses" on form_responses for insert with check (
  is_facilitator_for(individual_id)
  or (individual_id is null and org_id in (select org_id from org_members where profile_id = auth.uid()))
);

drop policy if exists "update form_responses" on form_responses;
create policy "update form_responses" on form_responses for update using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
  or (individual_id is null and org_id in (select org_id from org_members where profile_id = auth.uid()))
);

drop policy if exists "staff deletes form_responses" on form_responses;
create policy "staff deletes form_responses" on form_responses for delete using (
  is_facilitator_for(individual_id)
  or (individual_id is null and org_id in (select org_id from org_members where profile_id = auth.uid()))
);

notify pgrst, 'reload schema';
