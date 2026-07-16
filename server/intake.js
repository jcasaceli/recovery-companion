/**
 * Public intake / applications.
 *
 * A prospective resident fills a public application form hosted at a custom URL
 * (e.g. https://…/apply/resilient-recovery). That page POSTs the answers here:
 *
 *   POST /api/intake/:slug
 *     body: {
 *       firstName, lastName, phone, email, soberDate, dob, address,   // mapped to columns
 *       avatarDataUrl?,                                               // profile photo (data URL)
 *       pages: [{ title, fields: [{ label, type, value }] }]          // full form, for PDF + storage
 *     }
 *
 * We (service role) look up which org owns this slug, create an UNCLAIMED
 * individual record (profile_id null) with their info, store the full answers,
 * render a PDF of the application onto their profile (Documents — visible to the
 * owner, managers, and the resident), and email the applicant the app invite +
 * the org's join code.
 *
 * Pre-population: because the record carries their email + phone, when they later
 * download the app and redeem the org join code, redeem_org_code() smart-matches
 * (by email or last-10-digits phone) and links THIS record — so their name,
 * sober date, and everything else pre-populate their account automatically.
 */
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INVITE_FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@mail.soberlivingdirectory.com>';
const APP_STORE = 'https://apps.apple.com/app/sober-living-companion/id6780705094';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app';
const WEB_APP = 'https://app.soberlivingcompanion.com';

// ── helpers ──────────────────────────────────────────────────────────────────
function dataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  try { return { mime: m[1], buf: Buffer.from(m[2], 'base64') }; } catch { return null; }
}

function isoDateOrNull(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Pull the medication rows out of a submitted application into the flat list
 *  we keep on individuals.medications — so they show on the resident's profile
 *  from day one, editable later by the resident and by staff.
 *  Accepts either an explicit body.medications array, or med<N>_name /
 *  med<N>_dose fields collected from the form's pages. */
export function medicationsFrom(body) {
  if (Array.isArray(body?.medications)) {
    return Array.from(new Set(body.medications.map((m) => String(m).trim()).filter(Boolean)));
  }
  const byRow = new Map();
  for (const page of body?.pages || []) {
    for (const f of page?.fields || []) {
      const m = /^med(\d+)_(name|dose)$/.exec(f.key || '');
      if (!m || !f.value) continue;
      const row = byRow.get(m[1]) || {};
      row[m[2]] = String(f.value).trim();
      byRow.set(m[1], row);
    }
  }
  const out = [];
  for (const [, row] of [...byRow.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (!row.name) continue; // a dose with no drug name is not a medication
    out.push(row.dose ? `${row.name} — ${row.dose}` : row.name);
  }
  return Array.from(new Set(out));
}

/** Build a PDF Buffer of the whole application (text answers + embedded signatures/photos). */
export function renderPdf({ title, applicantName, submittedAt, pages }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#2F6B5F').fontSize(20).font('Helvetica-Bold').text(title || 'Application');
    doc.moveDown(0.2);
    doc.fillColor('#6B6B6B').fontSize(10).font('Helvetica')
      .text(`${applicantName || 'Applicant'} · Submitted ${submittedAt}`);
    doc.moveDown(0.6);
    doc.moveTo(54, doc.y).lineTo(558, doc.y).strokeColor('#E3E0D9').stroke();
    doc.moveDown(0.6);

    for (const page of pages || []) {
      if (doc.y > 690) doc.addPage();
      doc.fillColor('#2B2B2B').font('Helvetica-Bold').fontSize(13).text(page.title || '');
      doc.moveDown(0.3);
      for (const f of page.fields || []) {
        const label = (f.label || '').trim();
        const type = f.type || 'text';
        const val = f.value;
        if (type === 'signature' || (type === 'image' && typeof val === 'string' && val.startsWith('data:'))) {
          const img = dataUrlToBuffer(val);
          const left = doc.page.margins.left;
          const bottom = doc.page.height - doc.page.margins.bottom;
          const boxH = 78; // reserved height for the signature/image block
          // Label (advances the cursor normally).
          if (label) { doc.fillColor('#6B6B6B').font('Helvetica-Bold').fontSize(9.5).text(label); doc.moveDown(0.15); }
          // Keep the whole block on one page.
          if (doc.y + boxH > bottom) doc.addPage();
          const y = doc.y;
          if (img) {
            // Explicit x/y — .image() does NOT advance doc.y, so we must place it
            // and then move the cursor below it, or the next field overlaps it.
            try { doc.image(img.buf, left, y, { fit: [240, boxH - 14] }); }
            catch { doc.fillColor('#9A9A9A').font('Helvetica-Oblique').fontSize(10).text('(could not render image)', left, y + 22); }
          } else {
            doc.fillColor('#9A9A9A').font('Helvetica-Oblique').fontSize(10).text(type === 'signature' ? '(not signed)' : '(no file uploaded)', left, y + 22);
          }
          // Signature line + advance the cursor safely below the image.
          const lineY = y + boxH - 6;
          doc.moveTo(left, lineY).lineTo(left + 240, lineY).strokeColor('#E3E0D9').lineWidth(0.7).stroke();
          doc.x = left;
          doc.y = lineY + 10;
          continue;
        }
        // checkbox / text / select / date etc.
        let shown = val;
        if (val === true || val === 'true') shown = '✓ Yes';
        else if (val === false || val === 'false' || val === '' || val == null) shown = type === 'checkbox' ? '—' : '(blank)';
        if (doc.y > 700) doc.addPage();
        doc.fillColor('#6B6B6B').font('Helvetica-Bold').fontSize(9.5).text(label || ' ', { continued: false });
        doc.fillColor('#2B2B2B').font('Helvetica').fontSize(11).text(String(shown));
        doc.moveDown(0.35);
      }
      doc.moveDown(0.4);
    }
    doc.end();
  });
}

