-- Rich-text agreements: a Word-style document body authored in the CRM editor
-- (stored as sanitized HTML) that the resident reads and signs.
alter table agreements add column if not exists body_html text;

notify pgrst, 'reload schema';
