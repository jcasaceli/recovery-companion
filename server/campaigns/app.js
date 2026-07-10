/**
 * Sober Living Companion APP outreach + follow-ups (ported from
 * send_app_campaign.py + send_app_followups.py). Pitches the app to the same
 * homes; suppresses anyone the directory campaign already emailed.
 */
import { admin, esc, unsubLink, loadProspects, loadOptouts, loadSent, logSend, sendViaResend, sleep, readLines, PHYSICAL_ADDRESS, SENDER_PHONE } from './lib.js';

const APP_SITE = 'https://soberlivingcompanion.com';
const CALENDLY = 'https://calendly.com/empowernextproject-info/30min';
const FROM = process.env.APP_CAMPAIGN_FROM || 'Joseph at Sober Living Companion <joseph@outreach.soberlivingcompanion.com>';
const REPLY_TO = process.env.CAMPAIGN_REPLY_TO || 'info@empowernextproject.org';
const SENDER_NAME = 'Joseph Casaceli';
const SENDER_TITLE = 'Founder';
const SENDER_WEB = 'www.soberlivingcompanion.com';

export function buildOutreach(email, homes) {
  const primary = homes[0];
  const multi = homes.length > 1;
  const name = primary.name;
  const subject = multi ? 'Run your sober living homes in one app — from a non-profit' : `Run ${name} in one app — from a non-profit`;
  const guides = `${APP_SITE}/guides`;
  const start = `${APP_SITE}/start`;
  const who = multi ? 'your homes' : esc(name);
  const intro = `I'm with <strong>Empower Next Project</strong>, a non-profit. We built <strong>Sober Living Companion</strong> — an all-in-one app to help run ${who}: residents, rent &amp; membership payments, drug tests, beds, curfew check-ins, e-signed agreements and meeting attendance — <strong>and a free app for every resident</strong> to count sober days, find meetings, sign forms, and pay right from their phone.`;

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16242a">
  <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:16px 22px;color:#fff;font-weight:800;font-size:18px">🌱 Sober Living Companion</div>
  <div style="border:1px solid #e4eaec;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
    <p style="margin:0 0 12px">Hi ${esc(name)} team,</p>
    <p style="color:#3a474c;margin:0 0 16px">${intro}</p>
    <div style="text-align:center;margin:18px 0">
      <a href="${guides}" style="background:#3E8E7E;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;display:inline-block">🎬 Watch how it works (4 short videos)</a>
      <p style="color:#5c6b71;font-size:13px;margin:8px 0 0">2 minutes each · getting started, forms &amp; agreements, payments, and the resident app</p>
    </div>
    <ul style="padding-left:18px;margin:14px 0;color:#3a474c">
      <li style="margin:6px 0">Membership &amp; rent tracking (card, CashApp, Zelle)</li>
      <li style="margin:6px 0">Drug tests, beds, passes, curfew GPS check-ins, meeting attendance</li>
      <li style="margin:6px 0">Send agreements &amp; forms residents e-sign on their phone</li>
      <li style="margin:6px 0">Run multiple houses from one dashboard</li>
    </ul>
    <div style="background:#E4F1ED;border-radius:10px;padding:14px 16px;margin:6px 0 16px;color:#16242a;font-size:14px;line-height:1.55">
      <strong>$60/month flat — no add-on fees for anything, ever.</strong> That's <strong>unlimited houses</strong> and <strong>unlimited residents</strong>, and it's free for every resident. Because we're a 501(c)(3) non-profit (EIN 39-3580172), your membership is tax-deductible — and <strong>every dollar goes right back into housing people in recovery.</strong>
    </div>
    <div style="background:#f4f7f7;border-left:3px solid #3E8E7E;border-radius:6px;padding:10px 14px;margin:0 0 16px;color:#16242a;font-size:14px;line-height:1.5">
      🔄 <strong>Already using Sobriety Hub or One Step Software?</strong> Switch in minutes — just import a CSV of your current clients and pick up right where you left off.
    </div>
    <p style="margin:2px 0 8px"><a href="${start}" style="color:#2F6B5F;font-weight:700">Get started for your home →</a></p>
    <p style="margin:0 0 18px">Want a quick walkthrough first? <a href="${CALENDLY}" style="color:#2F6B5F;font-weight:700">📅 Book a 15-minute demo →</a></p>
    <p style="color:#3a474c;margin:0;font-size:14px">Not the right person? Please forward to whoever runs the house. Questions — or want to make sure this is real? Just reply, or call or text me directly at <a href="tel:+12133216518" style="color:#2F6B5F;font-weight:700;text-decoration:none">${SENDER_PHONE}</a>.</p>
    <p style="color:#3a474c;margin:18px 0 0">Call or text anytime,<br>
      <strong>${SENDER_NAME}</strong>, ${SENDER_TITLE}<br>
      <a href="https://${SENDER_WEB}" style="color:#2F6B5F;font-weight:700;text-decoration:none">${SENDER_WEB}</a><br>
      📞 <a href="tel:+12133216518" style="color:#2F6B5F;font-weight:700;text-decoration:none">${SENDER_PHONE}</a></p>
    <div style="text-align:center;border-top:1px solid #e4eaec;margin-top:18px;padding-top:16px">
      <a href="https://apps.apple.com/app/sober-living-companion/id6780705094" style="text-decoration:none"><img src="${APP_SITE.replace('soberlivingcompanion.com', 'soberlivingdirectory.com')}/appstore-badge.png" width="150" height="55" alt="Download on the App Store" style="border:0;outline:none;display:inline-block;vertical-align:middle"></a>
      &nbsp;
      <a href="https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app" style="text-decoration:none"><img src="https://soberlivingdirectory.com/googleplay-badge.png" width="168" height="55" alt="Get it on Google Play" style="border:0;outline:none;display:inline-block;vertical-align:middle"></a>
    </div>
    <p style="color:#8a979c;font-size:12px;border-top:1px solid #e4eaec;margin-top:18px;padding-top:14px">
      You received this because ${esc(name)} is publicly listed as a recovery residence. ${esc(PHYSICAL_ADDRESS)}.<br>
      <a href="${unsubLink(email)}" style="color:#8a979c">Unsubscribe</a> and we won't email this address again.</p>
  </div></div>`;

  const text = `Hi ${name} team,\n\n`
    + `I'm with Empower Next Project, a non-profit. We built Sober Living Companion — an all-in-one app to help run ${multi ? 'your homes' : name}: residents, rent & membership payments, drug tests, beds, curfew check-ins, e-signed agreements and meeting attendance — and a FREE app for every resident to count sober days, find meetings, sign forms, and pay from their phone.\n\n`
    + `Watch how it works (4 short videos): ${guides}\n\n`
    + `$60/month flat -- no add-on fees for anything, ever. That's unlimited houses and unlimited residents, and it's free for every resident. Because we're a 501(c)(3) non-profit (EIN 39-3580172), your membership is tax-deductible -- and every dollar goes right back into housing people in recovery.\n\n`
    + `Already using Sobriety Hub or One Step Software? Switch in minutes -- just import a CSV of your current clients and pick up right where you left off.\n\n`
    + `Get started for your home: ${start}\nOr book a 15-minute demo: ${CALENDLY}\n\n`
    + `Not the right person? Please forward to whoever runs the house. Questions, or want to make sure this is real? Reply, or call or text me directly at ${SENDER_PHONE}.\n\n`
    + `Call or text anytime,\n${SENDER_NAME}, ${SENDER_TITLE}\n${SENDER_WEB}\n${SENDER_PHONE}\n\n`
    + `App Store: https://apps.apple.com/app/sober-living-companion/id6780705094\nGoogle Play: https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app\n\n`
    + `${PHYSICAL_ADDRESS}\nUnsubscribe: ${unsubLink(email)}\n`;

  return { subject, html, text };
}

