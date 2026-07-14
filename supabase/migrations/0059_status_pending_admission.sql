-- Pending admissions: public-application applicants are created with
-- status 'pending' and stay out of the Members roster until an owner/manager
-- admits them (-> 'in_care') or declines them (-> 'declined'). Widen the
-- individuals.status check constraint to allow these two new values.

alter table individuals drop constraint if exists individuals_status_check;

alter table individuals
  add constraint individuals_status_check
  check (status in ('in_care', 'completed', 'pending', 'declined'));

notify pgrst, 'reload schema';
