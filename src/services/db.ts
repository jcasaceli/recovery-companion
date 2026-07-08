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
import { nextWeeklyISO } from '../utils/format';
import {
  AppRole,
  Task,
  Note,
  NoteVisibility,
  TaskRecurrence,
  Meeting,
  SobrietyReset,
  MoodLevel,
  Payment,
  PaymentMethod,
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
  /** Sober-living name (required for facilitators). */
  orgName?: string;
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
        org_name: input.orgName ?? null,
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

/** Change the signed-in user's password (no email round-trip needed). */
export async function updatePassword(newPassword: string) {
  const { error } = await db().auth.updateUser({ password: newPassword });
  if (error) throw error;
  // Once they've set their own password, they no longer need to be forced to.
  try {
    const { data: u } = await db().auth.getUser();
    if (u.user) await db().from('profiles').update({ must_change_password: false }).eq('id', u.user.id);
  } catch {}
}

/** Send a password-reset email. We pass an explicit redirectTo so the link
 *  always lands on the live web app — otherwise Supabase falls back to the
 *  project Site URL (which defaulted to localhost). This URL must also be in
 *  the Supabase Auth "Redirect URLs" allowlist. */
const RESET_REDIRECT = 'https://app.soberlivingcompanion.com';
export async function resetPassword(email: string) {
  const { error } = await db().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: RESET_REDIRECT,
  });
  if (error) throw error;
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

/** Update the signed-in user's display name (facilitator, manager, or member). */
export async function updateMyProfileName(fullName: string): Promise<void> {
  const { data: u } = await db().auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await db().from('profiles').update({ full_name: fullName.trim() }).eq('id', uid);
  if (error) throw error;
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
  const { data, error } = await db().from('individuals').select('*').order('first_name');
  if (error) throw error;
  return data;
}

/** Fetch one individual's full record (for the selected client). */
export async function getIndividual(id: string) {
  const { data, error } = await db().from('individuals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Facilitator: move a client between 'in_care' and 'completed'. */
export async function updateClientStatus(id: string, status: 'in_care' | 'completed') {
  const { error } = await db().from('individuals').update({ status }).eq('id', id);
  if (error) throw error;
}

/** Facilitator: change a client's level of care. */
export async function updateClientLevel(id: string, levelOfCare: string | null) {
  const { error } = await db().from('individuals').update({ level_of_care: levelOfCare }).eq('id', id);
  if (error) throw error;
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
  // A member is linked to their record via individuals.profile_id.
  const { data: u } = await db().auth.getUser();
  if (u.user) {
    const { data: own } = await db().from('individuals').select('*').eq('profile_id', u.user.id).maybeSingle();
    if (own) return { individualId: own.id, record: own };
  }
  const links = await listMyIndividuals();
  const first = (links ?? [])[0] as any;
  if (first?.individuals) return { individualId: first.individual_id, record: first.individuals };
  return null;
}

/** Facilitator: get (or generate) a member's join code to share. */
export async function getJoinCode(individualId: string): Promise<string> {
  const { data: ind } = await db().from('individuals').select('join_code').eq('id', individualId).maybeSingle();
  if (ind?.join_code) return ind.join_code;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { error } = await db().from('individuals').update({ join_code: code }).eq('id', individualId);
  if (error) throw error;
  return code;
}

/** Member: redeem a join code to link to their resident record. */
export async function redeemJoinCode(code: string): Promise<string> {
  const { data, error } = await db().rpc('redeem_join_code', { p_code: code.trim() });
  if (error) throw error;
  return data as string;
}

/** Member: redeem the master sober-living code. Optionally pick a house. The
 *  RPC smart-matches an operator-created record by email/phone, else creates one. */
export async function redeemOrgCode(code: string, houseId?: string): Promise<string> {
  const { data, error } = await db().rpc('redeem_org_code', { p_code: code.trim(), p_house_id: houseId ?? null });
  if (error) throw error;
  return data as string;
}

/** The houses behind a join code (so a joining member can pick which one). */
export async function housesForCode(code: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db().rpc('houses_for_code', { p_code: code.trim() });
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

/** Member: leave the sober living they're linked to so they can join another
 *  home with a new code. Unlinks their profile from the resident record. */
export async function leaveSoberLiving(): Promise<void> {
  const { data: u } = await db().auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  const me = await resolveMyIndividual();
  if (!me) return;
  // Remove the care relationship first (while we still pass RLS), then unlink.
  await db().from('care_relationships').delete().eq('individual_id', me.individualId).eq('profile_id', uid);
  const { error } = await db().from('individuals').update({ profile_id: null }).eq('id', me.individualId).eq('profile_id', uid);
  if (error) throw error;
}

/** Member: the name of the HOUSE they actually live in (resolved from house_id,
 *  which is correct even when they joined a different house than the org name).
 *  Falls back to the free-text house field, then the org name. */
export async function getMyHouseName(): Promise<string | null> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return null;
  const { data: ind } = await db()
    .from('individuals')
    .select('house_id, org_id, house_name')
    .eq('profile_id', u.user.id)
    .maybeSingle();
  if (!ind) return null;
  if (ind.house_id) {
    const { data: h } = await db().from('houses').select('name').eq('id', ind.house_id).maybeSingle();
    if (h?.name) return h.name;
  }
  if (ind.house_name) return ind.house_name;
  const { data: org } = await db().from('organizations').select('name').eq('id', ind.org_id).maybeSingle();
  return org?.name ?? null;
}

/** Member: the name of the sober living network/org they're linked to (or null
 *  if they haven't connected a code yet). Used for the "you're now connected to
 *  …" confirmation. RLS policy "resident sees their org" allows this read. */
export async function getMyNetworkName(): Promise<string | null> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return null;
  const { data: ind } = await db().from('individuals').select('org_id').eq('profile_id', u.user.id).maybeSingle();
  if (!ind?.org_id) return null;
  const { data: org } = await db().from('organizations').select('name').eq('id', ind.org_id).maybeSingle();
  return org?.name ?? null;
}

/** Member: record a meeting check-in with current location. */
export async function recordMeetingCheckin(
  individualId: string,
  latitude?: number,
  longitude?: number,
  address?: string,
) {
  const { error } = await db().from('meeting_checkins').insert({
    individual_id: individualId,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    address: address ?? null,
  });
  if (error) throw error;
}

// ── Notification preferences (facilitator/manager) ───────────────────────────

/** Whether the current staff user wants routine resident-activity pushes.
 *  Defaults to OFF — staff opt IN by turning the toggle on. */
export async function getNotifyMemberActivity(): Promise<boolean> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return false;
  const { data } = await db().from('profiles').select('notify_member_activity').eq('id', u.user.id).maybeSingle();
  return data?.notify_member_activity === true;
}

export async function setNotifyMemberActivity(on: boolean) {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return;
  const { error } = await db().from('profiles').update({ notify_member_activity: on }).eq('id', u.user.id);
  if (error) throw error;
}

// ── House meetings / events ──────────────────────────────────────────────────

export interface HouseEvent {
  id: string;
  houseId: string;
  title: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // "19:00"
  mandatory: boolean;
  recurring: boolean; // repeats weekly on the same weekday
  createdAt: string;
}

