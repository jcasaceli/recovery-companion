/**
 * Stripe integration for Sober Living Companion.
 *
 * Two money flows:
 *  1. RENT — residents pay their sober-living operator. Stripe Connect, charges
 *     created ON the operator's connected account, so 100% goes to the operator
 *     (no platform fee). Supports one-time and recurring (monthly).
 *  2. PLATFORM — operators pay you $60/mo to use the app. A normal subscription
 *     on the platform account.
 *
 * Security: every request must carry the caller's Supabase access token
 * (Authorization: Bearer <token>); we verify it with the Supabase service role
 * and look up their org from the database. The Stripe secret key never leaves
 * the server. Run in TEST MODE until you're ready for real money.
 *
 * Required env (server/.env):
 *   STRIPE_SECRET_KEY=sk_test_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...           ("Your account" destination secret)
 *   STRIPE_WEBHOOK_SECRET_CONNECT=whsec_...   (optional: "Connected accounts" destination secret,
 *                                              for residents paying membership fees by card)
 *   STRIPE_PLATFORM_PRICE_ID=price_...        ($60/mo recurring price you create)
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...          (Project Settings → API → service_role)
 *   PUBLIC_RETURN_URL=https://your-return-page (where Stripe sends users back)
 */

import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const RETURN_URL = process.env.PUBLIC_RETURN_URL || 'https://example.com/return';

// ----- Welcome email for new paying operators (sent on first $60 payment) -----
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WELCOME_FROM = process.env.WELCOME_FROM || 'Sober Living Companion <joseph@soberlivingdirectory.com>';

async function sendWelcomeEmail(to, orgName) {
  if (!RESEND_API_KEY || !to) {
    console.warn('[welcome-email] skipped (missing RESEND_API_KEY or recipient)');
    return;
  }
  const name = orgName || 'your sober living';
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2b2b">
    <div style="background:#3E8E7E;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff;font-weight:800;font-size:18px">🌱 Welcome to Sober Living Companion</div>
    <div style="border:1px solid #e3e0d9;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.6">
      <p style="margin:0 0 12px">Welcome aboard — <strong>${name}</strong> is all set up! 🎉 Your membership is active, and your residents can use the app for free.</p>
      <p style="margin:0 0 8px;font-weight:700">Here's how to get started in 5 steps:</p>
      <ol style="margin:0 0 16px;padding-left:20px;color:#444">
        <li style="margin:6px 0"><strong>Sign in</strong> to the app (use the email you signed up with) — on <a href="https://apps.apple.com/app/sober-living-companion/id6780705094" style="color:#2F6B5F">iPhone</a>, <a href="https://play.google.com/store/apps/details?id=com.soberlivingcompanion.app" style="color:#2F6B5F">Android</a>, or the <a href="https://app.soberlivingcompanion.com" style="color:#2F6B5F">web dashboard</a>.</li>
        <li style="margin:6px 0"><strong>Add your residents</strong> — go to <em>Members → Add member</em>.</li>
        <li style="margin:6px 0"><strong>Your first house</strong> is named <strong>${name}</strong> and already has its own join code. Add a resident's email and we'll automatically email them an app invite with their personal join code.</li>
        <li style="margin:6px 0"><strong>Send agreements &amp; upload documents</strong> from each resident's profile — they sign right on their phone.</li>
        <li style="margin:6px 0"><strong>Track payments &amp; meeting check-ins</strong> on your Dashboard.</li>
      </ol>
      <p style="margin:0 0 16px;background:#F3F7F5;border-radius:10px;padding:12px 14px;color:#2b2b2b"><strong>Running more than one house?</strong> You can add as many houses as you like — each with its own join code — under the <strong>Account</strong> tab.</p>
      <p style="margin:0 0 16px"><a href="https://app.soberlivingcompanion.com" style="background:#2E9E5B;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;display:inline-block">Open my dashboard →</a></p>
      <p style="margin:0;color:#6b6b6b;font-size:14px">Questions? Just reply to this email, or call Joseph at (213) 321-6518. We're a non-profit and we're here to help you succeed.</p>
      <p style="margin:14px 0 0;color:#9a9a9a;font-size:12px">Sober Living Companion · a program of Empower Next Project, a non-profit.</p>
    </div>
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: WELCOME_FROM, to, reply_to: 'joseph@soberlivingdirectory.com', subject: `Welcome to Sober Living Companion 🎉 — here's how to start`, html }),
    });
    if (!r.ok) console.error('[welcome-email] resend failed', r.status, await r.text());
    else console.log('[welcome-email] sent to', to);
  } catch (e) {
    console.error('[welcome-email] error', e);
  }
}

function ready(res) {
  if (!stripe) {
    res.status(503).json({ error: 'Stripe not configured (set STRIPE_SECRET_KEY).' });
    return false;
  }
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
    return false;
  }
  return true;
}