async function sendApplicantEmail({ to, firstName, orgName, joinCode }) {
  if (!RESEND_API_KEY || !to) return;
  const who = firstName || 'there';
  const house = orgName || 'the sober living';
  const codeBlock = joinCode
    ? `<p style="margin:0 0 8px;font-weight:700">Your join code:</p>
       <p style="margin:0 0 16px;font-size:26px;font-weight:800;letter-spacing:3px;color:#2F6B5F">${joinCode}</p>`
    : '';
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b">
    <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff;font-weight:800;font-size:18px">✅ We got your application</div>
    <div style="border:1px solid #e3e0d9;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
      <p style="margin:0 0 12px">Hi ${who}, thanks for applying to <strong>${house}</strong>. Your application was received.</p>
      <p style="margin:0 0 12px">Download the free Sober Living Companion app and create your account. Use the <strong>same email or phone number</strong> you applied with, then enter your join code — everything you submitted will already be on your account.</p>
      ${codeBlock}
      <p style="margin:0 0 16px">
        <a href="${APP_STORE}" style="background:#111;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Download on iPhone</a>
        <a href="${PLAY_STORE}" style="background:#2E9E5B;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;display:inline-block;margin:0 6px 8px 0">Get it on Android</a>
      </p>
      <p style="margin:0 0 16px;color:#6b6b6b;font-size:14px">No app store? Open the web app: <a href="${WEB_APP}" style="color:#2F6B5F">app.soberlivingcompanion.com</a></p>
      <p style="margin:0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: INVITE_FROM, to, subject: `Your application to ${house}`, html }),
    });
  } catch (e) { console.warn('[intake] applicant email failed', e?.message); }
}

async function notifyOwner({ ownerEmail, orgName, applicantName }) {
  if (!RESEND_API_KEY || !ownerEmail) return;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#2b2b2b">
    <p>📥 <strong>New application</strong> for ${orgName || 'your sober living'}.</p>
    <p><strong>${applicantName || 'A new applicant'}</strong> just submitted an application. Open the app → <strong>Pending Admission</strong> to review it (their full application is saved as a PDF on their profile). Admit them once they check in, or leave them pending.</p>
    <p style="color:#9a9a9a;font-size:12px">Sober Living Companion</p></div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: INVITE_FROM, to: ownerEmail, subject: `New application · ${applicantName || 'applicant'}`, html }),
    });
  } catch (e) { console.warn('[intake] owner notify failed', e?.message); }
}

export const intakeRouter = express.Router();

