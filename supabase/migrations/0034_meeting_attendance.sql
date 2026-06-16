-- Meeting attendance notes: staff record which meetings a member attended (AA/NA,
-- house meeting, group, etc.) with the date and a note — useful for court/probation
-- reporting. Distinct from member self-check-ins (which are GPS-based). The member
-- can view their own attendance record; staff manage it.

create table if not exists meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  meeting_name text not null,
  meeting_date date not null,
  attended boolean not null default true,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meeting_attendance_idx on meeting_attendance (individual_id, meeting_date desc);

alter table meeting_attendance enable row level security;

drop policy if exists "read meeting_attendance" on meeting_attendance;
create policy "read meeting_attendance" on meeting_attendance for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

drop policy if exists "staff writes meeting_attendance" on meeting_attendance;
create policy "staff writes meeting_attendance" on meeting_attendance for all
  using (is_facilitator_for(individual_id))
  with check (is_facilitator_for(individual_id));

notify pgrst, 'reload schema';
