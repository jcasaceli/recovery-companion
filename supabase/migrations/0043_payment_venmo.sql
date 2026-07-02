-- Allow Venmo as a payment method.
alter table payments drop constraint if exists payments_method_check;
alter table payments add constraint payments_method_check
  check (method in ('card','cashapp','zelle','venmo','cash','other'));

notify pgrst, 'reload schema';
