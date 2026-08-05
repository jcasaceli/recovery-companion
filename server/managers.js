/**
 * House managers. The org owner can create additional staff logins that share
 * the facilitator console (manage residents, UAs, payments, agreements) but
 * cannot see billing or manage other managers.
 *
 * House managers are a FREE feature — there is no per-manager charge. Add as
 * many as you need.
 *
 * House managers are modeled as role='facilitator' members of the org with
 * is_owner=false, so the existing is_facilitator_for() RLS already grants them
 * resident access. "Owner" = the profile that created the organization.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WELCOME_FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@mail.soberlivingdirectory.com>';
const APP_STORE = 'https://apps.apple.com/app/sober-living-companion/id6780705094';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app';
const WEB_APP = 'https://app.soberlivingcompanion.com';

function managerHtml({ name, orgName, email, password, isOwner }) {
  const who = name || 'there';
  const house = orgName || 'your sober living';
  const role = isOwner ? 'co-owner' : 'house manager';
  const can = isOwner
    ? 'You have full owner access — manage residents, staff, forms, UAs, payments, and settings.'
    : 'You can manage residents, forms, agreements, UAs, and payments.';
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b">
    <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff;font-weight:800;font-size:18px">🏠 You're a ${role}</div>
    <div style="border:1px solid #e3e0d9;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
      <p style="margin:0 0 12px">Hi ${who}, you've been added as a <strong>${role}</strong> for <strong>${house}</strong> on Sober Living Companion. ${can}</p>
      <p style="margin:0 0 6px;font-weight:700">Sign in with:</p>
      <p style="margin:0 0 4px">Email: <strong>${email}</strong></p>
      <p style="margin:0 0 16px">Temporary password: <strong style="font-size:18px;letter-spacing:1px;color:#2F6B5F">${password}</strong></p>
      <p style="margin:0 0 14px;color:#6b6b6b;font-size:14px">You'll be asked to set your own password the first time you log in.</p>
      <p style="margin:0 0 16px">
        <a href="${WEB_APP}" style="background:#3E8E7E;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Open the web app</a>
        <a href="${APP_STORE}" style="background:#111;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">iPhone</a>
        <a href="${PLAY_STORE}" style="background:#2E9E5B;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Android</a>
      </p>
      <p style="margin:16px 0 0;padding-top:14px;border-top:1px solid #eee;color:#4b4b4b;font-size:14px;line-height:1.6">Need help? Open the <a href="https://soberlivingcompanion.com/docs" style="color:#2F6B5F;font-weight:700">Help tab</a>, watch our <a href="https://soberlivingcompanion.com/guides" style="color:#2F6B5F;font-weight:700">step-by-step guides</a>, or call our support line at <a href="tel:+12133216518" style="color:#2F6B5F;font-weight:700">(213) 321-6518</a>.</p>
      <p style="margin:12px 0 0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
}

async function getUser(req) {
  if (!supabaseAdmin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

/** The org this user is staff of (owner OR manager), or null. Managers get the
 *  same access as owners here; removing the owner is still blocked below. */
async function ownerOrg(userId) {
  const { data: m } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle();
  if (!m?.org_id) return null;
  const { data } = await supabaseAdmin.from('organizations').select('*').eq('id', m.org_id).maybeSingle();
  return data || null;
}

/** House managers are FREE — no Stripe seat is added. We still return the
 *  current manager count for display. */
async function syncManagerSeats(org) {
  const { count } = await supabaseAdmin
    .from('org_members')
    .select('profile_id', { count: 'exact', head: true })
    .eq('org_id', org.id)
    .eq('is_owner', false);
  return { billed: false, seats: count || 0 };
}

function tempPassword() {
  // Short + easy to type: a word + 4 digits (e.g. "Sober4821").
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `Sober${n}`;
}

/** Owners are org_members with is_owner=true. There can be up to MAX_OWNERS in
 *  total (the founder + co-owners); co-owners are FREE and get identical access. */
const MAX_OWNERS = 3;

async function isOwnerOf(orgId, userId) {
  const { data } = await supabaseAdmin
    .from('org_members').select('is_owner')
    .eq('org_id', orgId).eq('profile_id', userId).maybeSingle();
  return !!data?.is_owner;
}