function mapHouseEvent(r: any): HouseEvent {
  return {
    id: r.id, houseId: r.house_id, title: r.title,
    date: r.event_date, time: r.event_time ?? undefined,
    mandatory: !!r.mandatory, recurring: !!r.recurring, createdAt: r.created_at,
  };
}

/** Staff: add a house meeting / mandatory event. */
export async function createHouseEvent(input: { houseId: string; title: string; date: string; time?: string; mandatory?: boolean; recurring?: boolean }) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('house_events').insert({
    house_id: input.houseId, title: input.title, event_date: input.date,
    event_time: input.time ?? null, mandatory: !!input.mandatory,
    recurring: !!input.recurring, created_by: u.user?.id,
  });
  if (error) throw error;
}

/** House events the caller can see (RLS scopes by house): upcoming one-offs plus
 *  every weekly-recurring meeting, sorted by their next occurrence. */
export async function listHouseEvents(): Promise<HouseEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db()
    .from('house_events')
    .select('*')
    .or(`recurring.eq.true,event_date.gte.${today}`);
  if (error) throw error;
  const rows = (data ?? []).map(mapHouseEvent);
  const next = (e: HouseEvent) => (e.recurring ? nextWeeklyISO(e.date) : e.date);
  return rows.sort((a, b) =>
    next(a).localeCompare(next(b)) || (a.time ?? '~').localeCompare(b.time ?? '~'));
}

export async function deleteHouseEvent(id: string) {
  const { error } = await db().from('house_events').delete().eq('id', id);
  if (error) throw error;
}

// ── Pass forms (overnight / multi-day) ───────────────────────────────────────

export type PassType = 'overnight' | 'multi_day';
export type PassStatus = 'pending' | 'approved' | 'denied';

export interface Pass {
  id: string;
  individualId: string;
  houseId?: string;
  memberName?: string;
  type: PassType;
  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD
  returnTime?: string;      // "HH:MM"
  destination?: string;
  reason?: string;
  contactPhone?: string;
  status: PassStatus;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
}

function mapPass(r: any): Pass {
  const ind = r.individuals;
  return {
    id: r.id, individualId: r.individual_id, houseId: r.house_id ?? undefined,
    memberName: ind ? `${ind.first_name}${ind.last_name ? ` ${ind.last_name}` : ''}` : undefined,
    type: r.type, startDate: r.start_date, endDate: r.end_date,
    returnTime: r.return_time ?? undefined, destination: r.destination ?? undefined,
    reason: r.reason ?? undefined, contactPhone: r.contact_phone ?? undefined,
    status: r.status, reviewedAt: r.reviewed_at ?? undefined, reviewNote: r.review_note ?? undefined,
    createdAt: r.created_at,
  };
}

/** Whether the caller's org has the pass feature enabled (member-readable). */
export async function getPassesEnabled(): Promise<boolean> {
  const me = await resolveMyIndividual();
  const orgId = me?.record?.org_id;
  if (!orgId) return false;
  const { data } = await db().from('organizations').select('passes_enabled').eq('id', orgId).maybeSingle();
  return !!data?.passes_enabled;
}

/** Owner: turn the pass feature on (all members) or off (no members). */
export async function setPassesEnabled(orgId: string, enabled: boolean) {
  const { error } = await db().from('organizations').update({ passes_enabled: enabled }).eq('id', orgId);
  if (error) throw error;
}

/** Member: submit a pass request. */
export async function submitPass(input: {
  type: PassType; startDate: string; endDate: string; returnTime?: string;
  destination?: string; reason?: string; contactPhone?: string;
}) {
  const me = await resolveMyIndividual();
  if (!me) throw new Error('We couldn’t find your member record.');
  const { error } = await db().from('passes').insert({
    org_id: me.record.org_id, individual_id: me.individualId, house_id: me.record.house_id ?? null,
    type: input.type, start_date: input.startDate, end_date: input.endDate,
    return_time: input.returnTime ?? null, destination: input.destination ?? null,
    reason: input.reason ?? null, contact_phone: input.contactPhone ?? null,
  });
  if (error) throw error;
  return { individualId: me.individualId, firstName: me.record.first_name as string | undefined };
}

/** Member: their own pass requests, newest first. */
export async function listMyPasses(): Promise<Pass[]> {
  const me = await resolveMyIndividual();
  if (!me) return [];
  const { data, error } = await db()
    .from('passes').select('*').eq('individual_id', me.individualId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPass);
}

/** Staff: pass requests across the org (RLS scopes to org), newest first. */
export async function listOrgPasses(status?: PassStatus): Promise<Pass[]> {
  let q = db().from('passes')
    .select('*, individuals(first_name,last_name)')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapPass);
}

/** Staff: approve or deny a pass, recording who reviewed it and when. */
export async function reviewPass(id: string, status: 'approved' | 'denied', note?: string) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('passes').update({
    status, review_note: note ?? null, reviewed_by: u.user?.id, reviewed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

/** Member: cancel their own (pending) request. */
export async function cancelPass(id: string) {
  const { error } = await db().from('passes').delete().eq('id', id);
  if (error) throw error;
}

// ── Curfew GPS check-ins ─────────────────────────────────────────────────────

export interface Curfew {
  individualId: string;
  enabled: boolean;
  times: string[];          // ["HH:MM", ...] — the "same every day" fallback
  /** Per-weekday overrides: { "0": ["22:00"], ... } (0=Sun…6=Sat). Empty = same every day. */
  dayTimes?: Record<string, string[]>;
  updatedAt?: string;
}

export interface CurfewCheckin {
  id: string;
  individualId: string;
  checkedAt: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

function mapCurfew(r: any): Curfew {
  const dt = r.day_times && typeof r.day_times === 'object' && !Array.isArray(r.day_times) ? r.day_times : {};
  return {
    individualId: r.individual_id, enabled: !!r.enabled,
    times: Array.isArray(r.times) ? r.times : [],
    dayTimes: dt, updatedAt: r.updated_at,
  };
}

/** The curfew times that apply on a given weekday (0=Sun…6=Sat): a per-day
 *  override if one is set, otherwise the "same every day" list. */
export function curfewTimesForDay(curfew: Pick<Curfew, 'times' | 'dayTimes'>, weekday: number): string[] {
  const override = curfew.dayTimes?.[String(weekday)];
  if (override && override.length) return override;
  // An explicit empty override means "no curfew that day"; only fall back when unset.
  if (curfew.dayTimes && Object.prototype.hasOwnProperty.call(curfew.dayTimes, String(weekday))) return override ?? [];
  return curfew.times;
}

/** True when any per-weekday override is configured. */
export function curfewUsesPerDay(curfew: Pick<Curfew, 'dayTimes'>): boolean {
  return !!curfew.dayTimes && Object.keys(curfew.dayTimes).length > 0;
}
function mapCurfewCheckin(r: any): CurfewCheckin {
  return {
    id: r.id, individualId: r.individual_id, checkedAt: r.checked_at,
    latitude: r.latitude ?? undefined, longitude: r.longitude ?? undefined, address: r.address ?? undefined,
  };
}

/** Staff: read a member's curfew config (null if never set). */
export async function getCurfew(individualId: string): Promise<Curfew | null> {
  const { data, error } = await db().from('curfews').select('*').eq('individual_id', individualId).maybeSingle();
  if (error) throw error;
  return data ? mapCurfew(data) : null;
}

/** Staff: enable/disable curfew for a member and set the check-in times. */
export async function setCurfew(individualId: string, input: { enabled: boolean; times: string[]; dayTimes?: Record<string, string[]> }) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('curfews').upsert({
    individual_id: individualId, enabled: input.enabled,
    times: input.times, day_times: input.dayTimes ?? {},
    created_by: u.user?.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'individual_id' });
  if (error) throw error;
}

/** Member: read their own curfew (null if none / disabled handled by caller). */
export async function getMyCurfew(): Promise<Curfew | null> {
  const me = await resolveMyIndividual();
  if (!me) return null;
  const { data } = await db().from('curfews').select('*').eq('individual_id', me.individualId).maybeSingle();
  return data ? mapCurfew(data) : null;
}

/** Member: log a curfew check-in with their GPS location. */
export async function recordCurfewCheckin(input: { latitude?: number; longitude?: number; address?: string }) {
  const me = await resolveMyIndividual();
  if (!me) throw new Error('We couldn’t find your member record.');
  const { error } = await db().from('curfew_checkins').insert({
    individual_id: me.individualId,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null, address: input.address ?? null,
  });
  if (error) throw error;
  return { individualId: me.individualId, firstName: me.record.first_name as string | undefined };
}

/** Check-ins for one member, newest first (optionally since an ISO timestamp). */
export async function listCurfewCheckins(individualId: string, sinceISO?: string): Promise<CurfewCheckin[]> {
  let q = db().from('curfew_checkins').select('*').eq('individual_id', individualId).order('checked_at', { ascending: false });
  if (sinceISO) q = q.gte('checked_at', sinceISO);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapCurfewCheckin);
}

/** Staff: all enabled curfews in the org, with member names (RLS scopes). */
export async function listOrgCurfews(): Promise<(Curfew & { memberName?: string })[]> {
  const { data, error } = await db()
    .from('curfews').select('*, individuals(first_name,last_name)').eq('enabled', true);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...mapCurfew(r),
    memberName: r.individuals ? `${r.individuals.first_name}${r.individuals.last_name ? ` ${r.individuals.last_name}` : ''}` : undefined,
  }));
}

