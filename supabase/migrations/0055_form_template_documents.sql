-- Let uploaded documents (a photo/scan/PDF with placed signature/date/text
-- fields) be saved as reusable form templates — so an operator uploads and
-- places fields once, then reuses the same document for future residents.
alter table form_templates add column if not exists document_data text;    -- base64 data URI of page 1
alter table form_templates add column if not exists document_pages jsonb;  -- base64 pages when multi-page

notify pgrst, 'reload schema';
