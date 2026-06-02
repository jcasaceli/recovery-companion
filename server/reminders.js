/**
 * Daily rent automation. Two passes:
 *  1. Member reminders — 3 / 1 / 0 days before due, if unpaid this month.
 *  2. Facilitator late alerts — 1 / 3 / 7 days AFTER due, if still unpaid.
 * Members who've paid (confirmed) this period are skipped in both.
 */

import { createClient } from '@supabase/supabase-js';
import { expoPush, tokensFor } from './notify.js';

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const REMIND_BEFORE = [3, 1, 0]; // days before due → remind member
const ALERT_AFTER = [1, 3, 7];   // days after due → alert facilitators

// Signed day delta from today to this month's due date (negative = overdue).
function dueDelta(dueDay, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(now.getFullYear(), now.getMonth(), dueDay);
  return Math.round((due - today) / 86400000);
}

async function paidThisPeriod(individualId, period) {
  const { data } = await admin
    .from('payments')
    .select('id')
    .eq('individual_id', individualId)
    .eq('period_month', period)
    .eq('status', 'paid')
    .limit(1);
  return !!(data && data.length);
}

async function orgFacilitatorTokens(orgId) {
  if (!orgId) return [];
  const { data: mems } = await admin.from('org_members').select('profile_id').eq('org_id', orgId);
  return tokensFor((mems ?? []).map((m) => m.profile_id));
}

export async function runRentReminders() {
  if (!admin) return { reminded: 0, alerted: 0, checked: 0 };
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: inds } = await admin
    .from('individuals')
    .select('id, first_name, profile_id, org_id, monthly_rent_cents, rent_due_day')
    .not('rent_due_day', 'is', null)
    .not('monthly_rent_cents', 'is', null);

  let reminded = 0;
  let alerted = 0;
  let checked = 0;

  for (const ind of inds ?? []) {
    checked++;
    const delta = dueDelta(ind.rent_due_day, now);
    const isReminder = ind.profile_id && REMIND_BEFORE.includes(delta);
    const isLate = ALERT_AFTER.includes(-delta);
    if (!isReminder && !isLate) continue;
    if (await paidThisPeriod(ind.id, period)) continue;

    const amt = `$${(ind.monthly_rent_cents / 100).toFixed(2)}`;

    if (isReminder) {
      const tokens = await tokensFor([ind.profile_id]);
      const when = delta === 0 ? 'today' : `in ${delta} day${delta > 1 ? 's' : ''}`;
      await expoPush(tokens, 'Rent reminder', `Your rent of ${amt} is due ${when}.`);
      reminded += tokens.length;
    }

    if (isLate) {
      const tokens = await orgFacilitatorTokens(ind.org_id);
      const overdue = -delta;
      await expoPush(tokens, 'Rent overdue', `${ind.first_name}'s rent (${amt}) is ${overdue} day${overdue > 1 ? 's' : ''} overdue.`);
      alerted += tokens.length;
    }
  }
  return { reminded, alerted, checked };
}
