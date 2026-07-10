/**
 * Directory claim-outreach campaign (ported from send_campaign.py).
 * Emails sober-living homes listed on Sober Living Directory, asking them to add
 * photos / claim their free listing. Personalizes with real view counts.
 */
import { admin, esc, fmtPhone, unsubLink, loadProspects, loadOptouts, loadSent, logSend, sendViaResend, sleep, PHYSICAL_ADDRESS, SENDER_PHONE } from './lib.js';

const SITE = 'https://soberlivingdirectory.com';
const FROM = process.env.CAMPAIGN_FROM || 'Joseph Casaceli — Sober Living Directory <joseph@mail.soberlivingdirectory.com>';
const REPLY_TO = process.env.CAMPAIGN_REPLY_TO_DIR || 'joseph@soberlivingdirectory.com';
const SENDER_NAME = 'Joseph Casaceli';
const SENDER_TITLE = 'Director of Operations';
const SENDER_ORG = 'Empower Next Project · a non-profit';
const VIEW_THRESHOLD = 8;

/** listing_id -> view count from the public directory DB (best effort). */
async function loadViews(groups) {
  const ids = [];
  for (const homes of groups.values()) for (const h of homes) if (h.listing_id) ids.push(h.listing_id);
  const uniq = [...new Set(ids)];
  const out = {};
  if (!admin || !uniq.length) return out;
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await admin.from('directory_listings').select('id,views').in('id', uniq.slice(i, i + 200));
    (data || []).forEach((r) => { const v = parseInt(r.views || 0, 10); if (v) out[String(r.id)] = v; });
  }
  return out;
}