/** Staff: curfew check-ins across the org since an ISO timestamp (for compliance). */
export async function listOrgCurfewCheckins(sinceISO: string): Promise<CurfewCheckin[]> {
  const { data, error } = await db()
    .from('curfew_checkins').select('*').gte('checked_at', sinceISO).order('checked_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCurfewCheckin);
}

// ── Document storage ─────────────────────────────────────────────────────────

export interface Document {
  id: string;
  individualId: string;
  title: string;
  fileData?: string;        // legacy: base64 data URI (older image docs)
  storagePath?: string;     // path in the 'documents' Storage bucket
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
}

function mapDocument(r: any): Document {
  return {
    id: r.id, individualId: r.individual_id, title: r.title, fileData: r.file_data ?? undefined,
    storagePath: r.storage_path ?? undefined, fileName: r.file_name ?? undefined,
    mimeType: r.mime_type ?? undefined, sizeBytes: r.size_bytes ?? undefined, createdAt: r.created_at,
  };
}

/** Upload bytes to the private documents bucket; returns the storage path. */
export async function uploadDocumentFile(individualId: string, fileName: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = `${individualId}/${Date.now()}_${safe}`;
  const { error } = await db().storage.from('documents').upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

/** A short-lived signed URL to view/download a stored document. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await db().storage.from('documents').createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Documents on a member's file (RLS: staff or the member themselves). */
export async function listDocuments(individualId: string): Promise<Document[]> {
  const { data, error } = await db().from('documents').select('*').eq('individual_id', individualId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDocument);
}

/** Member: their own stored documents. */
export async function listMyDocuments(): Promise<Document[]> {
  const me = await resolveMyIndividual();
  if (!me) return [];
  return listDocuments(me.individualId);
}

/** Staff: store a document on a member's file (Storage file or legacy base64 image). */
export async function createDocument(input: {
  orgId?: string; individualId: string; title: string;
  fileData?: string; storagePath?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
}) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('documents').insert({
    org_id: input.orgId ?? null, individual_id: input.individualId, title: input.title,
    file_data: input.fileData ?? null, storage_path: input.storagePath ?? null,
    file_name: input.fileName ?? null, mime_type: input.mimeType ?? null, size_bytes: input.sizeBytes ?? null,
    created_by: u.user?.id,
  });
  if (error) throw error;
}

export async function deleteDocument(id: string) {
  const { data } = await db().from('documents').select('storage_path').eq('id', id).maybeSingle();
  if (data?.storage_path) await db().storage.from('documents').remove([data.storage_path]);
  const { error } = await db().from('documents').delete().eq('id', id);
  if (error) throw error;
}

// ── Resident profile picture (avatars bucket) ────────────────────────────────

/** Upload avatar bytes to the private avatars bucket; returns the storage path. */
export async function uploadAvatarFile(individualId: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${individualId}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from('avatars').upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  await db().from('individuals').update({ avatar_path: path }).eq('id', individualId);
  return path;
}

/** A short-lived signed URL for an avatar (null if none / no access). */
export async function getAvatarUrl(storagePath?: string | null): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await db().storage.from('avatars').createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Resident: set my own profile picture. */
export async function setMyAvatar(bytes: ArrayBuffer, contentType: string): Promise<string | null> {
  const me = await resolveMyIndividual();
  if (!me) throw new Error('We couldn’t find your member record.');
  return uploadAvatarFile(me.individualId, bytes, contentType);
}

/** Resident: a signed URL for my own avatar (null if none set). */
export async function getMyAvatarUrl(): Promise<string | null> {
  const me = await resolveMyIndividual();
  if (!me) return null;
  return getAvatarUrl(me.record?.avatar_path);
}

// ── Free-text client tags (owners/staff) ─────────────────────────────────────

/** Staff: set the free-text tags on a client (e.g. diagnoses, substances). */
export async function updateClientTags(individualId: string, tags: string[]) {
  const clean = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  const { error } = await db().from('individuals').update({ tags: clean }).eq('id', individualId);
  if (error) throw error;
  return clean;
}

// ── Staff-only attachments (notes + UA results) ──────────────────────────────

/** Upload a STAFF-ONLY attachment (note/UA). Residents can never read this bucket. */
export async function uploadStaffFile(individualId: string, kind: 'notes' | 'ua', fileName: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = `${individualId}/${kind}/${Date.now()}_${safe}`;
  const { error } = await db().storage.from('staff-files').upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

/** Signed URL for a staff-only attachment (null if none / no access). */
export async function getStaffFileUrl(storagePath?: string | null): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await db().storage.from('staff-files').createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── Meeting attendance (staff-recorded) ──────────────────────────────────────

export interface MeetingAttendance {
  id: string;
  individualId: string;
  meetingName: string;
  meetingDate: string;      // YYYY-MM-DD
  attended: boolean;
  note?: string;
  createdAt: string;
}

function mapMeetingAttendance(r: any): MeetingAttendance {
  return {
    id: r.id, individualId: r.individual_id, meetingName: r.meeting_name,
    meetingDate: r.meeting_date, attended: !!r.attended, note: r.note ?? undefined, createdAt: r.created_at,
  };
}

/** Attendance records for a member, newest meeting first (staff or the member). */
export async function listMeetingAttendance(individualId: string): Promise<MeetingAttendance[]> {
  const { data, error } = await db()
    .from('meeting_attendance').select('*').eq('individual_id', individualId).order('meeting_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapMeetingAttendance);
}

/** Staff: record a member's meeting attendance with an optional note. */
export async function addMeetingAttendance(input: { individualId: string; meetingName: string; meetingDate: string; attended: boolean; note?: string }) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('meeting_attendance').insert({
    individual_id: input.individualId, meeting_name: input.meetingName, meeting_date: input.meetingDate,
    attended: input.attended, note: input.note ?? null, created_by: u.user?.id,
  });
  if (error) throw error;
}

export async function deleteMeetingAttendance(id: string) {
  const { error } = await db().from('meeting_attendance').delete().eq('id', id);
  if (error) throw error;
}

// ── Fillable lease / intake forms ────────────────────────────────────────────

export type FormFieldType =
  | 'text' | 'longtext' | 'number' | 'phone' | 'date' | 'yesno' | 'ssn_last4' | 'address'
  // Display-only blocks (no answer collected) used to render legal/agreement text:
  | 'heading' | 'paragraph'
  // Small inline input for the "INITIAL: ___" lines in agreements:
  | 'initial'
  // A signature space — the resident draws their signature for this field.
  | 'signature';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
}

export interface FormTemplate {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  bodyHtml?: string;   // rich-text agreement body (for editable written-agreement templates)
  documentData?: string;    // base64 data URI of an uploaded doc (page 1), if this is a document template
  documentPages?: string[]; // base64 pages when the uploaded doc is multi-page
  createdAt: string;
}

export interface FormResponse {
  id: string;
  individualId?: string;   // undefined for house-level (resident-less) forms
  templateId?: string;
  title: string;
  fields: FormField[];
  answers: Record<string, any>;
  status: 'pending' | 'completed';
  signaturePaths?: string[];
  signerName?: string;
  signedAt?: string;
  signedIp?: string;
  createdAt: string;
}

function mapTemplate(r: any): FormTemplate {
  return {
    id: r.id, title: r.title, description: r.description ?? undefined, fields: r.fields ?? [],
    bodyHtml: r.body_html ?? undefined,
    documentData: r.document_data ?? undefined, documentPages: r.document_pages ?? undefined,
    createdAt: r.created_at,
  };
}
function mapFormResponse(r: any): FormResponse {
  return {
    id: r.id, individualId: r.individual_id, templateId: r.template_id ?? undefined,
    title: r.title, fields: r.fields ?? [], answers: r.answers ?? {}, status: r.status,
    signaturePaths: r.signature_paths ?? undefined, signerName: r.signer_name ?? undefined,
    signedAt: r.signed_at ?? undefined, signedIp: r.signed_ip ?? undefined, createdAt: r.created_at,
  };
}

/** Staff: saved form templates for the org. */
export async function listFormTemplates(): Promise<FormTemplate[]> {
  const { data, error } = await db().from('form_templates').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTemplate);
}