/** Verify the caller's Supabase token and return their user, or null. */
async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

/** The org a facilitator belongs to (with its Stripe fields). */
async function facilitatorOrg(userId) {
  const { data: m } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle();
  if (!m) return null;
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', m.org_id)
    .maybeSingle();
  return org;
}

/** The org (operator) a resident pays rent to, via their individual record. */
async function residentOrg(userId) {
  const { data: ind } = await supabaseAdmin
    .from('individuals')
    .select('id, org_id, monthly_rent_cents')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle();
  if (!ind?.org_id) return null;
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', ind.org_id)
    .maybeSingle();
  return org ? { org, individual: ind } : null;
}

export const stripeRouter = express.Router();

// ── Connect: start onboarding ──────────────────────────────────────────────
stripeRouter.post('/connect/onboard', async (req, res) => {
  if (!ready(res)) return;
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const org = await facilitatorOrg(user.id);
    if (!org) return res.status(400).json({ error: 'No organization found for this user.' });

    const CAPS = { card_payments: { requested: true }, transfers: { requested: true } };
    let accountId = org.stripe_account_id;
    if (!accountId) {
      // Request card_payments + transfers so the account can accept rent charges.
      const account = await stripe.accounts.create({ type: 'express', capabilities: CAPS });
      accountId = account.id;
      await supabaseAdmin.from('organizations').update({ stripe_account_id: accountId }).eq('id', org.id);
    } else {
      // Ensure capabilities are requested on accounts created before this fix.
      try {
        await stripe.accounts.update(accountId, { capabilities: CAPS });
      } catch (e) {
        console.warn('[stripe] capability update', e.message);
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: RETURN_URL,
      return_url: RETURN_URL,
      type: 'account_onboarding',
    });
    res.json({ url: link.url });
  } catch (e) {
    console.error('[stripe] onboard', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Connect: status ────────────────────────────────────────────────────────
stripeRouter.get('/connect/status', async (req, res) => {
  if (!ready(res)) return;
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const org = await facilitatorOrg(user.id);
    if (!org?.stripe_account_id) return res.json({ connected: false, chargesEnabled: false });
    const acct = await stripe.accounts.retrieve(org.stripe_account_id);
    res.json({
      connected: true,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
      detailsSubmitted: acct.details_submitted,
    });
  } catch (e) {
    console.error('[stripe] status', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Rent: resident pays operator (one-time or recurring). 100% to operator. ──
stripeRouter.post('/rent/checkout', async (req, res) => {
  if (!ready(res)) return;
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const found = await residentOrg(user.id);
    const NOT_READY = "Your sober living home hasn't set up payments yet — check with your house manager.";
    if (!found?.org?.stripe_account_id) {
      return res.status(400).json({ error: NOT_READY });
    }
    const connectedAccount = found.org.stripe_account_id;

    // The account may exist but not be fully onboarded (no business name / can't
    // accept charges yet). Check before sending the resident to a broken checkout.
    try {
      const acct = await stripe.accounts.retrieve(connectedAccount);
      if (!acct.charges_enabled) {
        return res.status(400).json({ error: NOT_READY });
      }
    } catch (e) {
      return res.status(400).json({ error: NOT_READY });
    }

    const recurring = req.body?.recurring === true;
    const amount = Number(req.body?.amountCents) || found.individual.monthly_rent_cents || 0;
    if (amount < 100) return res.status(400).json({ error: 'Enter a valid amount.' });

    const line_items = [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: recurring ? 'Monthly rent' : 'Rent payment' },
          unit_amount: amount,
          ...(recurring ? { recurring: { interval: 'month' } } : {}),
        },
        quantity: 1,
      },
    ];

    // Direct charge ON the connected account → funds settle to the operator,
    // Stripe fees come out of their balance, and there is NO application fee.
    const rentMeta = {
      kind: 'rent',
      individual_id: found.individual.id,
      org_id: found.org.id,
      amount_cents: String(amount),
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: recurring ? 'subscription' : 'payment',
        line_items,
        success_url: RETURN_URL,
        cancel_url: RETURN_URL,
        customer_email: user.email || undefined,
        metadata: rentMeta,
        // Carry metadata onto the subscription so recurring invoices can be
        // attributed back to the member.
        ...(recurring ? { subscription_data: { metadata: rentMeta } } : {}),
      },
      { stripeAccount: connectedAccount },
    );
    res.json({ url: session.url });
  } catch (e) {
    console.error('[stripe] rent checkout', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Platform: operator subscribes to the app ($60/mo) ────────────────────────
stripeRouter.post('/platform/subscribe', async (req, res) => {
  if (!ready(res)) return;
  if (!process.env.STRIPE_PLATFORM_PRICE_ID) {
    return res.status(503).json({ error: 'STRIPE_PLATFORM_PRICE_ID not set.' });
  }
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const org = await facilitatorOrg(user.id);
    if (!org) return res.status(400).json({ error: 'No organization found.' });

    // Allow the caller (e.g. the website signup flow) to come back to a specific
    // page after checkout so it can continue onboarding (add house managers).
    const successUrl = (req.body && req.body.successUrl) || RETURN_URL;
    const cancelUrl = (req.body && req.body.cancelUrl) || RETURN_URL;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PLATFORM_PRICE_ID, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email || undefined,
      metadata: { org_id: org.id },
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[stripe] platform subscribe', e);
    res.status(500).json({ error: e.message });
  }
});

// Insert a card payment record (one-time or recurring), computing on-time.
async function recordCardPayment(meta, amountTotal) {
  if (!supabaseAdmin) return;
  const { data: ind } = await supabaseAdmin
    .from('individuals')
    .select('rent_due_day')
    .eq('id', meta.individual_id)
    .maybeSingle();
  const now = new Date();
  const onTime = ind?.rent_due_day ? now.getUTCDate() <= ind.rent_due_day : null;
  await supabaseAdmin.from('payments').insert({
    individual_id: meta.individual_id,
    org_id: meta.org_id ?? null,
    amount_cents: Number(meta.amount_cents) || amountTotal || 0,
    method: 'card',
    source: 'stripe',
    status: 'paid',
    on_time: onTime,
    period_month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
  });
}

// ── Webhook (mounted with express.raw in index.js) ───────────────────────────
export async function stripeWebhook(req, res) {
  if (!stripe) return res.status(503).end();
  const sig = req.headers['stripe-signature'];
  // We may have two event destinations: one scoped to "Your account" (platform
  // $60 subscription) and one scoped to "Connected accounts" (residents paying
  // membership fees by card). Each destination has its own signing secret, so we
  // verify the payload against whichever one matches.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
  ].filter(Boolean);
  let event;
  let lastErr;
  for (const secret of secrets) {
    try { event = stripe.webhooks.constructEvent(req.body, sig, secret); break; }
    catch (e) { lastErr = e; }
  }
  if (!event) {
    console.error('[stripe] webhook signature failed', lastErr?.message);
    return res.status(400).send(`Webhook Error: ${lastErr?.message || 'no matching signing secret'}`);
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const acct = event.data.object;
        if (supabaseAdmin) {
          await supabaseAdmin
            .from('organizations')
            .update({ charges_enabled: acct.charges_enabled })
            .eq('stripe_account_id', acct.id);
        }
        break;
      }
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.metadata?.kind === 'rent' && s.mode === 'payment' && s.metadata.individual_id) {
          // One-time card rent. (Recurring is recorded via invoice.paid below,
          // to avoid double-counting the first subscription charge.)
          await recordCardPayment(s.metadata, s.amount_total);
        } else if (supabaseAdmin && s.metadata?.org_id && s.metadata?.kind !== 'rent') {
          // Platform subscription activated → mark active and welcome the operator.
          await supabaseAdmin
            .from('organizations')
            .update({ subscription_status: 'active', stripe_subscription_id: s.subscription })
            .eq('id', s.metadata.org_id);
          // Look up the org name for a personalized welcome, then email directions.
          let orgName = s.customer_details?.name;
          try {
            const { data: org } = await supabaseAdmin.from('organizations').select('name').eq('id', s.metadata.org_id).maybeSingle();
            if (org?.name) orgName = org.name;
          } catch {}
          const to = s.customer_email || s.customer_details?.email;
          await sendWelcomeEmail(to, orgName);
        }
        break;
      }
      case 'invoice.paid': {
        // Recurring rent charge on a connected account.
        const inv = event.data.object;
        if (event.account && inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(inv.subscription, { stripeAccount: event.account });
          const md = sub.metadata || {};
          if (md.kind === 'rent' && md.individual_id) {
            await recordCardPayment(md, inv.amount_paid);
          }
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // Platform subscription lifecycle (the org's $60/mo). Connected-account
        // rent subscriptions carry event.account — ignore those here so a
        // resident's rent sub never touches the org's app-access status.
        if (!event.account && supabaseAdmin) {
          const sub = event.data.object;
          const map = {
            active: 'active', trialing: 'trialing', past_due: 'past_due',
            unpaid: 'past_due', paused: 'past_due', incomplete: 'past_due',
            canceled: 'canceled', incomplete_expired: 'canceled',
          };
          const status = event.type === 'customer.subscription.deleted'
            ? 'canceled'
            : (map[sub.status] || 'past_due');
          await supabaseAdmin
            .from('organizations')
            .update({ subscription_status: status })
            .eq('stripe_subscription_id', sub.id);
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe] webhook handler', e);
    res.status(500).end();
  }
}
