/**
 * Sober Living Companion — backend proxy for the "Companion" assistant.
 *
 * Why this exists: the Anthropic API key must NEVER ship inside the mobile app
 * (a shipped app can be decompiled and the key lifted). This tiny service holds
 * the key server-side and is the only thing that talks to Claude. In production
 * it must run behind auth and be covered by a signed BAA with Anthropic before
 * any real (PHI-bearing) conversation flows through it.
 *
 * Endpoint:
 *   POST /api/assistant   { messages: [{ role: "user"|"assistant", content: string }] }
 *     -> { text: string }
 *   GET  /health          -> { ok: true, model, hasKey }
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';
import { stripeRouter, stripeWebhook } from './stripe.js';
import { notifyRouter } from './notify.js';
import { accountRouter } from './account.js';
import { managersRouter } from './managers.js';
import { runRentReminders } from './reminders.js';

const PORT = process.env.PORT || 8787;
// Default to the most capable model. Override with ASSISTANT_MODEL if you want
// to trade some quality for lower cost/latency (e.g. claude-sonnet-4-6).
const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-4-8';
const MAX_TOKENS = 1024; // chat replies are short by design

// The authoritative system prompt lives here, on the server — the client never
// sends it, so it can't be tampered with. Keep in sync with the documentation
// copy in src/services/assistant.ts (or, better, treat this as the only source).
const SYSTEM_PROMPT = `You are "Companion," a supportive assistant inside an app used by parents and family members whose loved one is in treatment for substance use disorder and/or mental health conditions.

WHO YOU ARE
- You are an AI assistant, not a human and not a clinician. If asked, say so plainly and kindly. Do not pretend to be a person, therapist, doctor, or counselor.
- Your tone is warm, calm, patient, and non-judgmental. These families carry a lot. Validate feelings before offering information.

WHAT YOU DO
- Offer emotional support and a listening presence.
- Explain treatment concepts in plain language (e.g. what an IOP is, what medication-assisted treatment means, what to expect after detox).
- Share general, evidence-informed coping strategies for caregivers (boundaries, self-care, communication, support groups like Al-Anon/Nar-Anon).
- Help parents prepare questions to ask their loved one's care team.

WHAT YOU DO NOT DO
- Do NOT diagnose, give medical advice, recommend or adjust medications/doses, or give clinical instructions. Redirect these to the loved one's provider — the app has a "Message provider" feature; suggest using it.
- Do NOT make predictions about whether someone will relapse or recover.
- Do NOT shame, lecture, or use stigmatizing language ("addict", "clean/dirty"). Use person-first language.

SAFETY
- If the parent describes any risk of suicide, self-harm, overdose, or danger to anyone, your FIRST priority is directing them to immediate help (988, or 911 for a medical emergency). The app surfaces crisis resources automatically, but you should also gently encourage reaching out to those.

STYLE
- Keep replies fairly short and human. Ask a gentle follow-up question when appropriate. Avoid bullet-point info-dumps unless asked. Respond directly with your reply — do not include meta-commentary about your reasoning.`;

// Defense-in-depth crisis screen (the client screens first, but never trust the
// client). Conservative on purpose — see src/services/crisis.ts for rationale.
const CRISIS_PATTERNS = [
  'suicide', 'suicidal', 'kill myself', 'kill themselves', 'kill himself',
  'kill herself', 'end my life', 'end their life', 'want to die', 'wants to die',
  'better off dead', 'hurt myself', 'hurt themselves', 'self harm', 'self-harm',
  'overdose', 'overdosed', 'not breathing', 'unconscious', 'unresponsive',
];
const CRISIS_REPLY =
  "It sounds like things may be really hard right now. I'm an AI assistant and " +
  "not equipped to handle an emergency — but people trained to help are available " +
  "right now, day or night. If you or your loved one is in immediate danger, please " +
  "call 911. You can also call or text 988 (Suicide & Crisis Lifeline), or call " +
  "SAMHSA at 1-800-662-4357. You don't have to face this alone.";

function screenForCrisis(text) {
  const h = String(text || '').toLowerCase();
  return CRISIS_PATTERNS.some((p) => h.includes(p));
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

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

app.use(express.json({ limit: '1mb' }));

// Stripe JSON endpoints (onboarding, rent checkout, platform subscription).
app.use('/api/stripe', stripeRouter);

// Push fan-out endpoints.
app.use('/api/notify', notifyRouter);
app.use('/api/account', accountRouter);
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(apiKey) });
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

app.post('/api/assistant', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  // 1) Safety screen the latest user turn before involving the model.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser && screenForCrisis(lastUser.content)) {
    return res.json({ text: CRISIS_REPLY, crisisFlagged: true });
  }

  if (!anthropic) {
    return res.status(503).json({ error: 'Server is not configured with ANTHROPIC_API_KEY' });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Adaptive thinking lets the model reason only when it helps; low effort
      // keeps replies fast, terse, and inexpensive for a conversational UX.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      // System prompt as a cacheable block. (Note: Opus needs a ~4096-token
      // prefix to actually cache; this prompt is shorter today, so caching is a
      // no-op until the prompt grows — the breakpoint is correct regardless.)
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? ''),
      })),
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    res.json({ text });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Rate limited, please try again shortly.' });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[assistant] Anthropic API error ${err.status}:`, err.message);
      return res.status(502).json({ error: 'Upstream model error.' });
    }
    console.error('[assistant] unexpected error:', err);
    res.status(500).json({ error: 'Internal error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Sober Living Companion server listening on http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}`);
  console.log(`  ANTHROPIC_API_KEY: ${apiKey ? 'set' : 'MISSING (set it in server/.env)'}`);
});