export function buildEmail(email, homes, VIEWS) {
  const primary = homes[0];
  const multi = homes.length > 1;
  const name = primary.name;
  const state = primary.state || 'your area';
  const views = Math.max(0, ...homes.map((h) => VIEWS[String(h.listing_id)] || 0));

  let subject;
  if (multi) subject = 'Add photos to your sober living homes on Sober Living Directory';
  else if (views >= VIEW_THRESHOLD) subject = `${name} was viewed ${views} times — add photos to get more calls`;
  else subject = `Families are searching for sober living in ${state} — is ${name} ready?`;

  const claimLink = (h) => `${SITE}/list-your-home.html?claim=${h.listing_id}&name=${encodeURIComponent(h.name)}`;
  const viewsLine = views >= VIEW_THRESHOLD
    ? ` It's already been viewed <strong>${views} times</strong> by families searching for a place to stay.` : '';

  let intro, ctaBlock, txtLinks;
  if (multi) {
    const items = homes.map((h) =>
      `<li style="margin:6px 0"><a href="${claimLink(h)}" style="color:#0E5F5A;font-weight:700">${esc(h.name)}</a>`
      + ` <span style="color:#8a979c">— ${esc(h.city)}, ${esc(h.state)}`
      + `${h.phone ? ' · ' + esc(fmtPhone(h.phone)) : ''}</span></li>`).join('');
    intro = `Families use Sober Living Directory to find safe sober living and <strong>call homes directly</strong>. `
      + `We list <strong>${homes.length} of your homes</strong>, free.${viewsLine} `
      + `Homes <strong>with photos get noticeably more calls</strong> — tap any home below to add photos and update its details:`;
    ctaBlock = `<ul style="padding-left:18px;margin:14px 0">${items}</ul>`
      + `<p style="color:#3a474c;margin:0 0 4px;font-size:13px">Free · about 2 minutes each · no card ever.</p>`;
    txtLinks = homes.map((h) => `- ${h.name} (${h.city}, ${h.state}): add photos & update — ${claimLink(h)}`).join('\n');
  } else {
    intro = `Families across ${esc(state)} use Sober Living Directory to find safe sober living and `
      + `<strong>call homes directly</strong> — and <strong>${esc(name)}</strong> is listed for free.${viewsLine} `
      + `Homes <strong>with photos get noticeably more calls</strong>, and ${esc(name)} doesn't have any yet.`;
    ctaBlock = `<p style="margin:22px 0 10px;text-align:center"><a href="${claimLink(primary)}" `
      + `style="background:#15807A;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 28px;border-radius:999px;display:inline-block">📸 Add photos &amp; update your listing</a></p>`
      + `<p style="color:#3a474c;margin:0 0 4px;font-size:13px;text-align:center">Free · takes about 2 minutes · no card ever.</p>`;
    txtLinks = claimLink(primary);
  }

  const unsub = unsubLink(email);
  const pphone = fmtPhone(primary.phone);
  const phoneLine = (!multi && pphone)
    ? `<p style="background:#f4f7f7;border-left:3px solid #15807A;border-radius:6px;padding:10px 14px;margin:0 0 16px;color:#16242a;font-size:15px">📞 We have your number listed as <strong>${esc(pphone)}</strong> — is that still the best number for people to reach you?</p>`
    : '';
  const photoCallout = `<div style="background:#fef6e7;border:1px solid #f6e0b3;border-radius:10px;padding:12px 14px;margin:4px 0 16px;color:#7a5b14;line-height:1.5;font-size:14px"><strong>Why photos matter:</strong> families are far more likely to call a home they can actually see. A few clear photos of the house and bedrooms make a real difference.</div>`;

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16242a">
  <div style="background:#15807A;border-radius:14px 14px 0 0;padding:16px 22px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:12px"><img src="${SITE}/email-logo.png" width="42" height="42" alt="Sober Living Directory" style="display:block;border:0;outline:none;border-radius:9px"></td>
      <td style="color:#fff;font-family:Inter,Arial,sans-serif;font-weight:800;font-size:18px;vertical-align:middle">Sober Living Directory</td>
    </tr></table>
  </div>
  <div style="border:1px solid #e4eaec;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
    <p style="margin:0 0 12px">Hi ${esc(name)} team,</p>
    <p style="color:#3a474c;margin:0 0 16px">${intro}</p>
    ${phoneLine}
    ${ctaBlock}
    ${photoCallout}
    <div style="background:#f1f8f7;border:1px solid #d6ece8;border-radius:10px;padding:12px 14px;margin:0 0 16px;color:#16242a;font-size:13.5px;line-height:1.5">
      Your listing is <strong>100% free, forever</strong> — we never ask for payment or card details, and we never sell leads or your information. Sober Living Directory is a program of <strong>Empower Next Project</strong>, a registered 501(c)(3) non-profit (EIN 39-3580172).
    </div>
    <p style="color:#3a474c;margin:0;font-size:14px">Not the right person? Please forward to whoever handles intake. Any questions — or want to make sure this is real? Just reply, or call me directly at <a href="tel:+12133216518" style="color:#0E5F5A;font-weight:700;text-decoration:none">${SENDER_PHONE}</a>.</p>
    <p style="color:#3a474c;margin:16px 0 0">In recovery together,<br>
      <strong>${SENDER_NAME}</strong><br>
      <span style="color:#5c6b71">${SENDER_TITLE}</span><br>
      <span style="color:#5c6b71">${SENDER_ORG}</span><br>
      📞 <a href="tel:+12133216518" style="color:#0E5F5A;font-weight:700;text-decoration:none">${SENDER_PHONE}</a> &nbsp;·&nbsp; <a href="mailto:joseph@soberlivingdirectory.com" style="color:#0E5F5A;text-decoration:none">joseph@soberlivingdirectory.com</a></p>
    <div style="text-align:center;border-top:1px solid #e4eaec;margin-top:18px;padding-top:16px">
      <p style="color:#3a474c;margin:0 0 10px;font-size:14px"><strong>📱 New — our free companion app:</strong> <strong>Sober Living Companion</strong> helps homes &amp; residents track sober days, find meetings, pay membership &amp; run the house.</p>
      <a href="https://apps.apple.com/app/sober-living-companion/id6780705094" style="text-decoration:none"><img src="${SITE}/appstore-badge.png" width="150" height="55" alt="Download on the App Store" style="border:0;outline:none;display:inline-block;vertical-align:middle"></a>
      &nbsp;
      <a href="https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app" style="text-decoration:none"><img src="${SITE}/googleplay-badge.png" width="168" height="55" alt="Get it on Google Play" style="border:0;outline:none;display:inline-block;vertical-align:middle"></a>
    </div>
    <p style="color:#8a979c;font-size:12px;border-top:1px solid #e4eaec;margin-top:18px;padding-top:14px">
      You received this because ${esc(name)} is publicly listed as a recovery residence. ${esc(PHYSICAL_ADDRESS)}.<br>
      <a href="${unsub}" style="color:#8a979c">Unsubscribe</a> and we won't email this address again.</p>
  </div></div>`;

  const textViews = views >= VIEW_THRESHOLD ? ` It's already been viewed ${views} times by families searching for a place to stay.` : '';
  const text = `Hi ${name} team,\n\n`
    + `Families use Sober Living Directory — a free, ad-free directory — to find safe sober living and call homes directly, and ${name} is listed for free.${textViews} Homes with photos get noticeably more calls, and ${name} doesn't have any yet.\n\n`
    + ((!multi && pphone) ? `(We also have your number listed as ${pphone} — is that still the best number to reach you?)\n\n` : '')
    + `Add photos & update your listing (free, about 2 minutes):\n${txtLinks}\n\n`
    + `Your listing is 100% free, forever — we never ask for payment or card details, and we never sell leads or your information. Sober Living Directory is a program of Empower Next Project, a registered 501(c)(3) non-profit (EIN 39-3580172).\n\n`
    + `Not the right person? Please forward to whoever handles intake. Questions, or want to make sure this is real? Reply, or call me directly at ${SENDER_PHONE}.\n\n`
    + `In recovery together,\n${SENDER_NAME}\n${SENDER_TITLE}\n${SENDER_ORG}\n${SENDER_PHONE} · joseph@soberlivingdirectory.com\n\n`
    + `New — our free companion app, Sober Living Companion, helps homes & residents track sober days, find meetings, pay membership & run the house. App Store: https://apps.apple.com/app/sober-living-companion/id6780705094 · Google Play: https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app\n\n`
    + `${PHYSICAL_ADDRESS}\nUnsubscribe: ${unsub}\n`;

  return { subject, html, text };
}

