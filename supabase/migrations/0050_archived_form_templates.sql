-- Owners & managers can archive form templates they don't use (built-in or
-- custom) to declutter the "Choose a form" picker. Archived state is shared
-- across the whole account (org) and any owner/manager can restore. This only
-- hides templates from the picker — it never touches sent forms or signed
-- paperwork.

create table if not exists archived_form_templates (
  org_id uuid not null references organizations(id) on delete cascade,
  template_key text not null,        -- 'bi:<builtin key>' or 'cs:<custom template id>'
  archived_at timestamptz not null default now(),
  primary key (org_id, template_key)
);

alter table archived_form_templates enable row level security;

drop policy if exists "staff read archived templates" on archived_form_templates;
create policy "staff read archived templates" on archived_form_templates for select using (
  org_id in (select org_id from org_members where profile_id = auth.uid())
);

drop policy if exists "staff write archived templates" on archived_form_templates;
create policy "staff write archived templates" on archived_form_templates for all
  using (org_id in (select org_id from org_members where profile_id = auth.uid()))
  with check (org_id in (select org_id from org_members where profile_id = auth.uid()));

notify pgrst, 'reload schema';
