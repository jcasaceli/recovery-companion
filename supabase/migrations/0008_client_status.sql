-- Client lifecycle status for the facilitator's Clients list.
alter table individuals
  add column if not exists status text not null default 'in_care'
  check (status in ('in_care','completed'));
