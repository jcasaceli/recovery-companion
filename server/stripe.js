/**
 * Stripe integration for Recovery Companion.
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
 *   STRIPE_WEBHOOK_SECRET=whsec_...           (from `stripe listen` or dashboard)
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

    let accountId = org.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express' });
      accountId = account.id;
      await supabaseAdmin.from('organizations').update({ stripe_account_id: accountId }).eq('id', org.id);
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
    if (!found?.org?.stripe_account_id) {
      return res.status(400).json({ error: 'Your sober living has not set up payments yet.' });
    }
    const connectedAccount = found.org.stripe_account_id;

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PLATFORM_PRICE_ID, quantity: 1 }],
      success_url: RETURN_URL,
      cancel_url: RETURN_URL,
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
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[stripe] webhook signature failed', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
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
          // Platform subscription activated.
          await supabaseAdmin
            .from('organizations')
            .update({ subscription_status: 'active', stripe_subscription_id: s.subscription })
            .eq('id', s.metadata.org_id);
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
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe] webhook handler', e);
    res.status(500).end();
  }
}
