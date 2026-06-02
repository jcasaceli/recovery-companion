/**
 * Recurring rent reminders. Runs daily: for each linked member with a rent
 * amount + due day, if rent is due in 3 / 1 / 0 days AND they haven't paid this
 * month, push them a reminder. Sender-agnostic (system push).
 */

import { createClient } from '@supabase/supabase-js';
import { expoPush, tokensFor } from './notify.js';

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Remind on these offsets (days before due). 0 = due today.
const REMIND_OFFSETS = [3, 1, 0];

function daysUntilDue(dueDay, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (due < today) due = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  return Math.round((due - today) / 86400000);
}

export async function runRentReminders() {
  if (!admin) return { sent: 0, checked: 0 };
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: inds } = await admin
    .from('individuals')
    .select('id, first_name, profile_id, monthly_rent_cents, rent_due_day')
    .not('rent_due_day', 'is', null)
    .not('monthly_rent_cents', 'is', null);

  let sent = 0;
  let checked = 0;
  for (const ind of inds ?? []) {
    if (!ind.profile_id) continue; // member account not linked yet
    checked++;
    const daysUntil = daysUntilDue(ind.rent_due_day, now);
    if (!REMIND_OFFSETS.includes(daysUntil)) continue;

    // Skip if already paid (confirmed) this period.
    const { data: pays } = await admin
      .from('payments')
      .select('id')
      .eq('individual_id', ind.id)
      .eq('period_month', period)
      .eq('status', 'paid')
      .limit(1);
    if (pays && pays.length) continue;

    const tokens = await tokensFor([ind.profile_id]);
    const amt = `$${(ind.monthly_rent_cents / 100).toFixed(2)}`;
    const when = daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
    await expoPush(tokens, 'Rent reminder', `Your rent of ${amt} is due ${when}.`);
    sent += tokens.length;
  }
  return { sent, checked };
}