/** Send ONE real sample directory email to a test address (not logged to state). */
export async function sendTestDirectory(to) {
  const groups = loadProspects();
  const first = [...groups.values()][0];
  const { subject, html, text } = buildEmail(to, first, {});
  const resp = await sendViaResend({ from: FROM, to, replyTo: REPLY_TO, subject, html, text });
  return { campaign: 'directory', from: FROM, to, subject, ...resp };
}

/** Order: all non-CA first, California last (matches the original). */
function orderProspects(groups) {
  const caOnly = (homes) => homes.every((h) => (h.state || '').toUpperCase() === 'CA');
  const entries = [...groups.entries()];
  return [...entries.filter(([, h]) => !caOnly(h)), ...entries.filter(([, h]) => caOnly(h))];
}

export async function runDirectory({ cap = 50, delayMs = 90000, dry = false, log = console.log } = {}) {
  const groups = loadProspects();
  const [optouts, sent] = await Promise.all([loadOptouts(), loadSent(['directory'])]);
  const VIEWS = await loadViews(groups);
  const ordered = orderProspects(groups).filter(([email]) => !sent.has(email) && !optouts.has(email));

  log(`[directory] ${groups.size} prospects · ${sent.size} already sent · ${optouts.size} opt-outs · ${ordered.length} eligible`);
  if (dry) {
    const sample = ordered.slice(0, Math.min(cap, 5)).map(([e, h]) => `${e} (${h.length} home${h.length > 1 ? 's' : ''})`);
    return { campaign: 'directory', eligible: ordered.length, wouldSend: Math.min(cap, ordered.length), sample };
  }

  let count = 0;
  for (const [email, homes] of ordered) {
    if (count >= cap) break;
    const { subject, html, text } = buildEmail(email, homes, VIEWS);
    const resp = await sendViaResend({ from: FROM, to: email, replyTo: REPLY_TO, subject, html, text });
    if (resp.error) { log(`[directory] SKIP ${email}: ${resp.error}`); await sleep(delayMs); continue; }
    await logSend({ campaign: 'directory', email, stage: 0, subject, resendId: resp.id, homes: homes.map((h) => h.listing_id).join('|') });
    count++;
    log(`[directory] [${count}/${cap}] sent -> ${email} id=${resp.id}`);
    await sleep(delayMs);
  }
  log(`[directory] done — sent ${count}`);
  return { campaign: 'directory', sent: count };
}