function wrapFollowup(inner, email, name) {
  const unsub = unsubLink(email);
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:540px;margin:0 auto;color:#16242a;line-height:1.6;font-size:15px">
    ${inner}
    <p style="color:#3a474c;margin:18px 0 0">Call or text anytime,<br>
      <strong>${SENDER_NAME}</strong>, ${SENDER_TITLE}<br>
      <a href="https://${SENDER_WEB}" style="color:#2F6B5F;font-weight:700;text-decoration:none">${SENDER_WEB}</a><br>
      📞 <a href="tel:+12133216518" style="color:#2F6B5F;font-weight:700;text-decoration:none">${SENDER_PHONE}</a></p>
    <p style="color:#8a979c;font-size:12px;border-top:1px solid #e4eaec;margin-top:16px;padding-top:12px">
      You received this because ${esc(name)} is publicly listed as a recovery residence. ${esc(PHYSICAL_ADDRESS)}.<br>
      <a href="${unsub}" style="color:#8a979c">Unsubscribe</a> and we won't email this address again.</p>
    </div>`;
}

export function buildFollowup(stage, email, homes) {
  const name = homes[0].name;
  const guides = `${APP_SITE}/guides`;
  const start = `${APP_SITE}/start`;
  let subject, inner, text;
  if (String(stage) === '1') {
    subject = `Quick follow-up — ${name}`;
    inner = `<p style="margin:0 0 12px">Hi ${esc(name)} team,</p>`
      + `<p style="margin:0 0 12px">Just making sure my note reached the right person. <strong>Sober Living Companion</strong> is a $60/month flat app — unlimited houses and residents — to run your home, plus a free app for your residents.</p>`
      + `<p style="margin:0 0 12px">Here's a 2-minute overview: <a href="${guides}" style="color:#2F6B5F;font-weight:700">soberlivingcompanion.com/guides</a></p>`
      + `<p style="margin:0 0 12px">Happy to get you set up or answer anything — <a href="${CALENDLY}" style="color:#2F6B5F;font-weight:700">📅 book a 15-minute demo</a>, just reply, or call/text me at ${SENDER_PHONE}.</p>`;
    text = `Hi ${name} team,\n\nJust making sure my note reached the right person. Sober Living Companion is a $60/month flat app -- unlimited houses and residents -- to run your home, plus a free app for your residents.\n\n2-minute overview: ${guides}\n\nHappy to get you set up or answer anything -- book a 15-minute demo: ${CALENDLY} -- or reply, or call/text me at ${SENDER_PHONE}.\n\nCall or text anytime,\n${SENDER_NAME}, ${SENDER_TITLE}\n${SENDER_WEB}\n${SENDER_PHONE}\n\n${PHYSICAL_ADDRESS}\nUnsubscribe: ${unsubLink(email)}\n`;
  } else {
    subject = `Last note — free switch-over for ${name}`;
    inner = `<p style="margin:0 0 12px">Hi ${esc(name)} team,</p>`
      + `<p style="margin:0 0 12px">I won't keep cluttering your inbox — this is my last note. If you're already using <strong>Sobriety Hub</strong> or <strong>One Step</strong>, I'll personally move your residents over from a CSV, <strong>free</strong>, so switching takes minutes.</p>`
      + `<p style="margin:0 0 12px">See it in 2 minutes: <a href="${guides}" style="color:#2F6B5F;font-weight:700">soberlivingcompanion.com/guides</a> — or start anytime at <a href="${start}" style="color:#2F6B5F;font-weight:700">soberlivingcompanion.com/start</a>.</p>`
      + `<p style="margin:0 0 12px">Thank you for the work you do. Reply or call/text ${SENDER_PHONE} anytime.</p>`;
    text = `Hi ${name} team,\n\nI won't keep cluttering your inbox -- this is my last note. If you're already using Sobriety Hub or One Step, I'll personally move your residents over from a CSV, free, so switching takes minutes.\n\nSee it in 2 minutes: ${guides} -- or start anytime at ${start}.\n\nThank you for the work you do. Reply or call/text ${SENDER_PHONE} anytime.\n\nCall or text anytime,\n${SENDER_NAME}, ${SENDER_TITLE}\n${SENDER_WEB}\n${SENDER_PHONE}\n\n${PHYSICAL_ADDRESS}\nUnsubscribe: ${unsubLink(email)}\n`;
  }
  return { subject, html: wrapFollowup(inner, email, name), text };
}

