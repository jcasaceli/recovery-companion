/**
 * Sober Living Companion — backend service. Holds secret keys (Stripe,
 * Supabase service role) server-side and exposes Stripe, push, account,
 * house-manager, and rent-reminder endpoints. GET /health -> { ok: true }.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { stripeRouter, stripeWebhook } from './stripe.js';
import { notifyRouter } from './notify.js';
import { accountRouter } from './account.js';
import { inviteRouter } from './invite.js';
import { managersRouter } from './managers.js';
import { intakeRouter } from './intake.js';
import { runRentReminders } from './reminders.js';
import { initCampaigns, guardedRun } from './campaigns/index.js';

const PORT = process.env.PORT || 8787;

const app = express();
// CORS: lock to specific origins in production via ALLOWED_ORIGINS (comma-sep).
// Native mobile requests have no Origin, so they're unaffected; this protects
// against rogue web origins. Default (unset) is permissive for local dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(ALLOWED_ORIGINS.length ? { origin: ALLOWED_ORIGINS } : {}));

// Stripe webhook needs the RAW body for signature verification — mount it
// BEFORE express.json() so the body isn't parsed.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Public intake submissions carry a profile photo + signatures, so they need a
// bigger body limit. Mount BEFORE the global 1mb parser so this parser wins.
app.use('/api/intake', express.json({ limit: '12mb' }), intakeRouter);

app.use(express.json({ limit: '1mb' }));

// Stripe JSON endpoints (onboarding, rent checkout, platform subscription).
app.use('/api/stripe', stripeRouter);

// Push fan-out endpoints.
app.use('/api/notify', notifyRouter);
app.use('/api/account', accountRouter);
app.use('/api/invite', inviteRouter);
app.use('/api/managers', managersRouter);

// Manual trigger for rent reminders (handy for testing the cron logic).
app.get('/api/reminders/run', async (_req, res) => {
  try {
    const result = await runRentReminders();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Daily rent reminders at 9:00 AM (server local time).
cron.schedule('0 9 * * *', () => {
  runRentReminders()
    .then((r) => console.log(`[reminders] daily run: sent ${r.sent}, checked ${r.checked}`))
    .catch((e) => console.warn('[reminders] daily run failed', e));
});

// ── Cold-email campaigns (directory + app), moved off the Mac ────────────────
// Imports the send history on boot, then schedules the 8am Pacific run
// (only if CAMPAIGNS_ENABLED=true).
initCampaigns().catch((e) => console.warn('[campaigns] init failed', e.message));

// Token-guarded trigger. Default is a DRY RUN (sends nothing) so you can verify
// exactly who would be emailed. Add &live=1 to actually send this run.
app.get('/api/campaigns/run', async (req, res) => {
  const token = process.env.CAMPAIGN_ADMIN_TOKEN;
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'forbidden' });
  const dry = req.query.live !== '1';
  try {
    if (dry) {
      const results = await guardedRun({ dry: true });
      return res.json({ dry: true, results });
    }
    // Live run happens in the background (it takes ~1 hr with 90s spacing).
    guardedRun({ dry: false }).catch((e) => console.warn('[campaigns] live run failed', e.message));
    return res.json({ dry: false, started: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Landing page Stripe returns to after Checkout / Connect onboarding. Set
// PUBLIC_RETURN_URL to "<this server>/return" once deployed.
app.get('/return', (_req, res) => {
  res
    .set('Content-Type', 'text/html')
    .send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>All set</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#F7F5F1;color:#2B2B2B;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}
.card{background:#fff;border-radius:20px;padding:32px;max-width:360px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{color:#3E8E7E;font-size:22px}p{color:#6B6B6B;line-height:1.5}</style></head>
<body><div class="card"><h1>✅ All set</h1><p>You can close this window and return to the Sober Living Companion app.</p></div></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Sober Living Companion server listening on http://localhost:${PORT}`);
});
