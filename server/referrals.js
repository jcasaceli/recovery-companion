// Refer-a-friend.
//
// Deliberately NOT automatic: a referral only becomes 'qualified' when the
// referred org's subscription actually goes active, and an owner approves it
// before any credit is granted. Auto-applying a free month would let a
// self-referral cost real money with nobody looking.

import express from 'express';
import { createClient } from '@supabase/supabase-js';

export const referralsRouter = express.Router();

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@mail.soberlivingdirectory.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'josephbizofficial@gmail.com';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function mail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    return r.ok;
  } catch (e) { console.warn('[referrals] email failed', e?.message); return false; }
}

async function getUser(req) {
  if (!admin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

/** Attribute a brand-new org to whoever referred them. Called right after the
 *  org is created, with the code the new operator entered/arrived with. */
referralsRouter.post('/claim', async (req, res) => {
  if (!admin) return res.status(500).json({ error: 'Server not configured.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });

  const code = String(req.body?.code || '').trim().toUpperCase();
  const orgId = String(req.body?.orgId || '');
  if (!code || !orgId) return res.status(400).json({ error: 'Missing code or org.' });

  // The caller must actually belong to the org they're claiming for.
  const { data: member } = await admin
    .from('org_members').select('profile_id').eq('org_id', orgId).eq('profile_id', user.id).maybeSingle();
  if (!member) return res.status(403).json({ error: 'Not your organization.' });

  const { data: referrer } = await admin
    .from('organizations').select('id, name').eq('referral_code', code).maybeSingle();
  if (!referrer) return res.status(404).json({ error: "That referral code doesn't exist." });
  if (referrer.id === orgId) return res.status(400).json({ error: "You can't refer yourself." });

  // An org can only ever be referred once. If one already exists, report the
  // ACTUAL referrer — returning the newly-claimed name would tell the operator
  // they were credited to someone who won't get the free month.
  const { data: existing } = await admin
    .from('referrals')
    .select('referrer_org_id')
    .eq('referred_org_id', orgId)
    .maybeSingle();
  if (existing) {
    const { data: firstRef } = await admin
      .from('organizations').select('name').eq('id', existing.referrer_org_id).maybeSingle();
    return res.json({
      ok: true,
      alreadyReferred: true,
      referrer: firstRef?.name ?? null,
      message: 'This organization was already referred.',
    });
  }

  const { error } = await admin.from('referrals').insert({
    referrer_org_id: referrer.id,
    referred_org_id: orgId,
    referred_email: user.email || null,
  });
  if (error) {
    // Lost a race to another claim — resolve who actually holds it.
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      const { data: raced } = await admin
        .from('referrals').select('referrer_org_id').eq('referred_org_id', orgId).maybeSingle();
      const { data: rOrg } = raced
        ? await admin.from('organizations').select('name').eq('id', raced.referrer_org_id).maybeSingle()
        : { data: null };
      return res.json({ ok: true, alreadyReferred: true, referrer: rOrg?.name ?? null });
    }
    return res.status(500).json({ error: 'Could not record that referral.' });
  }
  res.json({ ok: true, referrer: referrer.name });
});

/** Called from the Stripe webhook when an org's subscription goes active.
 *  Marks any pending referral as qualified and tells both parties. */
export async function qualifyReferralFor(orgId) {
  if (!admin || !orgId) return;
  const { data: ref } = await admin
    .from('referrals')
    .select('id, referrer_org_id, status')
    .eq('referred_org_id', orgId)
    .maybeSingle();
  if (!ref || ref.status !== 'pending') return;

  await admin.from('referrals')
    .update({ status: 'qualified', qualified_at: new Date().toISOString() })
    .eq('id', ref.id);

  const [{ data: referrer }, { data: referred }] = await Promise.all([
    admin.from('organizations').select('name, created_by').eq('id', ref.referrer_org_id).maybeSingle(),
    admin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ]);

  // Email the referrer that they've earned a month.
  let referrerEmail = null;
  if (referrer?.created_by) {
    const { data: prof } = await admin.from('profiles').select('email').eq('id', referrer.created_by).maybeSingle();
    referrerEmail = prof?.email || null;
  }
  if (referrerEmail) {
    await mail(referrerEmail, 'You earned a free month 🎁', `
      <div style="background:#F7F5F1;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:26px">
          <p style="margin:0 0 14px;font-size:17px">Great news${referrer?.name ? `, ${esc(referrer.name)}` : ''} —</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
            ${esc(referred?.name || 'A sober living you referred')} just started their subscription using your referral link,
            so you've earned <strong>one free month</strong> of Sober Living Companion.
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
            We'll apply the credit to your next invoice. Thank you for spreading the word.
          </p>
          <p style="margin:0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
        </div>
      </div>`);
  }

  // And tell the owner so they can approve the credit.
  await mail(ADMIN_EMAIL, `Referral earned a free month — approve?`, `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <p><strong>${esc(referrer?.name || 'An operator')}</strong> referred <strong>${esc(referred?.name || 'a new org')}</strong>, who just subscribed.</p>
      <p>Status is <strong>qualified</strong> — apply the free month in Stripe, then mark it approved.</p>
      <p style="color:#6b6b6b;font-size:13px">Referral id: ${esc(ref.id)}</p>
    </div>`);
}