/** Staff: save a reusable form template. Returns the new template id. */
export async function createFormTemplate(input: { title: string; description?: string; fields: FormField[]; bodyHtml?: string; documentData?: string; documentPages?: string[] }): Promise<string | undefined> {
  const { data: u } = await db().auth.getUser();
  const org = await getMyOrg();
  const row: any = {
    org_id: org?.id ?? null, title: input.title, description: input.description ?? null,
    fields: input.fields, created_by: u.user?.id,
  };
  if (input.bodyHtml) row.body_html = input.bodyHtml; // guarded until migration 0042 is applied
  if (input.documentData) row.document_data = input.documentData;   // guarded until migration 0055
  if (input.documentPages) row.document_pages = input.documentPages;
  const { data, error } = await db().from('form_templates').insert(row).select('id').maybeSingle();
  if (error) throw error;
  return data?.id;
}

/** Staff: update an existing template's title/fields/body/document. */
export async function updateFormTemplate(id: string, input: { title?: string; fields?: FormField[]; bodyHtml?: string; documentData?: string; documentPages?: string[] }) {
  const row: any = {};
  if (input.title !== undefined) row.title = input.title;
  if (input.fields !== undefined) row.fields = input.fields;
  if (input.bodyHtml !== undefined) row.body_html = input.bodyHtml;
  if (input.documentData !== undefined) row.document_data = input.documentData;
  if (input.documentPages !== undefined) row.document_pages = input.documentPages;
  const { error } = await db().from('form_templates').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteFormTemplate(id: string) {
  const { error } = await db().from('form_templates').delete().eq('id', id);
  if (error) throw error;
}

// --- Archived templates (org-wide): hide unused templates from the picker. ---
async function orgIdOr(orgId?: string): Promise<string | undefined> {
  if (orgId) return orgId;
  const o = await getMyOrg();
  return o?.id;
}

/** Template keys the org has archived ('bi:<builtin>' or 'cs:<templateId>'). */
export async function listArchivedTemplateKeys(orgId?: string): Promise<string[]> {
  const id = await orgIdOr(orgId);
  if (!id) return [];
  const { data, error } = await db().from('archived_form_templates').select('template_key').eq('org_id', id);
  if (error) return [];
  return (data ?? []).map((r: any) => r.template_key);
}

export async function archiveTemplate(key: string, orgId?: string) {
  const id = await orgIdOr(orgId);
  if (!id) throw new Error('No organization found.');
  const { error } = await db().from('archived_form_templates').upsert({ org_id: id, template_key: key }, { onConflict: 'org_id,template_key' });
  if (error) throw error;
}

export async function unarchiveTemplate(key: string, orgId?: string) {
  const id = await orgIdOr(orgId);
  if (!id) return;
  const { error } = await db().from('archived_form_templates').delete().eq('org_id', id).eq('template_key', key);
  if (error) throw error;
}

/** Staff: assign a form to a resident (snapshots the fields so it's immutable). */
export async function assignForm(input: { individualId: string; orgId?: string; templateId?: string; title: string; fields: FormField[] }) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('form_responses').insert({
    org_id: input.orgId ?? null, individual_id: input.individualId, template_id: input.templateId ?? null,
    title: input.title, fields: input.fields, answers: {}, status: 'pending', created_by: u.user?.id,
  });
  if (error) throw error;
}

/** Staff: create a house-level form (not tied to a resident) to fill in & sign. */
export async function assignHouseForm(input: { orgId: string; templateId?: string; title: string; fields: FormField[] }) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('form_responses').insert({
    org_id: input.orgId, individual_id: null, template_id: input.templateId ?? null,
    title: input.title, fields: input.fields, answers: {}, status: 'pending', created_by: u.user?.id,
  });
  if (error) throw error;
}

/** Staff: house-level forms for the org (individual_id is null). */
export async function listHouseForms(orgId: string): Promise<FormResponse[]> {
  const { data, error } = await db().from('form_responses').select('*').is('individual_id', null).eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapFormResponse);
}

/** Staff: every form response across the org (the Forms hub "submissions" list). */
export async function listOrgFormResponses(): Promise<FormResponse[]> {
  const { data, error } = await db().from('form_responses').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapFormResponse);
}

