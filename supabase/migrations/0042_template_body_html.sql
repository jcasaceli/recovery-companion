-- Reusable rich-text agreement templates: store the CRM-editor HTML on the
-- template so facilitators can save a written agreement, reuse it, and edit it
-- later in the same Word-style text box.
alter table form_templates add column if not exists body_html text;

notify pgrst, 'reload schema';