async function ownerCount(orgId) {
  const { count } = await supabaseAdmin
    .from('org_members').select('profile_id', { count: 'exact', head: true })
    .eq('org_id', orgId).eq('is_owner', true);
  return count || 0;
}

export const managersRouter = Router();

// List the owner's house managers.
managersRouter.get('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can manage house managers.' });

  const { data: members } = await supabaseAdmin
    .from('org_members').select('profile_id,is_owner').eq('org_id', org.id);
  const ids = (members || []).map((m) => m.profile_id);
  const ownerIds = new Set((members || []).filter((m) => m.is_owner).map((m) => m.profile_id));
  let managers = [];
  let owners = [];
  if (ids.length) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', ids);
    for (const p of profs || []) {
      const row = { id: p.id, name: p.full_name, email: p.email };
      if (ownerIds.has(p.id)) owners.push(row); else managers.push(row);
    }
  }
  res.json({
    managers,
    owners,
    maxOwners: MAX_OWNERS,
    ownerSlotsLeft: Math.max(0, MAX_OWNERS - ownerIds.size),
    isOwner: ownerIds.has(user.id),
    priceConfigured: false,
  });
});

// Create a new house manager (returns a one-time temp password to share).
/** Build a plus-addressed alias so several managers can share one inbox while
 *  each having their own login: house@gmail.com -> house+john@gmail.com.
 *  `n` disambiguates if that alias is taken too (john2, john3...). Returns null
 *  if the address can't be aliased. */
function plusAlias(email, name, n = 0) {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  const base = email.slice(0, at).split('+')[0]; // never stack +tags
  const first = (String(name).trim().split(/\s+/)[0] || 'user')
    .toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  return `${base}+${first}${n ? n + 1 : ''}@${domain}`;
}

/** Resolve an existing account's user id from its email. Profiles carry the
 *  email for every user, so that's the fast path; fall back to scanning auth. */
async function findUserIdByEmail(email) {
  const { data } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (data?.id) return data.id;
  try {
    for (let page = 1; page <= 20; page++) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      const u = (list?.users || []).find((x) => (x.email || '').toLowerCase() === email);
      if (u) return u.id;
      if (!list || (list.users || []).length < 200) break;
    }
  } catch { /* ignore */ }
  return null;
}

/** Classify an existing user's org memberships relative to the org we want to
 *  add them to. `disposableOrgs` are empty auto/demo orgs we can clean up so
 *  the person can be re-homed here; `blocking` means they already belong to a
 *  real, active organization (the app models one org per person, so we won't
 *  silently move them). */
async function membershipStatus(userId, targetOrgId) {
  const { data: mems } = await supabaseAdmin
    .from('org_members').select('org_id').eq('profile_id', userId);
  const out = { inTarget: false, disposableOrgs: [], blocking: false };
  for (const m of mems || []) {
    if (m.org_id === targetOrgId) { out.inTarget = true; continue; }
    const { data: org } = await supabaseAdmin
      .from('organizations').select('subscription_status').eq('id', m.org_id).maybeSingle();
    const { count } = await supabaseAdmin
      .from('individuals').select('id', { count: 'exact', head: true }).eq('org_id', m.org_id);
    const disposable = (!org || org.subscription_status === 'demo') && (count || 0) === 0;
    if (disposable) out.disposableOrgs.push(m.org_id); else out.blocking = true;
  }
  return out;
}

function reusedHtml({ name, orgName, email }) {
  const who = name || 'there';
  const house = orgName || 'your sober living';
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b">
    <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff;font-weight:800;font-size:18px">🏠 You're a house manager</div>
    <div style="border:1px solid #e3e0d9;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
      <p style="margin:0 0 12px">Hi ${who}, you've been added as a <strong>house manager</strong> for <strong>${house}</strong> on Sober Living Companion.</p>
      <p style="margin:0 0 12px">You already have an account — just sign in with the email and password you already use:</p>
      <p style="margin:0 0 16px">Email: <strong>${email}</strong></p>
      <p style="margin:0 0 14px;color:#6b6b6b;font-size:14px">Forgot your password? Tap "Forgot password?" on the sign-in screen to reset it.</p>
      <p style="margin:0 0 16px">
        <a href="${WEB_APP}" style="background:#3E8E7E;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Open the web app</a>
        <a href="${APP_STORE}" style="background:#111;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">iPhone</a>
        <a href="${PLAY_STORE}" style="background:#2E9E5B;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Android</a>
      </p>
      <p style="margin:16px 0 0;padding-top:14px;border-top:1px solid #eee;color:#4b4b4b;font-size:14px;line-height:1.6">Need help? Open the <a href="https://soberlivingcompanion.com/docs" style="color:#2F6B5F;font-weight:700">Help tab</a>, watch our <a href="https://soberlivingcompanion.com/guides" style="color:#2F6B5F;font-weight:700">step-by-step guides</a>, or call our support line at <a href="tel:+12133216518" style="color:#2F6B5F;font-weight:700">(213) 321-6518</a>.</p>
      <p style="margin:12px 0 0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
}