// Public: look up an intake form by slug — returns the org name + form title so
// the generic hosted application page can brand itself. 404 if the slug is not
// an active intake link.
intakeRouter.get('/:slug', async (req, res) => {
  if (!admin) return res.status(500).json({ error: 'Server not configured.' });
  const slug = String(req.params.slug || '').toLowerCase();
  try {
    const { data: form, error } = await admin
      .from('intake_forms').select('slug, org_id, title').eq('slug', slug).maybeSingle();
    if (error) throw error;
    if (!form) return res.status(404).json({ error: 'This application link is not active.' });
    const { data: org } = await admin
      .from('organizations').select('name').eq('id', form.org_id).maybeSingle();
    return res.json({ ok: true, slug: form.slug, title: form.title || 'Application', orgName: org?.name || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not load this application.' });
  }
});

// Public: submit an application.
intakeRouter.post('/:slug', async (req, res) => {
  if (!admin) return res.status(500).json({ error: 'Server not configured.' });
  const slug = String(req.params.slug || '').toLowerCase();
  const b = req.body || {};
  const firstName = (b.firstName || '').trim();
  if (!firstName) return res.status(400).json({ error: 'First name is required.' });

  try {
    // 1) Which org owns this intake link?
    const { data: form, error: fErr } = await admin
      .from('intake_forms').select('slug, org_id, title').eq('slug', slug).maybeSingle();
    if (fErr) throw fErr;
    if (!form) return res.status(404).json({ error: 'This application link is not active.' });

    const applicantName = `${firstName}${b.lastName ? ' ' + b.lastName : ''}`.trim();

    // 2) Create the unclaimed resident record (mapped columns + full answers).
    const { data: ind, error: iErr } = await admin.from('individuals').insert({
      org_id: form.org_id,
      first_name: firstName,
      last_name: (b.lastName || '').trim() || null,
      phone: (b.phone || '').trim() || null,
      email: (b.email || '').trim() || null,
      sobriety_date: isoDateOrNull(b.soberDate),
      // Applicants start as a pending admission — NOT a full resident. The owner
      // or manager admits them from the "Pending Admission" tab once they check
      // in. Until then they stay out of the Members / clients roster.
      status: 'pending',
      applied_at: new Date().toISOString(),
      // Medications land on the profile itself (not just the PDF) so the
      // resident and their house can both keep them current from day one.
      medications: medicationsFrom(b),
      intake_data: { pages: b.pages || [], dob: b.dob || null, address: b.address || null },
    }).select('id').single();
    if (iErr) throw iErr;
    const individualId = ind.id;

    // 3) Profile photo -> avatars bucket + avatar_path (so it shows in the app + roster).
    const avatar = dataUrlToBuffer(b.avatarDataUrl);
    if (avatar) {
      const apath = `${individualId}/${Date.now()}.jpg`;
      const up = await admin.storage.from('avatars').upload(apath, avatar.buf, { contentType: avatar.mime || 'image/jpeg', upsert: true });
      if (!up.error) await admin.from('individuals').update({ avatar_path: apath }).eq('id', individualId);
    }

    // 4) Render the application PDF -> documents bucket + a Documents row.
    try {
      const pdf = await renderPdf({
        title: form.title || 'Application',
        applicantName,
        submittedAt: new Date().toLocaleString('en-US'),
        pages: b.pages || [],
      });
      const dpath = `${individualId}/${Date.now()}_application.pdf`;
      const dup = await admin.storage.from('documents').upload(dpath, pdf, { contentType: 'application/pdf', upsert: false });
      if (!dup.error) {
        await admin.from('documents').insert({
          org_id: form.org_id, individual_id: individualId,
          title: `Application — ${applicantName}`,
          storage_path: dpath, file_name: 'application.pdf', mime_type: 'application/pdf', size_bytes: pdf.length,
        });
      }
    } catch (e) { console.warn('[intake] PDF failed (client still created)', e?.message); }

    // 5) Emails: join code to the applicant, heads-up to the owner. Best-effort.
    let joinCode = null, ownerEmail = null;
    try {
      const { data: org } = await admin.from('organizations').select('id, name, join_code').eq('id', form.org_id).maybeSingle();
      joinCode = org?.join_code || null;
      const { data: owner } = await admin.from('org_members')
        .select('profiles:profile_id(email)').eq('org_id', form.org_id).eq('is_owner', true).maybeSingle();
      ownerEmail = owner?.profiles?.email || null;
      await sendApplicantEmail({ to: (b.email || '').trim(), firstName, orgName: org?.name, joinCode });
      await notifyOwner({ ownerEmail, orgName: org?.name, applicantName });
    } catch (e) { console.warn('[intake] notify step failed', e?.message); }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[intake] submit failed', e);
    return res.status(500).json({ error: e.message || 'Could not submit your application.' });
  }
});
