/**
 * House managers. The org owner can create additional staff logins that share
 * the facilitator console (manage residents, UAs, payments, agreements) but
 * cannot see billing or manage other managers. Each manager adds a $25/mo seat
 * to the owner's Stripe subscription.
 *
 * House managers are modeled as role='facilitator' members of the org with
 * is_owner=false, so the existing is_facilitator_for() RLS already grants them
 * resident access. "Owner" = the profile that created the organization.
 *
 * Requires STRIPE_MANAGER_PRICE_ID (a $25/mo recurring price) for auto-billing;
 * without it, managers are still created but no seat is charged.
 */
import { Router } from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const MANAGER_PRICE_ID = process.env.STRIPE_MANAGER_PRICE_ID;
const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function getUser(req) {
  if (!supabaseAdmin) return null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

/** The org this user OWNS (created), or null if they're not an owner. */
async function ownerOrg(userId) {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/** Count non-owner members (= house managers) and sync the Stripe seat count. */
async function syncManagerSeats(org) {
  const { count } = await supabaseAdmin
    .from('org_members')
    .select('profile_id', { count: 'exact', head: true })
    .eq('org_id', org.id)
    .eq('is_owner', false);
  const seats = count || 0;

  if (!stripe || !MANAGER_PRICE_ID || !org.stripe_subscription_id) {
    return { billed: false, seats };
  }
  try {
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const item = sub.items.data.find((i) => i.price?.id === MANAGER_PRICE_ID);
    if (seats === 0) {
      if (item) await stripe.subscriptionItems.del(item.id);
    } else if (item) {
      await stripe.subscriptionItems.update(item.id, { quantity: seats });
    } else {
      await stripe.subscriptionItems.create({ subscription: sub.id, price: MANAGER_PRICE_ID, quantity: seats });
    }
    return { billed: true, seats };
  } catch (e) {
    console.error('[managers] seat sync failed', e.message);
    return { billed: false, seats, error: e.message };
  }
}

function tempPassword() {
  return 'Mgr-' + Math.random().toString(36).slice(2, 8) + 'A9!';
}

export const managersRouter = Router();

// List the owner's house managers.
managersRouter.get('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can manage house managers.' });

  const { data: members } = await supabaseAdmin
    .from('org_members').select('profile_id').eq('org_id', org.id).eq('is_owner', false);
  const ids = (members || []).map((m) => m.profile_id);
  let managers = [];
  if (ids.length) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', ids);
    managers = (profs || []).map((p) => ({ id: p.id, name: p.full_name, email: p.email }));
  }
  res.json({ managers, priceConfigured: Boolean(MANAGER_PRICE_ID) });
});

// Create a new house manager (returns a one-time temp password to share).
managersRouter.post('/', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can add house managers.' });

  const name = (req.body?.name || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  try {
    const password = tempPassword();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role: 'facilitator', full_name: name },
    });
    if (createErr) {
      if (/already/i.test(createErr.message)) return res.status(409).json({ error: 'That email already has an account.' });
      throw createErr;
    }
    const uid = created.user.id;
    await supabaseAdmin.from('profiles').upsert(
      { id: uid, role: 'facilitator', full_name: name, email, email_verified: true },
      { onConflict: 'id' },
    );
    await supabaseAdmin.from('org_members').upsert(
      { org_id: org.id, profile_id: uid, is_owner: false },
      { onConflict: 'org_id,profile_id' },
    );
    const billing = await syncManagerSeats(org);
    res.json({ email, password, billed: billing.billed, seats: billing.seats });
  } catch (e) {
    console.error('[managers] create', e);
    res.status(500).json({ error: e.message });
  }
});

// Remove a house manager (deletes their login + their seat).
managersRouter.delete('/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY.' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  const org = await ownerOrg(user.id);
  if (!org) return res.status(403).json({ error: 'Only the owner can remove house managers.' });

  const targetId = req.params.id;
  try {
    // Only remove if they're actually a non-owner member of this org.
    const { data: m } = await supabaseAdmin
      .from('org_members').select('profile_id,is_owner')
      .eq('org_id', org.id).eq('profile_id', targetId).maybeSingle();
    if (!m || m.is_owner) return res.status(400).json({ error: 'Not a house manager of your org.' });

    await supabaseAdmin.from('org_members').delete().eq('org_id', org.id).eq('profile_id', targetId);
    await supabaseAdmin.auth.admin.deleteUser(targetId).catch(() => {});
    const billing = await syncManagerSeats(org);
    res.json({ ok: true, seats: billing.seats });
  } catch (e) {
    console.error('[managers] delete', e);
    res.status(500).json({ error: e.message });
  }
});