/** Form responses on a resident's file (staff or the resident). */
export async function listFormResponses(individualId: string): Promise<FormResponse[]> {
  const { data, error } = await db().from('form_responses').select('*').eq('individual_id', individualId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapFormResponse);
}

/** Member: their own assigned forms. */
export async function listMyFormResponses(): Promise<FormResponse[]> {
  const me = await resolveMyIndividual();
  if (!me) return [];
  return listFormResponses(me.individualId);
}

export async function getFormResponse(id: string): Promise<FormResponse | null> {
  const { data, error } = await db().from('form_responses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapFormResponse(data) : null;
}

/** Member: save progress without submitting. */
export async function saveFormAnswers(id: string, answers: Record<string, any>) {
  const { error } = await db().from('form_responses').update({ answers }).eq('id', id);
  if (error) throw error;
}

/** Member: submit + e-sign a form (captures signer, date/time, IP). */
export async function submitFormResponse(id: string, input: { answers: Record<string, any>; signaturePaths: string[]; signerName: string; signedIp?: string }) {
  const { error } = await db().from('form_responses').update({
    answers: input.answers, signature_paths: input.signaturePaths, signer_name: input.signerName,
    signed_ip: input.signedIp ?? null, signed_at: new Date().toISOString(), status: 'completed',
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteFormResponse(id: string) {
  const { error } = await db().from('form_responses').delete().eq('id', id);
  if (error) throw error;
}

// ── Houses (multi-house) ─────────────────────────────────────────────────────

export interface House { id: string; name: string; joinCode?: string; capacity?: number }

async function myStaffOrgId(): Promise<string | null> {
  const { data } = await db().from('org_members').select('org_id').limit(1).maybeSingle();
  return data?.org_id ?? null;
}

/** All houses in the caller's org. */
export async function listHouses(): Promise<House[]> {
  const { data, error } = await db().from('houses').select('id,name,join_code,capacity').order('created_at');
  if (error) throw error;
  return (data ?? []).map((h: any) => ({ id: h.id, name: h.name, joinCode: h.join_code ?? undefined, capacity: h.capacity ?? undefined }));
}

/** Owner: set a house's bed capacity (for occupancy tracking). */
export async function setHouseCapacity(id: string, capacity: number | null): Promise<void> {
  const { error } = await db().from('houses').update({ capacity }).eq('id', id);
  if (error) throw error;
}

/** Owner: create a new house with its own join code. */
export async function createHouse(name: string): Promise<void> {
  const orgId = await myStaffOrgId();
  if (!orgId) throw new Error('No organization found.');
  const code = Math.random().toString(16).slice(2, 8).toUpperCase();
  const { error } = await db().from('houses').insert({ org_id: orgId, name: name.trim(), join_code: code });
  if (error) throw error;
}

export async function renameHouse(id: string, name: string): Promise<void> {
  const { error } = await db().from('houses').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

/** Make sure the operator has at least one house — named after their sober living,
 *  with its own join code. Uses an atomic, advisory-locked RPC so two concurrent
 *  app loads / devices can't each create a duplicate default house. Best-effort. */
export async function ensureDefaultHouse(): Promise<void> {
  try { await db().rpc('ensure_default_house'); }
  catch { /* best effort — falls back silently if the RPC isn't there yet */ }
}

export async function deleteHouse(id: string): Promise<void> {
  const { error } = await db().from('houses').delete().eq('id', id);
  if (error) throw error;
}

/** Profile ids of house managers assigned to a house. */
export async function listHouseStaff(houseId: string): Promise<string[]> {
  const { data, error } = await db().from('house_staff').select('profile_id').eq('house_id', houseId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.profile_id);
}

export async function assignManagerToHouse(houseId: string, profileId: string): Promise<void> {
  const { error } = await db().from('house_staff').upsert({ house_id: houseId, profile_id: profileId }, { onConflict: 'house_id,profile_id' });
  if (error) throw error;
}

export async function removeManagerFromHouse(houseId: string, profileId: string): Promise<void> {
  const { error } = await db().from('house_staff').delete().eq('house_id', houseId).eq('profile_id', profileId);
  if (error) throw error;
}

/** Which houses the current staff member can see (owner = all; manager = assigned). */
export async function getMyHouseScope(): Promise<{ isOwner: boolean; houseIds: string[] }> {
  const { data: u } = await db().auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { isOwner: false, houseIds: [] };
  const { data: m } = await db().from('org_members').select('is_owner').eq('profile_id', uid).maybeSingle();
  if (m?.is_owner) {
    const { data: hs } = await db().from('houses').select('id');
    return { isOwner: true, houseIds: (hs ?? []).map((h: any) => h.id) };
  }
  const { data: hs } = await db().from('house_staff').select('house_id').eq('profile_id', uid);
  return { isOwner: false, houseIds: (hs ?? []).map((r: any) => r.house_id) };
}

// ── Care-team announcements ──────────────────────────────────────────────────

export interface CareTeamMember { name: string; role: string }
export interface Announcement { id: string; authorName?: string; body: string; createdAt: string }

/** The facilitator + house managers for the caller's org (members & staff). */
export async function getCareTeam(): Promise<CareTeamMember[]> {
  const { data, error } = await db().rpc('get_care_team');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    name: r.name,
    role: r.is_owner ? 'Facilitator (Admin)' : 'House manager',
  }));
}

/** Broadcast messages from the care team (newest first). */
export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await db()
    .from('announcements')
    .select('id,author_name,body,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    authorName: r.author_name ?? undefined,
    body: r.body,
    createdAt: r.created_at,
  }));
}

/** Facilitator/manager: post an announcement to everyone in the org. */
export async function postAnnouncement(orgId: string, body: string, authorName?: string) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('announcements').insert({
    org_id: orgId,
    author_id: u.user?.id,
    author_name: authorName ?? null,
    body,
  });
  if (error) throw error;
}

export async function deleteAnnouncement(id: string) {
  const { error } = await db().from('announcements').delete().eq('id', id);
  if (error) throw error;
}

// ── UA / drug-test logs ──────────────────────────────────────────────────────

export type UAResult = 'negative' | 'positive' | 'refused' | 'pending';
export interface UATest {
  id: string;
  individualId: string;
  testedAt: string;       // 'YYYY-MM-DD'
  result: UAResult;
  substances?: string;
  notes?: string;
  dismissed: boolean;
  createdAt: string;
  /** STAFF-ONLY attachment (e.g. lab result photo/PDF). Residents can never open it. */
  attachmentPath?: string;
  attachmentName?: string;
  attachmentMime?: string;
}

function mapUA(r: any): UATest {
  return {
    id: r.id,
    individualId: r.individual_id,
    testedAt: r.tested_at,
    result: (r.result ?? 'negative') as UAResult,
    substances: r.substances ?? undefined,
    notes: r.notes ?? undefined,
    dismissed: !!r.dismissed,
    createdAt: r.created_at,
    attachmentPath: r.attachment_path ?? undefined,
    attachmentName: r.attachment_name ?? undefined,
    attachmentMime: r.attachment_mime ?? undefined,
  };
}