/** Send ONE real sample app email to a test address (not logged to state). */
export async function sendTestApp(to) {
  const groups = loadProspects();
  const first = [...groups.values()][0];
  const { subject, html, text } = buildOutreach(to, first);
  const resp = await sendViaResend({ from: FROM, to, replyTo: REPLY_TO, subject, html, text });
  return { campaign: 'app', from: FROM, to, subject, ...resp };
}

/** Initial app outreach (suppresses directory + app sends). */
export async function runAppOutreach({ cap = 30, delayMs = 90000, dry = false, log = console.log } = {}) {
  const groups = loadProspects();
  const [optouts, sent] = await Promise.all([loadOptouts(), loadSent(['app', 'directory'])]);
  const eligible = [...groups.entries()].filter(([email]) => !sent.has(email) && !optouts.has(email));

  log(`[app] ${groups.size} prospects · ${sent.size} already contacted (app+directory) · ${optouts.size} opt-outs · ${eligible.length} eligible`);
  if (dry) {
    return { campaign: 'app', eligible: eligible.length, wouldSend: Math.min(cap, eligible.length), sample: eligible.slice(0, 5).map(([e]) => e) };
  }
  let count = 0;
  for (const [email, homes] of eligible) {
    if (count >= cap) break;
    const { subject, html, text } = buildOutreach(email, homes);
    const resp = await sendViaResend({ from: FROM, to: email, replyTo: REPLY_TO, subject, html, text });
    if (resp.error) { log(`[app] SKIP ${email}: ${resp.error}`); await sleep(delayMs); continue; }
    await logSend({ campaign: 'app', email, stage: 0, subject, resendId: resp.id, homes: homes.map((h) => h.listing_id).join('|') });
    count++;
    log(`[app] [${count}/${cap}] sent -> ${email} id=${resp.id}`);
    await sleep(delayMs);
  }
  log(`[app] done — sent ${count}`);
  return { campaign: 'app', sent: count };
}

