-- Extra client intake fields: last name, phone (for app-download invite), house.
alter table individuals add column if not exists last_name text;
alter table individuals add column if not exists phone text;
alter table individuals add column if not exists house_name text;
