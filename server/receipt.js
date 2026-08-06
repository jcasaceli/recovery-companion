/**
 * Payment receipt email. When an owner/manager records or confirms a payment,
 * they can email the resident a professional, org-branded receipt.
 *
 * POST /api/receipt  { paymentId }
 *   → emails the resident (email on file) a receipt showing the ORG's name,
 *     the amount, how they paid, the date, and — if a third party paid — who.
 *     Reply-to is the org's own contact email, so it reads as if it came from
 *     the sober living itself.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SEND_FROM_ADDR = process.env.WELCOME_FROM_ADDR || 'joseph@mail.soberlivingdirectory.com';

const METHOD = { cash: 'Cash', cashapp: 'CashApp', zelle: 'Zelle', venmo: 'Venmo', card: 'Card', check: 'Check', other: 'Other' };

function money(cents) { return `$${((cents || 0) / 100).toFixed(2)}`; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function getUser(req) {
  if (!supabaseAdmin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

export const receiptRouter = Router();

receiptRouter.post('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'not configured' });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const { paymentId } = req.body || {};
    if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

    const { data: pay } = await supabaseAdmin
      .from('payments')
      .select('id, individual_id, org_id, amount_cents, method, status, paid_at, third_party_name')
      .eq('id', paymentId).maybeSingle();
    if (!pay) return res.json({ sent: false, error: 'Payment not found.' });

    // Authorization: caller must be a member of the payment's org.
    const orgId = pay.org_id;
    if (orgId) {
      const { data: me } = await supabaseAdmin
        .from('org_members').select('profile_id').eq('org_id', orgId).eq('profile_id', user.id).maybeSingle();
      if (!me) return res.status(403).json({ error: 'Not authorized.' });
    }

    const { data: ind } = await supabaseAdmin
      .from('individuals').select('first_name, last_name, email').eq('id', pay.individual_id).maybeSingle();
    if (!ind?.email) return res.json({ sent: false, error: 'no_email' });

    const { data: org } = await supabaseAdmin
      .from('organizations').select('name, contact_email, contact_phone, address, logo_url').eq('id', orgId).maybeSingle();

    const orgName = org?.name || 'Your Sober Living';
    const resident = `${ind.first_name || ''} ${ind.last_name || ''}`.trim() || 'Resident';
    const when = pay.paid_at ? new Date(pay.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const methodLabel = METHOD[pay.method] || pay.method || 'Payment';
    const paidByLine = pay.third_party_name
      ? `<tr><td style="padding:6px 0;color:#6b7280">Paid by</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(pay.third_party_name)} (on behalf of ${esc(resident)})</td></tr>`
      : '';
    const orgContact = [org?.contact_phone, org?.contact_email, org?.address].filter(Boolean).map(esc).join(' · ');
    const logo = org?.logo_url
      ? `<img src="${esc(org.logo_url)}" alt="" width="48" height="48" style="border-radius:8px;display:block;margin:0 auto 8px">`
      : '';

    const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#16242a">
      <div style="border:1px solid #e4eaec;border-radius:14px;overflow:hidden">
        <div style="background:#0E5F5A;color:#fff;padding:22px 24px;text-align:center">
          ${logo}
          <div style="font-weight:800;font-size:18px">${esc(orgName)}</div>
          <div style="opacity:.85;font-size:13px;margin-top:2px">Payment Receipt</div>
        </div>
        <div style="padding:24px">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Receipt for</p>
          <p style="margin:0 0 18px;font-size:16px;font-weight:700">${esc(resident)}</p>
          <div style="background:#f6f9fb;border-radius:10px;padding:14px 16px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#6b7280">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:800;font-size:18px;color:#0E5F5A">${money(pay.amount_cents)}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Method</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(methodLabel)}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(when)}</td></tr>
              ${paidByLine}
              <tr><td style="padding:6px 0;color:#6b7280">Status</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#15807A">PAID ✓</td></tr>
            </table>
          </div>
          <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.5">Thank you for your payment. Please keep this receipt for your records.${orgContact ? `<br><br>${orgContact}` : ''}</p>
        </div>
      </div>
      <p style="text-align:center;color:#9aa4a9;font-size:11px;margin:14px 0 0">Sent via Sober Living Companion on behalf of ${esc(orgName)}.</p>
    </div>`;

    if (!RESEND_API_KEY) return res.json({ sent: false, error: 'email not configured' });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${orgName} <${SEND_FROM_ADDR}>`,
        to: [ind.email],
        reply_to: org?.contact_email || undefined,
        subject: `Payment receipt — ${money(pay.amount_cents)} to ${orgName}`,
        html,
      }),
    });
    const data = await r.json().catch(() => ({}));
    return res.json({ sent: r.ok, id: data.id, error: r.ok ? undefined : (data?.message || 'send failed') });
  } catch (e) {
    console.error('[receipt]', e);
    return res.status(500).json({ error: e.message });
  }
});
