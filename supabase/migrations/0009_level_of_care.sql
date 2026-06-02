-- Level of care for clients (facilitator-set, changeable).
alter table individuals
  add column if not exists level_of_care text
  check (level_of_care in ('detox','residential','php','iop','sober_companion','sober_living'));
