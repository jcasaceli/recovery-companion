-- Placed signature fields on uploaded documents (iteration 2 of the e-sign
-- forms). `fields` holds the boxes the facilitator placed on the document
-- (signature / initials / date / text, positioned as fractions of the image).
-- `field_values` holds what the resident filled into each box when signing.
alter table agreements add column if not exists fields jsonb;
alter table agreements add column if not exists field_values jsonb;

notify pgrst, 'reload schema';