/** Facilitator/manager: log a UA (drug test) result for a resident. */
export async function createUATest(input: {
  orgId?: string;
  individualId: string;
  testedAt?: string;
  result: UAResult;
  substances?: string;
  notes?: string;
  attachment?: { path: string; name: string; mime: string };
}) {
  const { error } = await db().from('ua_tests').insert({
    org_id: input.orgId ?? null,
    individual_id: input.individualId,
    tested_at: input.testedAt ?? new Date().toISOString().slice(0, 10),
    result: input.result,
    substances: input.substances ?? null,
    notes: input.notes ?? null,
    attachment_path: input.attachment?.path ?? null,
    attachment_name: input.attachment?.name ?? null,
    attachment_mime: input.attachment?.mime ?? null,
  });
  if (error) throw error;
}

/** UA history for a resident (facilitator view, or the resident's own). */
export async function listUATests(individualId: string): Promise<UATest[]> {
  const { data, error } = await db()
    .from('ua_tests')
    .select('*')
    .eq('individual_id', individualId)
    .order('tested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapUA);
}

/** Resident: my own UA history. */
export async function listMyUATests(): Promise<UATest[]> {
  const me = await resolveMyIndividual();
  if (!me) return [];
  return listUATests(me.individualId);
}

export async function deleteUATest(id: string) {
  const { error } = await db().from('ua_tests').delete().eq('id', id);
  if (error) throw error;
}

/** Facilitator/manager: clear the positive-UA flag for a resident. */
export async function dismissUAFlags(individualId: string) {
  const { error } = await db()
    .from('ua_tests')
    .update({ dismissed: true })
    .eq('individual_id', individualId)
    .eq('result', 'positive')
    .eq('dismissed', false);
  if (error) throw error;
}

/** Individual IDs that currently have an active positive-UA flag (for badges). */
export async function listFlaggedIndividualIds(): Promise<string[]> {
  const { data, error } = await db()
    .from('ua_tests')
    .select('individual_id')
    .eq('result', 'positive')
    .eq('dismissed', false);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r: any) => r.individual_id)));
}

// ── Membership agreements ────────────────────────────────────────────────────

/** A signature/initials/date/text box placed on the document by the facilitator.
 *  x/y/w/h are fractions (0–1) of the document image so they scale on any screen. */
export interface PlacedField {
  key: string;
  type: 'signature' | 'initials' | 'date' | 'text';
  x: number; y: number; w: number; h: number;
  label?: string;
  required?: boolean;
  page?: number; // 0-based page index for multi-page (PDF) documents
}

export interface Agreement {
  id: string;
  individualId: string;
  title: string;
  documentData?: string;       // base64 data URI of the uploaded document photo (page 1)
  documentPages?: string[];    // per-page images for multi-page (PDF) documents
  bodyHtml?: string;           // rich-text agreement body authored in the CRM editor
  status: 'pending' | 'signed';
  signaturePaths?: string[];   // SVG path strings making up the signature
  signerName?: string;
  signedAt?: string;
  signedIp?: string;
  createdAt: string;
  fields?: PlacedField[];           // signature boxes placed on the document
  fieldValues?: Record<string, any>; // key -> { paths: string[] } | string
}

function mapAgreement(r: any): Agreement {
  return {
    id: r.id,
    individualId: r.individual_id,
    title: r.title,
    documentData: r.document_data ?? undefined,
    documentPages: r.document_pages ?? undefined,
    bodyHtml: r.body_html ?? undefined,
    status: (r.status ?? 'pending') as 'pending' | 'signed',
    signaturePaths: r.signature_paths ?? undefined,
    signerName: r.signer_name ?? undefined,
    signedAt: r.signed_at ?? undefined,
    signedIp: r.signed_ip ?? undefined,
    createdAt: r.created_at,
    fields: r.fields ?? undefined,
    fieldValues: r.field_values ?? undefined,
  };
}

/** Facilitator: upload a membership agreement (document photo/PDF) for a resident. */
export async function createAgreement(input: {
  orgId?: string;
  individualId: string;
  title: string;
  documentData?: string;
  documentPages?: string[];
  bodyHtml?: string;
  fields?: PlacedField[];
}) {
  const row: any = {
    org_id: input.orgId ?? null,
    individual_id: input.individualId,
    title: input.title,
    document_data: input.documentData ?? null,
  };
  // Only reference the `fields` column when placed fields are provided, so plain
  // agreement uploads keep working even before migration 0040 is applied.
  if (input.fields && input.fields.length) row.fields = input.fields;
  if (input.documentPages && input.documentPages.length) row.document_pages = input.documentPages;
  if (input.bodyHtml) row.body_html = input.bodyHtml;
  const { error } = await db().from('agreements').insert(row);
  if (error) throw error;
}

// Light columns for lists (excludes the large document_data blob).
const AGREEMENT_LIST_COLS = 'id,individual_id,title,status,signature_paths,signer_name,signed_at,created_at';

/** Agreements for a given resident (facilitator view, or self if it's the member). */
export async function listAgreements(individualId: string): Promise<Agreement[]> {
  const { data, error } = await db()
    .from('agreements')
    .select(AGREEMENT_LIST_COLS)
    .eq('individual_id', individualId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAgreement);
}

/** All agreements across the facilitator's org (for the dashboard). */
export async function listOrgAgreements(): Promise<Agreement[]> {
  const { data, error } = await db()
    .from('agreements')
    .select(AGREEMENT_LIST_COLS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAgreement);
}

/** All meeting check-ins across the org since a given ISO datetime (dashboard). */
export async function listOrgCheckins(sinceISO: string): Promise<{ individualId: string; createdAt: string }[]> {
  const { data, error } = await db()
    .from('meeting_checkins')
    .select('individual_id, created_at')
    .gte('created_at', sinceISO);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ individualId: r.individual_id, createdAt: r.created_at }));
}

/** Full agreement including the document image (for the view/sign screen). */
export async function getAgreement(id: string): Promise<Agreement | null> {
  const { data, error } = await db().from('agreements').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapAgreement(data) : null;
}

/** Member: agreements assigned to me (resolves my individual record first). */
export async function listMyAgreements(): Promise<Agreement[]> {
  const me = await resolveMyIndividual();
  if (!me) return [];
  return listAgreements(me.individualId);
}

/** Staff: everything a resident has filled into their signed agreements/forms,
 *  as labeled values — for the "Submitted info" panel on their profile. */
