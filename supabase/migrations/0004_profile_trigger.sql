-- Auto-create a profiles row when a new auth user signs up. Runs as the table
-- owner (SECURITY DEFINER), so it isn't blocked by RLS and works even before
-- the email is confirmed (when there is no session yet). Profile fields come
-- from the sign-up metadata the app sends in auth.signUp({ options: { data }}).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, email, phone, verify_channel)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'individual'),
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'verify_channel')::verify_channel
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
