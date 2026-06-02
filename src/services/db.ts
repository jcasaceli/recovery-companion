/**
 * Supabase data-access adapter — the single integration point between the app
 * and the cloud backend. Dormant until EXPO_PUBLIC_SUPABASE_* are set; the
 * prototype keeps running on the local store (src/state/store.tsx) until you
 * cut the store over to call these functions.
 *
 * Covers: auth (email + SMS OTP), profiles, individuals, progress data, tasks,
 * notes, the sobriety-reset RPC (facilitator-only audit), meetings, and push
 * token storage. All access is enforced server-side by the RLS policies in
 * supabase/migrations/0001_init.sql.
 */

import { supabase } from './supabase';
import {
  AppRole,
  Task,
  Note,
  NoteVisibility,
  TaskRecurrence,
  Meeting,
  SobrietyReset,
  MoodLevel,
} from '../types';

function db() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return supabase;
}

// ---------------------------------------------------------------------------
// Auth + profile
// ---------------------------------------------------------------------------

export interface SignUpInput {
  email: string;
  password: string;
  role: AppRole;
  fullName: string;
  phone?: string;
  /** Which channel the user chose to verify with. */
  verifyChannel: 'email' | 'sms';
}

/**
 * Create an account. Supabase emails a verification link automatically when
 * email confirmation is enabled. We then upsert the profile row. If the user
 * chose SMS verification, follow up with requestSmsOtp(phone).
 */
export async function signUp(input: SignUpInput) {
  // Pass profile fields as user metadata. A database trigger
  // (handle_new_user) creates the profiles row server-side, so this works even
  // before the email is confirmed (when there's no session yet).
  const { data, error } = await db().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        role: input.role,
        full_name: input.fullName,
        phone: input.phone ?? null,
        verify_channel: input.verifyChannel,
      },
    },
  });
  if (error) throw error;

  // If we already have a session (email confirmation OFF), create the profile
  // row from the client too. This works regardless of whether the DB trigger
  // (migration 0004) is installed. Idempotent with the trigger via upsert.
  if (data.session && data.user) {
    const { error: pErr } = await db().from('profiles').upsert({
      id: data.user.id,
      role: input.role,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      verify_channel: input.verifyChannel,
    });
    if (pErr) console.warn('[db] profile upsert after signup failed', pErr.message);
  }
  return data;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Send a one-time code / magic link to the email. */
export async function requestEmailOtp(email: string) {
  const { error } = await db().auth.signInWithOtp({ email });
  if (error) throw error;
}

/**
 * Send a one-time code over SMS.
 * NOTE: requires an SMS provider (e.g. Twilio) configured in Supabase Auth.
 * Until then this will error — that's the "stub" boundary for SMS.
 */
export async function requestSmsOtp(phone: string) {
  const { error } = await db().auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await db().auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data;
}

export async function verifySmsOtp(phone: string, token: string) {
  const { data, error } = await db().auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await db().auth.signOut();
}

export async function getSession() {
  const { data } = await db().auth.getSession();
  return data.session;
}