export async function getSubmittedInfo(individualId: string): Promise<{ label: string; value: string; type: string; title: string; date: string }[]> {
  const { extractLabeledValues } = await import('../utils/agreementFields');
  const out: { label: string; value: string; type: string; title: string; date: string }[] = [];

  // Only keep MEANINGFUL info — skip signatures and generic un-labeled builder
  // fields ("Text 1", "Number 2") that would clutter the profile. A label counts
  // as meaningful if it's more than a bare field-type word.
  const GENERIC = /^(text|number|date|signature|initials?|checkbox|answer|field)\s*#?\d*$/i;
  const keep = (label: string, value: string) =>
    !!value && !!label && !GENERIC.test(label.trim());

  const { data: ags } = await db()
    .from('agreements')
    .select('title, body_html, field_values, signed_at, created_at, status')
    .eq('individual_id', individualId)
    .eq('status', 'signed');
  for (const a of ags ?? []) {
    if (!a.body_html || !a.field_values) continue;
    for (const f of extractLabeledValues(a.body_html, a.field_values)) {
      if (f.type === 'signature' || !keep(f.label, f.value)) continue;
      out.push({ label: f.label, value: f.value, type: f.type, title: a.title, date: a.signed_at || a.created_at });
    }
  }

  const { data: frs } = await db()
    .from('form_responses')
    .select('title, fields, answers, status, created_at')
    .eq('individual_id', individualId)
    .eq('status', 'completed');
  for (const r of frs ?? []) {
    const fields: any[] = r.fields ?? [];
    const answers: any = r.answers ?? {};
    for (const fld of fields) {
      if (['heading', 'paragraph', 'signature', 'initial'].includes(fld.type)) continue;
      const v = answers[fld.key];
      if (v == null || String(v).trim() === '') continue;
      const value = fld.type === 'yesno' ? (v ? 'Yes' : 'No') : String(v);
      if (!keep(fld.label, value)) continue;
      out.push({ label: fld.label, value, type: fld.type, title: r.title, date: r.created_at });
    }
  }

  // De-dupe by label (keep the most recent value for each field).
  const seen = new Set<string>();
  const deduped = out.sort((a, b) => (a.date < b.date ? 1 : -1)).filter((e) => {
    const k = e.label.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return deduped;
}

/** Member: sign an agreement that has placed fields. Stores each box's value
 *  (signature strokes / typed text) plus the signer name, time, and IP. The
 *  first signature box is also mirrored to signature_paths for list/legacy views. */
export async function signAgreementWithFields(
  id: string,
  fieldValues: Record<string, any>,
  signerName: string,
  signedIp?: string,
) {
  // Mirror the first signature box into signature_paths for the summary view.
  let primary: string[] | undefined;
  for (const v of Object.values(fieldValues)) {
    if (v && Array.isArray((v as any).paths) && (v as any).paths.length) { primary = (v as any).paths; break; }
  }
  const { error } = await db()
    .from('agreements')
    .update({
      field_values: fieldValues,
      signature_paths: primary ?? null,
      signer_name: signerName,
      signed_at: new Date().toISOString(),
      signed_ip: signedIp ?? null,
      status: 'signed',
    })
    .eq('id', id);
  if (error) throw error;
}

/** Member: sign an agreement. Stores the signature strokes + name + timestamp. */
export async function signAgreement(id: string, signaturePaths: string[], signerName: string, signedIp?: string) {
  const { error } = await db()
    .from('agreements')
    .update({
      signature_paths: signaturePaths,
      signer_name: signerName,
      signed_at: new Date().toISOString(),
      signed_ip: signedIp ?? null,
      status: 'signed',
    })
    .eq('id', id);
  if (error) throw error;
}

/** Facilitator: remove an agreement. */
export async function deleteAgreement(id: string) {
  const { error } = await db().from('agreements').delete().eq('id', id);
  if (error) throw error;
}

/** Member: delete one of their own meeting check-ins (e.g. an accidental tap). */
export async function deleteMeetingCheckin(id: string) {
  const { error } = await db().from('meeting_checkins').delete().eq('id', id);
  if (error) throw error;
}

/** Meeting check-ins for a client (optionally since an ISO datetime). */
export async function listMeetingCheckins(individualId: string, sinceISO?: string) {
  let q = db().from('meeting_checkins').select('*').eq('individual_id', individualId).order('created_at', { ascending: false });
  if (sinceISO) q = q.gte('created_at', sinceISO);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    address: r.address ?? undefined,
    createdAt: r.created_at,
  }));
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
  lastName?: string;
  phone?: string;
  email?: string;
  houseName?: string;
  houseId?: string;
  monthlyRentCents?: number;
  rentDueDay?: number;
  programName?: string;
  treatmentStartDate?: string;
  sobrietyDate?: string;
  levelOfCare?: string;
}): Promise<{ id?: string; joinCode: string }> {
  // Generate the per-member join code now so the invite can carry it. When the
  // member redeems THIS code they link to this exact record (agreements/forms
  // follow). A follow-up select (new statement) re-reads the row under RLS.
  const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { error } = await db()
    .from('individuals')
    .insert({
      org_id: input.orgId,
      house_id: input.houseId ?? null,
      first_name: input.firstName,
      last_name: input.lastName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      house_name: input.houseName ?? null,
      monthly_rent_cents: input.monthlyRentCents ?? null,
      rent_due_day: input.rentDueDay ?? null,
      program_name: input.programName ?? null,
      treatment_start_date: input.treatmentStartDate ?? null,
      sobriety_date: input.sobrietyDate ?? null,
      level_of_care: input.levelOfCare ?? null,
      join_code: joinCode,
      status: 'in_care',
    });
  if (error) throw error;
  const { data } = await db().from('individuals').select('id').eq('join_code', joinCode).maybeSingle();
  return { id: data?.id, joinCode };
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

export async function deleteTask(taskId: string) {
  const { error } = await db().from('tasks').delete().eq('id', taskId);
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

/** Facilitator: dismiss (delete) a note/alert. */
export async function deleteNote(noteId: string) {
  const { error } = await db().from('notes').delete().eq('id', noteId);
  if (error) throw error;
}

export async function addNote(
  individualId: string,
  body: string,
  visibility: NoteVisibility,
  attachment?: { path: string; name: string; mime: string },
) {
  const { data: u } = await db().auth.getUser();
  const { data, error } = await db()
    .from('notes')
    .insert({
      individual_id: individualId,
      author_id: u.user?.id ?? null,
      body,
      visibility,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
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
    authorId: p.author_id ?? undefined,
    authorName: p.profiles?.full_name ?? 'Member',
    authorRole: p.profiles?.role ?? 'individual',
    text: p.body,
    imageUri: p.image_path ?? undefined,
    createdAt: p.created_at,
    likes: p.post_likes?.length ?? 0,
    likedByMe: (p.post_likes ?? []).some((l: any) => l.profile_id === u.user?.id),
  }));
}

/** Report a community post as objectionable (content moderation). */
export async function reportPost(postId: string, reason?: string) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('content_reports').insert({
    post_id: postId,
    reporter_id: u.user?.id,
    reason: reason ?? null,
  });
  if (error) throw error;
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
// Payments + org settings (CashApp/Zelle), rent settings
// ---------------------------------------------------------------------------

/** Facilitator: their org row (for CashApp/Zelle + settings). */
export async function getMyOrg() {
  const { data: members } = await db().from('org_members').select('org_id');
  if (!members || !members.length) return null;
  const ids = members.map((m: any) => m.org_id);
  const { data: orgs } = await db().from('organizations').select('*').in('id', ids);
  if (!orgs || !orgs.length) return null;
  // A house manager may also have a stray auto-created demo org — always prefer a
  // subscribed org so they get the same access as the owner (no extra cost).
  const active = orgs.find((o: any) => o.subscription_status === 'active' || o.subscription_status === 'trialing');
  return active || orgs[0];
}

export async function setOrgPaymentHandles(orgId: string, cashapp: string, zelle: string) {
  // RPC so house managers (not just the owner) can set handles, without being
  // able to change billing/join-code. Pass the explicit org so it lands on the
  // org the owner is viewing (not an arbitrary membership).
  const { error } = await db().rpc('set_org_payment_handles', { p_org_id: orgId, p_cashapp: cashapp || '', p_zelle: zelle || '' });
  if (error) throw error;
}

/** Facilitator: merge a duplicate resident (mergeId) into this one (keepId).
 *  Moves the login + all their data over, then deletes the duplicate. */
export async function mergeMembers(keepId: string, mergeId: string) {
  const { error } = await db().rpc('merge_individuals', { p_keep: keepId, p_merge: mergeId });
  if (error) throw error;
}

/** Facilitator: edit a client's details. */
export async function updateClient(
  id: string,
  fields: { firstName?: string; lastName?: string; phone?: string; email?: string; houseName?: string },
) {
  const row: any = {};
  if (fields.firstName !== undefined) row.first_name = fields.firstName;
  if (fields.lastName !== undefined) row.last_name = fields.lastName || null;
  if (fields.phone !== undefined) row.phone = fields.phone || null;
  if (fields.email !== undefined) row.email = fields.email || null;
  if (fields.houseName !== undefined) row.house_name = fields.houseName || null;
  const { error } = await db().from('individuals').update(row).eq('id', id);
  if (error) throw error;
}

/** Facilitator: set a member's monthly rent + due day. */
export async function setMemberRent(individualId: string, amountCents: number | null, dueDay: number | null) {
  const { error } = await db()
    .from('individuals')
    .update({ monthly_rent_cents: amountCents, rent_due_day: dueDay })
    .eq('id', individualId);
  if (error) throw error;
}

/** Facilitator: assign a member's bed label and move-in (intake) date. */
export async function setMemberBed(individualId: string, fields: { bedLabel?: string | null; moveInDate?: string | null; houseId?: string | null }) {
  const row: any = {};
  if (fields.bedLabel !== undefined) row.bed_label = fields.bedLabel || null;
  if (fields.moveInDate !== undefined) row.move_in_date = fields.moveInDate || null;
  if (fields.houseId !== undefined) row.house_id = fields.houseId || null;
  const { error } = await db().from('individuals').update(row).eq('id', individualId);
  if (error) throw error;
}

/** Facilitator: discharge a member — frees their bed and marks them completed. */
export async function dischargeMember(individualId: string, dischargeDate: string) {
  const { error } = await db().from('individuals')
    .update({ status: 'completed', discharge_date: dischargeDate, bed_label: null })
    .eq('id', individualId);
  if (error) throw error;
}

/** Facilitator: re-admit a previously discharged member. */
export async function readmitMember(individualId: string) {
  const { error } = await db().from('individuals')
    .update({ status: 'in_care', discharge_date: null })
    .eq('id', individualId);
  if (error) throw error;
}

/** Record a payment (facilitator manual entry, or member-reported CashApp/Zelle). */
export async function recordPayment(p: {
  individualId: string;
  orgId?: string;
  amountCents: number;
  method: PaymentMethod;
  onTime?: boolean;
  periodMonth?: string;
  paidAt?: string;
  /** 'paid' (facilitator-confirmed) or 'reported' (member said they paid). */
  status?: 'paid' | 'reported';
}) {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from('payments').insert({
    individual_id: p.individualId,
    org_id: p.orgId ?? null,
    amount_cents: p.amountCents,
    method: p.method,
    status: p.status ?? 'paid',
    on_time: p.onTime ?? null,
    period_month: p.periodMonth ?? null,
    source: 'manual',
    paid_at: p.paidAt ?? new Date().toISOString(),
    created_by: u.user?.id ?? null,
  });
  if (error) throw error;
}

/** Facilitator: confirm a member-reported CashApp/Zelle payment. */
export async function confirmPayment(paymentId: string) {
  const { error } = await db().from('payments').update({ status: 'paid' }).eq('id', paymentId);
  if (error) throw error;
}

/** Facilitator: all payments across their clients (newest first). */
export async function listOrgPayments(): Promise<Payment[]> {
  const { data, error } = await db()
    .from('payments')
    .select('*, individuals:individual_id(first_name)')
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPayment);
}

