/**
 * Shared helpers for the cold-email campaigns (ported from the Mac's Python
 * scripts). Send state lives in Supabase (campaign_sends) so it survives Render
 * redeploys; the prospect list + send history ship as committed CSV files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CAMP_DIR = HERE;

export const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ytwcckpacadcaxklqviq.supabase.co';
export const UNSUB_SITE = 'https://soberlivingdirectory.com';
export const PHYSICAL_ADDRESS = process.env.CAMPAIGN_ADDRESS || 'Empower Next Project, 1501 Bartlett Lane, Sacramento, CA 95815';
export const SENDER_PHONE = '(213) 321-6518';

// ── tiny CSV parser (handles quoted fields with commas/newlines) ─────────────
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length && r.some((v) => v !== '')).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

export function readCsv(relPath) {
  const p = path.join(CAMP_DIR, relPath);
  if (!fs.existsSync(p)) return [];
  return parseCsv(fs.readFileSync(p, 'utf8'));
}

export function readLines(relPath) {
  const p = path.join(CAMP_DIR, relPath);
  if (!fs.existsSync(p)) return new Set();
  const out = new Set();
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const e = line.trim().toLowerCase();
    if (e && !e.startsWith('#')) out.add(e);
  }
  return out;
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || '');
}

export function unsubLink(email) {
  const secret = process.env.UNSUB_SECRET || '';
  const tok = crypto.createHash('sha256').update(email + secret).digest('hex').slice(0, 16);
  return `${UNSUB_SITE}/unsubscribe?e=${encodeURIComponent(email)}&t=${tok}`;
}

/** prospects grouped by (lowercased) email -> [rows]; skips our own domains. */
export function loadProspects() {
  const groups = new Map();
  for (const row of readCsv('prospects.csv')) {
    const e = (row.email || '').toLowerCase().trim();
    if (!e) continue;
    if (e.endsWith('@soberlivingdirectory.com') || e.endsWith('@empowernextproject.org')) continue;
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e).push(row);
  }
  return groups;
}

/** Suppression: Supabase email_optouts + committed suppress.txt. */
export async function loadOptouts() {
  const sup = readLines('suppress.txt');
  if (admin) {
    const { data } = await admin.from('email_optouts').select('email');
    (data || []).forEach((r) => r.email && sup.add(String(r.email).toLowerCase()));
  }
  return sup;
}

/** Emails already sent for the given campaign(s), stage 0 (initial). */
export async function loadSent(campaigns) {
  if (!admin) return new Set();
  const list = Array.isArray(campaigns) ? campaigns : [campaigns];
  const { data } = await admin.from('campaign_sends').select('email').in('campaign', list).eq('stage', 0);
  return new Set((data || []).map((r) => r.email.toLowerCase()));
}

/** How many emails already went out TODAY for a campaign, where "today" is the
 *  America/Los_Angeles day (the same day the 8am cron fires on). Used so the
 *  daily cap means "per day", not "per run" — which lets a run that died
 *  partway (e.g. a redeploy killed the process) be topped up later without
 *  double-sending. */
export async function sentTodayCount(campaign) {
  if (!admin) return 0;
  const now = new Date();
  // Same instant expressed on the LA wall clock, then rewound to its midnight.
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const offsetMs = now.getTime() - la.getTime();
  const laMidnight = new Date(la.getFullYear(), la.getMonth(), la.getDate(), 0, 0, 0, 0);
  const startUtc = new Date(laMidnight.getTime() + offsetMs);
  const { count, error } = await admin
    .from('campaign_sends')
    .select('*', { count: 'exact', head: true })
    .eq('campaign', campaign)
    .gte('sent_at', startUtc.toISOString());
  if (error) { console.warn('[campaigns] sentTodayCount failed:', error.message); return 0; }
  return count || 0;
}

/** Record a send (idempotent on campaign+email+stage). */
export async function logSend({ campaign, email, stage = 0, subject, resendId, homes }) {
  if (!admin) return;
  await admin.from('campaign_sends').upsert({
    campaign, email: email.toLowerCase(), stage,
    subject: subject || null, resend_id: resendId || null, homes: homes || null,
    sent_at: new Date().toISOString(),
  }, { onConflict: 'campaign,email,stage' });
}

/** Send one email through Resend. Returns { id } or { error }. */
export async function sendViaResend({ from, to, replyTo, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: 'RESEND_API_KEY not set' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject, html, text, reply_to: replyTo,
        headers: {
          'List-Unsubscribe': `<${unsubLink(to)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.id) return { id: j.id };
    return { error: j.message || JSON.stringify(j) };
  } catch (e) { return { error: e.message }; }
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ── one-time history import (idempotent) ─────────────────────────────────────
async function importCsv(relPath, campaign, stageFromRow) {
  const rows = readCsv(path.join('history', relPath));
  if (!rows.length || !admin) return 0;
  const payload = rows
    .filter((r) => (r.email || '').includes('@'))
    .map((r) => ({
      campaign,
      email: r.email.toLowerCase().trim(),
      stage: stageFromRow ? parseInt(r.stage || '0', 10) || 0 : 0,
      subject: r.subject || null,
      resend_id: r.resend_id || null,
      homes: r.homes || null,
      sent_at: r.ts ? new Date(r.ts.replace(' ', 'T')).toISOString() : new Date().toISOString(),
    }));
  // Upsert in chunks; conflicts (already imported) are ignored.
  for (let i = 0; i < payload.length; i += 500) {
    await admin.from('campaign_sends').upsert(payload.slice(i, i + 500), { onConflict: 'campaign,email,stage', ignoreDuplicates: true });
  }
  return payload.length;
}

/** Import the Mac's send history once, so the cloud never re-emails contacts. */
export async function importHistoryOnce() {
  if (!admin) return { skipped: 'no service role' };
  const d = await importCsv('sent_directory.csv', 'directory', false);
  const a = await importCsv('sent_app.csv', 'app', false);
  const f = await importCsv('followups_app.csv', 'app_followup', true);
  return { directory: d, app: a, followups: f };
}