/** Day-3 / day-7 follow-ups to homes already app-emailed. */
export async function runAppFollowups({ cap = 35, delayMs = 90000, dry = false, log = console.log } = {}) {
  const groups = loadProspects();
  const optouts = await loadOptouts();
  const converted = readLines('converted_app.txt');
  if (!admin) return { campaign: 'app_followup', error: 'no db' };

  // First app-send date per email + follow-up stages already sent.
  const { data: firsts } = await admin.from('campaign_sends').select('email,sent_at').eq('campaign', 'app').eq('stage', 0);
  const { data: dones } = await admin.from('campaign_sends').select('email,stage').eq('campaign', 'app_followup');
  const firstAt = new Map();
  (firsts || []).forEach((r) => {
    const e = r.email.toLowerCase(); const t = new Date(r.sent_at).getTime();
    if (!firstAt.has(e) || t < firstAt.get(e)) firstAt.set(e, t);
  });
  const done = new Set((dones || []).map((r) => `${r.email.toLowerCase()}:${r.stage}`));

  const now = Date.now();
  const DAY = 86400000;
  const due = [];
  for (const [email, t] of firstAt) {
    if (optouts.has(email) || converted.has(email)) continue;
    const days = Math.floor((now - t) / DAY);
    if (days >= 7 && !done.has(`${email}:2`)) due.push([email, 2]);
    else if (days >= 3 && !done.has(`${email}:1`)) due.push([email, 1]);
  }

  log(`[app_followup] ${firstAt.size} app-emailed · ${done.size} follow-ups done · ${due.length} due now`);
  if (dry) {
    const c1 = due.filter(([, s]) => s === 1).length, c2 = due.filter(([, s]) => s === 2).length;
    return { campaign: 'app_followup', due: due.length, first: c1, second: c2, sample: due.slice(0, 5).map(([e, s]) => `#${s} -> ${e}`) };
  }
  let count = 0;
  for (const [email, stage] of due) {
    if (count >= cap) break;
    const homes = groups.get(email);
    if (!homes) continue;
    const { subject, html, text } = buildFollowup(stage, email, homes);
    const resp = await sendViaResend({ from: FROM, to: email, replyTo: REPLY_TO, subject, html, text });
    if (resp.error) { log(`[app_followup] SKIP ${email} #${stage}: ${resp.error}`); await sleep(delayMs); continue; }
    await logSend({ campaign: 'app_followup', email, stage, subject, resendId: resp.id });
    count++;
    log(`[app_followup] [${count}/${cap}] #${stage} -> ${email}`);
    await sleep(delayMs);
  }
  log(`[app_followup] done — sent ${count}`);
  return { campaign: 'app_followup', sent: count };
}
