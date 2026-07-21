// Public, no-login form links.
//
// Most residents never install the app, so a form assigned to them used to be
// unreachable. Staff can now email a secure link: the resident opens it in a
// browser, fills the form in, signs, and it saves straight back to their file
// where the owner/managers already look. No download, no account.
//
// The token is the credential, so every route here scopes its query to the one
// form_responses row matching it. There is deliberately no RLS policy for this
// path — only this backend (service role) can resolve a token.

import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const formsRouter = express.Router();

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@mail.soberlivingdirectory.com>';
const SITE = process.env.PUBLIC_SITE_URL || 'https://soberlivingcompanion.com';

/** The signed-in caller, from their Supabase JWT. */
async function getUser(req) {
  if (!admin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

/** Is this user staff (owner or manager) of that org? */
async function isStaffOf(userId, orgId) {
  if (!userId || !orgId) return false;
  const { data } = await admin
    .from('org_members').select('profile_id')
    .eq('org_id', orgId).eq('profile_id', userId).maybeSingle();
  return !!data;
}

const newToken = () => crypto.randomBytes(32).toString('base64url');
const linkFor = (token) => `${SITE}/f.html?t=${encodeURIComponent(token)}`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendFormEmail({ to, firstName, orgName, title, link }) {
  if (!RESEND_API_KEY || !to) return false;
  const html = `
  <div style="background:#F7F5F1;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:26px">
      <p style="margin:0 0 14px;font-size:17px">Hi ${esc(firstName) || 'there'},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
        ${esc(orgName)} sent you a form to complete: <strong>${esc(title)}</strong>.
      </p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="background:#3E8E7E;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">Open and sign the form</a>
      </p>
      <p style="margin:0 0 16px;color:#6b6b6b;font-size:14px;line-height:1.5">
        You can fill this out right in your browser — no app needed. The link is just for you, so please don't forward it.
      </p>
      <p style="margin:0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject: `${title} — ${orgName}`, html }),
    });
    return r.ok;
  } catch (e) {
    console.warn('[forms] resident email failed', e?.message);
    return false;
  }
}

/** Staff: mint (or reuse) a link for an assigned form and email it to the
 *  resident. Called right after the form is assigned in the app. */
formsRouter.post('/:id/send', async (req, res) => {
  if (!admin) return res.status(500).json({ error: 'Server not configured.' });
  const { id } = req.params;

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });

  const { data: form, error } = await admin
    .from('form_responses')
    .select('id, title, access_token, individual_id, org_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !form) return res.status(404).json({ error: 'Form not found.' });
  if (!form.individual_id) return res.status(400).json({ error: 'That form is not assigned to a resident.' });
  // Only staff of the resident's own org may mint/send a link for it.
  if (!(await isStaffOf(user.id, form.org_id))) {
    return res.status(403).json({ error: 'Not your organization.' });
  }

  const { data: person } = await admin
    .from('individuals')
    .select('first_name, email')
    .eq('id', form.individual_id)
    .maybeSingle();
  const { data: org } = await admin
    .from('organizations').select('name').eq('id', form.org_id).maybeSingle();

  // Reuse an existing token so a previously-sent link keeps working.
  const token = form.access_token || newToken();
  if (!form.access_token) {
    await admin.from('form_responses')
      .update({ access_token: token, token_created_at: new Date().toISOString() })
      .eq('id', id);
  }
  const link = linkFor(token);

  if (!person?.email) {
    // No email on file — still return the link so staff can text/hand it over.
    return res.json({ ok: true, link, emailed: false, reason: 'no_email' });
  }
  const emailed = await sendFormEmail({
    to: person.email,
    firstName: person.first_name,
    orgName: org?.name || 'Your sober living',
    title: form.title,
    link,
  });
  if (emailed) await admin.from('form_responses').update({ emailed_at: new Date().toISOString() }).eq('id', id);
  res.json({ ok: true, link, emailed, to: person.email });
});

/** Public: load one form by its token. Returns only what's needed to render. */
formsRouter.get('/public/:token', async (req, res) => {
  if (!admin) return res.status(500).json({ error: 'Server not configured.' });
  const { data: form } = await admin
    .from('form_responses')
    .select('id, title, fields, answers, status, signer_name, signed_at, org_id, individual_id')
    .eq('access_token', req.params.token)
    .maybeSingle();
  if (!form) return res.status(404).json({ error: 'This link is no longer valid.' });

  const { data: org } = await admin
    .from('organizations').select('name, logo_url, address, contact_phone, contact_email').eq('id', form.org_id).maybeSingle();
  const { data: person } = await admin
    .from('individuals').select('first_name').eq('id', form.individual_id).maybeSingle();

  res.json({
    ok: true,
    title: form.title,
    fields: form.fields ?? [],
    answers: form.answers ?? {},
    status: form.status,
    signedAt: form.signed_at,
    orgName: org?.name || 'Your sober living',
    firstName: person?.first_name || '',
    logoUrl: org?.logo_url || '',
    address: org?.address || '',
    phone: org?.contact_phone || '',
    email: org?.contact_email || '',
  });
});

/** Public: save the resident's answers + signature against that one form. */
formsRouter.post('/public/:token', async (req, res) => {
  if (!admin) return res.status(500).json({ error: 'Server not configured.' });
  const { data: form } = await admin
    .from('form_responses')
    .select('id, status')
    .eq('access_token', req.params.token)
    .maybeSingle();
  if (!form) return res.status(404).json({ error: 'This link is no longer valid.' });
  if (form.status === 'completed') return res.status(409).json({ error: 'This form was already signed.' });

  const answers = req.body?.answers;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Missing answers.' });
  const signerName = String(req.body?.signerName || '').trim();
  if (!signerName) return res.status(400).json({ error: 'Please type your name to sign.' });

  const { error } = await admin.from('form_responses').update({
    answers,
    signer_name: signerName,
    signature_paths: Array.isArray(req.body?.signaturePaths) ? req.body.signaturePaths : null,
    signed_at: new Date().toISOString(),
    signed_ip: (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || null,
    status: 'completed',
    completed_via: 'link',
  }).eq('id', form.id);
  if (error) return res.status(500).json({ error: 'Could not save. Please try again.' });

  res.json({ ok: true });
});