export async function getMyProfile() {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return null;
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', u.user.id)
    .maybeSingle(); // null instead of throwing when the row doesn't exist
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Individuals
// ---------------------------------------------------------------------------

/** Facilitator: every individual in their org. */
export async function listFacilitatorIndividuals() {
  const { data, error } = await db().from('individuals').select('*');
  if (error) throw error;
  return data;
}

/** Individual/supporter: the individual record(s) they're linked to. */
export async function listMyIndividuals() {
  const { data, error } = await db()
    .from('care_relationships')
    .select('individual_id, relation, individuals(*)');
  if (error) throw error;
  return data;
}

/**
 * Resolve the individual record the current user works with.
 * - individual/supporter: their first linked individual (via care_relationships)
 * - facilitator: the first individual in their org (UI can later let them pick)
 * Returns { individualId, record } or null if none yet.
 */
export async function resolveMyIndividual(): Promise<{ individualId: string; record: any } | null> {
  const profile = await getMyProfile();
  if (!profile) return null;
  if (profile.role === 'facilitator') {
    const rows = await listFacilitatorIndividuals();
    if (rows && rows.length) return { individualId: rows[0].id, record: rows[0] };
    return null;
  }
  const links = await listMyIndividuals();
  const first = (links ?? [])[0] as any;
  if (first?.individuals) return { individualId: first.individual_id, record: first.individuals };
  return null;
}

/** Facilitator onboarding: ensure the facilitator has an org (create if none). */
export async function ensureFacilitatorOrg(name: string): Promise<string> {
  const { data: u } = await db().auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('not signed in');
  const { data: existing } = await db()
    .from('org_members')
    .select('org_id')
    .eq('profile_id', uid)
    .limit(1);
  if (existing && existing.length) return existing[0].org_id as string;
  // organizations.created_by defaults to auth.uid(); the "creator sees org"
  // SELECT policy lets the returning-select succeed.
  const { data: org, error } = await db()
    .from('organizations')
    .insert({ name, created_by: uid })
    .select('id')
    .single();
  if (error) throw error;
  const { error: mErr } = await db()
    .from('org_members')
    .insert({ org_id: org.id, profile_id: uid, is_owner: true });
  if (mErr) throw mErr;
  return org.id as string;
}

/** Create an individual care record (facilitator). No returning-select: the
 *  store reloads afterward and finds the new client via a normal query. This
 *  avoids the RLS-on-returning issue (is_facilitator_for can't see the row that
 *  was just inserted within the same statement). */
export async function createIndividual(input: {
  orgId: string;
  firstName: string;
  programName?: string;
  treatmentStartDate?: string;
  sobrietyDate?: string;
}): Promise<void> {
  const { error } = await db()
    .from('individuals')
    .insert({
      org_id: input.orgId,
      first_name: input.firstName,
      program_name: input.programName ?? null,
      treatment_start_date: input.treatmentStartDate ?? null,
      sobriety_date: input.sobrietyDate ?? null,
    });
  if (error) throw error;
}

export async function setCommunityAccess(individualId: string, allowed: boolean) {
  const { error } = await db()
    .from('individuals')
    .update({ community_access: allowed })
    .eq('id', individualId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Progress data
// ---------------------------------------------------------------------------

export async function addCheckIn(
  individualId: string,
  mood: MoodLevel,
  note: string,
  tags: string[],
) {
  const { error } = await db().from('check_ins').insert({
    individual_id: individualId,
    mood,
    note: note || null,
    tags,
    date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

export async function listCheckIns(individualId: string) {
  const { data, error } = await db()
    .from('check_ins')
    .select('*')
    .eq('individual_id', individualId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(individualId: string): Promise<Task[]> {
  const { data, error } = await db()
    .from('tasks')
    .select('*, profiles:created_by(full_name, role)')
    .eq('individual_id', individualId)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function addTask(
  individualId: string,
  t: { title: string; description?: string; dueDate?: string; recurrence: TaskRecurrence },
) {
  const { data: u } = await db().auth.getUser();
  const { data, error } = await db()
    .from('tasks')
    .insert({
      individual_id: individualId,
      created_by: u.user?.id ?? null,
      title: t.title,
      description: t.description ?? null,
      due_date: t.dueDate ?? null,
      recurrence: t.recurrence,
    })
    .select('*, profiles:created_by(full_name, role)')
    .single();
  if (error) throw error;
  return mapTask(data);
}

export async function setTaskCompleted(taskId: string, completed: boolean) {
  const { error } = await db()
    .from('tasks')
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq('id', taskId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function listNotes(individualId: string): Promise<Note[]> {
  const { data, error } = await db()
    .from('notes')
    .select('*, profiles:author_id(full_name, role)')
    .eq('individual_id', individualId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapNote);
}

export async function addNote(
  individualId: string,
  body: string,
  visibility: NoteVisibility,
) {
  const { data: u } = await db().auth.getUser();
  const { data, error } = await db()
    .from('notes')
    .insert({
      individual_id: individualId,
      author_id: u.user?.id ?? null,
      body,
      visibility,
    })
    .select('*, profiles:author_id(full_name, role)')
    .single();
  if (error) throw error;
  return mapNote(data);
}

// ---------------------------------------------------------------------------
// Sobriety reset (audit via RPC) + facilitator-only history
// ---------------------------------------------------------------------------

export async function resetSobrietyDate(individualId: string, newDate: string) {
  const { error } = await db().rpc('reset_sobriety_date', {
    target: individualId,
    new_sobriety: newDate,
  });
  if (error) throw error;
}

/** Facilitator-only: reset history for an individual. */
export async function listSobrietyResets(individualId: string): Promise<SobrietyReset[]> {
  const { data, error } = await db()
    .from('sobriety_resets')
    .select('*, profiles:reset_by(full_name)')
    .eq('individual_id', individualId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    oldDate: r.old_date ?? undefined,
    newDate: r.new_date ?? undefined,
    resetByName: r.profiles?.full_name ?? 'Someone',
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Meetings (NA/AA guide)
// ---------------------------------------------------------------------------

export async function listMeetings(
  opts: { region?: string; fellowship?: 'AA' | 'NA' } = {},
): Promise<Meeting[]> {
  let q = db().from('meetings').select('*');
  if (opts.region) q = q.ilike('region', `%${opts.region}%`);
  if (opts.fellowship) q = q.eq('fellowship', opts.fellowship);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    fellowship: m.fellowship,
    name: m.name,
    region: m.region,
    dayOfWeek: m.day_of_week ?? undefined,
    startTime: m.start_time ?? undefined,
    address: m.address ?? undefined,
    isOnline: m.is_online,
    url: m.url ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Milestones, sessions, schedule, community posts
// ---------------------------------------------------------------------------

export async function listMilestones(individualId: string) {
  const { data, error } = await db()
    .from('milestones')
    .select('*')
    .eq('individual_id', individualId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listSessions(individualId: string) {
  const { data, error } = await db()
    .from('treatment_sessions')
    .select('*')
    .eq('individual_id', individualId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listScheduleEvents(individualId: string) {
  const { data, error } = await db()
    .from('schedule_events')
    .select('*')
    .eq('individual_id', individualId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addScheduleEvent(
  individualId: string,
  e: { title: string; date: string; startTime?: string; endTime?: string; location?: string; source: 'manual' | 'photo' },
) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('schedule_events').insert({
    individual_id: individualId,
    created_by: u.user?.id ?? null,
    title: e.title,
    date: e.date,
    start_time: e.startTime ?? null,
    end_time: e.endTime ?? null,
    location: e.location ?? null,
    source: e.source,
  });
  if (error) throw error;
}

export async function listPosts() {
  const { data: u } = await db().auth.getUser();
  const { data, error } = await db()
    .from('community_posts')
    .select('*, profiles:author_id(full_name, role), post_likes(profile_id)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    authorName: p.profiles?.full_name ?? 'Member',
    authorRole: p.profiles?.role ?? 'individual',
    text: p.body,
    imageUri: p.image_path ?? undefined,
    createdAt: p.created_at,
    likes: p.post_likes?.length ?? 0,
    likedByMe: (p.post_likes ?? []).some((l: any) => l.profile_id === u.user?.id),
  }));
}

export async function createPost(body: string, imagePath?: string) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('community_posts').insert({
    author_id: u.user?.id,
    body,
    image_path: imagePath ?? null,
  });
  if (error) throw error;
}

export async function toggleLike(postId: string, like: boolean) {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return;
  if (like) {
    await db().from('post_likes').upsert({ post_id: postId, profile_id: u.user.id });
  } else {
    await db().from('post_likes').delete().eq('post_id', postId).eq('profile_id', u.user.id);
  }
}

// ---------------------------------------------------------------------------
// Push tokens
// ---------------------------------------------------------------------------

export async function savePushToken(token: string, platform: string) {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return;
  const { error } = await db()
    .from('push_tokens')
    .upsert({ profile_id: u.user.id, token, platform }, { onConflict: 'token' });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapTask(r: any): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    dueDate: r.due_date ?? undefined,
    recurrence: r.recurrence,
    completed: r.completed,
    createdByName: r.profiles?.full_name ?? 'Care team',
    createdByRole: (r.profiles?.role as AppRole) ?? 'facilitator',
    createdAt: r.created_at,
  };
}

function mapNote(r: any): Note {
  return {
    id: r.id,
    body: r.body,
    visibility: r.visibility,
    authorName: r.profiles?.full_name ?? 'Care team',
    authorRole: (r.profiles?.role as AppRole) ?? 'facilitator',
    createdAt: r.created_at,
  };
}