managersRouter.post('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can add house managers.' });

  const name = (req.body?.name || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  const phone = (req.body?.phone || '').trim();
  const asOwner = req.body?.owner === true;
  // Whether to email the new person their login (temp password + web link + app
  // store links). Defaults ON; the owner can turn it off from the app.
  const sendEmail = req.body?.sendEmail !== false;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  // Co-owners are peers of the founder, so only an owner may create one, and
  // the org is capped at MAX_OWNERS total.
  if (asOwner) {
    if (!(await isOwnerOf(org.id, user.id))) {
      return res.status(403).json({ error: 'Only an owner can add another owner.' });
    }
    const owners = await ownerCount(org.id);
    if (owners >= MAX_OWNERS) {
      return res.status(409).json({ error: `You can have at most ${MAX_OWNERS} owners (you already have ${owners}).` });
    }
  }

  try {
    const password = tempPassword();
    let loginEmail = email;
    let aliased = false;
    let { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail, password, email_confirm: true,
      user_metadata: { role: 'facilitator', full_name: name, phone },
    });

    // The email is already registered. The usual reason is that THIS SAME
    // person already has an account (they signed up themselves, or were added
    // before) — not that a house wants to share one inbox. So by default we
    // REUSE their existing login and attach it to this org, instead of silently
    // minting a confusing "name+tag@" duplicate. (Plus-addressing is still
    // available, but only when the caller explicitly asks via shareInbox:true.)
    if (createErr && /already/i.test(createErr.message) && req.body?.shareInbox !== true) {
      const existingId = await findUserIdByEmail(email);
      if (existingId) {
        const st = await membershipStatus(existingId, org.id);
        if (st.inTarget) {
          return res.status(409).json({ error: 'That person is already on your team.' });
        }
        if (st.blocking) {
          return res.status(409).json({
            error: 'That email already belongs to an active account on another organization. Use a different email for this manager, or have them removed from their other organization first.',
          });
        }
        // Safe to reuse: clear out any empty auto/demo orgs they created, then
        // attach their existing login to THIS org as staff.
        for (const sid of st.disposableOrgs) {
          await supabaseAdmin.from('houses').delete().eq('org_id', sid);
          await supabaseAdmin.from('org_members').delete().eq('org_id', sid);
          await supabaseAdmin.from('organizations').delete().eq('id', sid);
        }
        await supabaseAdmin.from('profiles').upsert(
          { id: existingId, role: 'facilitator', full_name: name, email, phone }, { onConflict: 'id' });
        await supabaseAdmin.from('org_members').upsert(
          { org_id: org.id, profile_id: existingId, is_owner: asOwner }, { onConflict: 'org_id,profile_id' });
        let reuseEmailed = false;
        if (sendEmail && RESEND_API_KEY) {
          reuseEmailed = true;
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: WELCOME_FROM, to: email, reply_to: 'joseph@soberlivingdirectory.com',
              subject: `You've been added to ${org.name || 'Sober Living Companion'}`,
              html: reusedHtml({ name, orgName: org.name, email }),
            }),
          }).then((r) => { if (!r.ok) r.text().then((t) => console.error('[managers] reuse email failed', r.status, t)); })
            .catch((e) => console.error('[managers] reuse email error', e));
        }
        const billing = await syncManagerSeats(org);
        return res.json({ id: existingId, email, reused: true, owner: asOwner, billed: billing.billed, seats: billing.seats, emailed: reuseEmailed, emailConfigured: !!RESEND_API_KEY });
      }
      return res.status(409).json({ error: 'That email is already registered. Please use a different email for this manager.' });
    }

    // Genuine shared-inbox request (shareInbox:true): give this manager their
    // own plus-addressed login (house+john@gmail.com) that still lands in the
    // shared inbox — a distinct account, so every action stays attributable.
    if (createErr && /already/i.test(createErr.message)) {
      for (let i = 0; i < 6; i++) {
        const candidate = plusAlias(email, name, i);
        if (!candidate) break;
        loginEmail = candidate;
        ({ data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: loginEmail, password, email_confirm: true,
          user_metadata: { role: 'facilitator', full_name: name, phone },
        }));
        if (!createErr) { aliased = true; break; }
        if (!/already/i.test(createErr.message)) break; // a real error — stop retrying
      }
    }
    if (createErr) {
      if (/already/i.test(createErr.message)) {
        return res.status(409).json({ error: 'That email already has several accounts. Try a different name or email.' });
      }
      throw createErr;
    }
    const uid = created.user.id;

    // The signup trigger auto-creates an empty demo org for any new facilitator.
    // Remove it so the manager belongs ONLY to the owner's (subscribed) org —
    // otherwise they'd see "activate your sober living" and be locked out.
    const { data: strays } = await supabaseAdmin.from('organizations').select('id').eq('created_by', uid);
    for (const s of strays || []) {
      await supabaseAdmin.from('org_members').delete().eq('org_id', s.id);
      await supabaseAdmin.from('organizations').delete().eq('id', s.id);
    }

    await supabaseAdmin.from('profiles').upsert(
      { id: uid, role: 'facilitator', full_name: name, email: loginEmail, phone, email_verified: true },
      { onConflict: 'id' },
    );
    // Force them to set their own password on first login (best-effort — needs
    // migration 0047; ignored if the column isn't there yet).
    await supabaseAdmin.from('profiles').update({ must_change_password: true }).eq('id', uid);
    await supabaseAdmin.from('org_members').upsert(
      { org_id: org.id, profile_id: uid, is_owner: asOwner },
      { onConflict: 'org_id,profile_id' },
    );

    // Optionally email the new manager/co-owner their login — temp password +
    // "open the web app" link + both app-store download links (see managerHtml).
    let emailed = false;
    if (sendEmail && RESEND_API_KEY) {
      emailed = true;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: WELCOME_FROM,
          to: loginEmail,
          reply_to: 'joseph@soberlivingdirectory.com',
          subject: `Your login for ${org.name || 'Sober Living Companion'}`,
          html: managerHtml({ name, orgName: org.name, email: loginEmail, password, isOwner: asOwner }),
        }),
      }).then((r) => { if (!r.ok) r.text().then((t) => console.error('[managers] email failed', r.status, t)); })
        .catch((e) => console.error('[managers] email error', e));
    } else if (sendEmail && !RESEND_API_KEY) {
      console.warn('[managers] RESEND_API_KEY not set — could not email login to', loginEmail);
    }

    const billing = await syncManagerSeats(org);
    res.json({ id: uid, email: loginEmail, password, aliased, owner: asOwner, sharedWith: aliased ? email : undefined, billed: billing.billed, seats: billing.seats, emailed, emailConfigured: !!RESEND_API_KEY });
  } catch (e) {
    console.error('[managers] create', e);
    res.status(500).json({ error: e.message });
  }
});

// Remove a house manager (deletes their login).
managersRouter.delete('/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can remove house managers.' });

  const targetId = req.params.id;
  try {
    // Only remove if they're actually a non-owner member of this org.
    const { data: m } = await supabaseAdmin
      .from('org_members').select('profile_id,is_owner')
      .eq('org_id', org.id).eq('profile_id', targetId).maybeSingle();
    if (!m || m.is_owner) return res.status(400).json({ error: 'Not a house manager of your org.' });

    await supabaseAdmin.from('org_members').delete().eq('org_id', org.id).eq('profile_id', targetId);
    await supabaseAdmin.auth.admin.deleteUser(targetId).catch(() => {});
    const billing = await syncManagerSeats(org);
    res.json({ ok: true, seats: billing.seats });
  } catch (e) {
    console.error('[managers] delete', e);
    res.status(500).json({ error: e.message });
  }
});