/** Member: their own payment history. */
export async function listMyPayments(individualId: string): Promise<Payment[]> {
  const { data, error } = await db()
    .from('payments')
    .select('*')
    .eq('individual_id', individualId)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPayment);
}

/** Member: rent + org payment handles for the Pay rent screen (null if not linked). */
export async function getResidentContext() {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return null;
  const { data: ind } = await db()
    .from('individuals')
    .select('id, org_id, monthly_rent_cents, rent_due_day')
    .eq('profile_id', u.user.id)
    .maybeSingle();
  if (!ind) return null;
  const { data: org } = await db()
    .from('organizations')
    .select('cashapp_tag, zelle_tag, stripe_account_id')
    .eq('id', ind.org_id)
    .maybeSingle();
  return {
    individualId: ind.id,
    rentCents: ind.monthly_rent_cents ?? undefined,
    dueDay: ind.rent_due_day ?? undefined,
    cashapp: org?.cashapp_tag ?? undefined,
    zelle: org?.zelle_tag ?? undefined,
    stripeConnected: !!org?.stripe_account_id,
  };
}

function mapPayment(r: any): Payment {
  return {
    id: r.id,
    individualId: r.individual_id,
    memberName: r.individuals?.first_name,
    amountCents: r.amount_cents,
    method: r.method,
    status: (r.status === 'reported' ? 'reported' : 'paid'),
    onTime: r.on_time ?? undefined,
    periodMonth: r.period_month ?? undefined,
    paidAt: r.paid_at,
  };
}

// ---------------------------------------------------------------------------
// Push tokens
// ---------------------------------------------------------------------------

/** Member: opt in/out of community-post push alerts (stored on profile). */
export async function setCommunityNotify(on: boolean) {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return;
  const { error } = await db().from('profiles').update({ community_notify: on }).eq('id', u.user.id);
  if (error) throw error;
}

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
    authorId: r.author_id ?? undefined,
    authorName: r.profiles?.full_name ?? 'Care team',
    authorRole: (r.profiles?.role as AppRole) ?? 'facilitator',
    createdAt: r.created_at,
    attachmentPath: r.attachment_path ?? undefined,
    attachmentName: r.attachment_name ?? undefined,
    attachmentMime: r.attachment_mime ?? undefined,
  };
}

/** Owner/manager roster for the caller's org (to label who wrote a note), with
 *  real names. Uses a SECURITY DEFINER RPC so the author's name always resolves
 *  even when profile RLS would otherwise hide a co-worker's profile (which is
 *  what made notes read "Care team" instead of the manager's name). */
export async function listOrgStaff(): Promise<{ profileId: string; isOwner: boolean; name?: string }[]> {
  const { data, error } = await db().rpc('get_org_staff');
  if (!error && data) {
    return (data as any[]).map((r) => ({ profileId: r.profile_id, isOwner: !!r.is_owner, name: r.full_name ?? undefined }));
  }
  // Fallback for older backends without the RPC (names may be missing).
  const org = await getMyOrg();
  if (!org?.id) return [];
  const { data: m } = await db().from('org_members').select('profile_id, is_owner').eq('org_id', org.id);
  return (m ?? []).map((r: any) => ({ profileId: r.profile_id, isOwner: !!r.is_owner }));
}
