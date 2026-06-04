/**
 * Seeds two fully-featured demo accounts (facilitator + member) with realistic
 * data, including a membership agreement to sign. Idempotent — safe to re-run.
 *
 * Run from the server/ directory:   node seed-demo.mjs
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in server/.env.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGREEMENT_DOC = readFileSync(join(__dirname, 'seed', 'agreement.txt'), 'utf8').trim();

const PASSWORD = 'SoberDemo2026!';
const FAC_EMAIL = 'demo.facilitator@soberlivingcompanion.com';
const MEM_EMAIL = 'demo.member@soberlivingcompanion.com';
const period = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

async function ensureUser(email, meta) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
  if (!error) { console.log(`  created auth user ${email}`); return data.user; }
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = list.users.find((x) => (x.email || '').toLowerCase() === email.toLowerCase());
  if (!u) throw error;
  await admin.auth.admin.updateUserById(u.id, { password: PASSWORD, user_metadata: meta });
  console.log(`  reused existing auth user ${email}`);
  return u;
}

const code6 = () => Math.random().toString(16).slice(2, 8).toUpperCase();

async function ensureProfile(id, role, fullName, email) {
  const { error } = await admin.from('profiles').upsert(
    { id, role, full_name: fullName, email, email_verified: true },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

async function main() {
  console.log('Seeding demo accounts…');

  // 1) Facilitator account + profile (explicit — does not rely on the DB trigger).
  const fac = await ensureUser(FAC_EMAIL, { role: 'facilitator', full_name: 'Dana Operator', org_name: 'Demo Sober Living' });
  await ensureProfile(fac.id, 'facilitator', 'Dana Operator', FAC_EMAIL);

  // 2) Org (create if missing), mark subscribed (unlocks the console), owner membership.
  let { data: orgs } = await admin.from('organizations').select('*').eq('created_by', fac.id).order('created_at', { ascending: true });
  let org = orgs && orgs[0];
  if (!org) {
    const { data, error } = await admin.from('organizations')
      .insert({ name: 'Demo Sober Living', created_by: fac.id, join_code: code6(), subscription_status: 'active' })
      .select('*').single();
    if (error) throw error;
    org = data;
  } else {
    await admin.from('organizations').update({ subscription_status: 'active', name: 'Demo Sober Living' }).eq('id', org.id);
  }
  await admin.from('org_members').upsert({ org_id: org.id, profile_id: fac.id, is_owner: true }, { onConflict: 'org_id,profile_id' });
  console.log(`  org "Demo Sober Living" → subscription active · join code ${org.join_code}`);

  // 3) Member account + profile.
  const mem = await ensureUser(MEM_EMAIL, { role: 'individual', full_name: 'Jamie Rivera' });
  await ensureProfile(mem.id, 'individual', 'Jamie Rivera', MEM_EMAIL);

  // 4) Link the member to the org as a resident (idempotent on profile_id).
  let { data: memInd } = await admin.from('individuals').select('id').eq('profile_id', mem.id).maybeSingle();
  if (!memInd) {
    const { data, error } = await admin.from('individuals').insert({
      org_id: org.id, profile_id: mem.id, first_name: 'Jamie', last_name: 'Rivera',
      level_of_care: 'sober_living', status: 'in_care', monthly_rent_cents: 70000, rent_due_day: 1,
      sobriety_date: '2026-01-15',
    }).select('id').single();
    if (error) throw error;
    memInd = data;
  } else {
    await admin.from('individuals').update({ org_id: org.id, monthly_rent_cents: 70000, rent_due_day: 1, status: 'in_care', sobriety_date: '2026-01-15' }).eq('id', memInd.id);
  }
  await admin.from('care_relationships').upsert(
    { individual_id: memInd.id, profile_id: mem.id, relation: 'individual', consented_at: new Date().toISOString() },
    { onConflict: 'individual_id,profile_id' },
  );
  console.log(`  member resident record ready (${memInd.id})`);

  // 5) Reset + reseed the demo-only data (extra residents, payments, agreements, check-ins).
  await admin.from('individuals').delete().eq('org_id', org.id).is('profile_id', null); // extra demo residents (cascades payments/agreements)
  await admin.from('payments').delete().eq('org_id', org.id);
  await admin.from('meeting_checkins').delete().eq('individual_id', memInd.id);
  const agErr = (await admin.from('agreements').delete().eq('individual_id', memInd.id)).error;
  const hasAgreements = !agErr; // table exists only after migration 0019 is applied

  // Extra residents (no login) so the roster + payments analytics look real.
  const residents = [
    { first_name: 'Marcus', last_name: 'Reed', monthly_rent_cents: 80000, rent_due_day: 1 },
    { first_name: 'Andre', last_name: 'Wilson', monthly_rent_cents: 75000, rent_due_day: 5 },
    { first_name: 'Chris', last_name: 'Nolan', monthly_rent_cents: 90000, rent_due_day: 1 },
  ];
  const ids = {};
  for (const r of residents) {
    const { data, error } = await admin.from('individuals').insert({
      org_id: org.id, level_of_care: 'sober_living', status: 'in_care', ...r,
    }).select('id').single();
    if (error) throw error;
    ids[r.first_name] = data.id;
  }
  console.log('  added 3 sample residents');

  // Payments this month: Marcus paid in full, Andre partial, Jamie + Chris unpaid.
  await admin.from('payments').insert([
    { individual_id: ids.Marcus, org_id: org.id, amount_cents: 80000, method: 'cashapp', status: 'paid', on_time: true, period_month: period, source: 'manual' },
    { individual_id: ids.Andre, org_id: org.id, amount_cents: 30000, method: 'zelle', status: 'paid', on_time: true, period_month: period, source: 'manual' },
    { individual_id: memInd.id, org_id: org.id, amount_cents: 35000, method: 'card', status: 'paid', on_time: true, period_month: period, source: 'stripe' },
  ]);
  console.log('  added sample payments');

  // Meeting check-ins for the member this week.
  const now = Date.now();
  await admin.from('meeting_checkins').insert([
    { individual_id: memInd.id, latitude: 34.0522, longitude: -118.2437, address: 'Alano Club, 123 Main St', created_at: new Date(now - 2 * 86400000).toISOString() },
    { individual_id: memInd.id, latitude: 34.0537, longitude: -118.2611, address: 'Hillside Fellowship Hall', created_at: new Date(now - 5 * 86400000).toISOString() },
  ]);
  console.log('  added meeting check-ins');

  // Agreements: a PENDING one for the member to sign, and a SIGNED one (Marcus)
  // so the facilitator side shows a completed signature. Requires migration 0019.
  if (hasAgreements) {
    await admin.from('agreements').insert({
      org_id: org.id, individual_id: memInd.id, title: 'Membership Agreement 2026',
      document_data: AGREEMENT_DOC, status: 'pending', created_by: fac.id,
    });
    await admin.from('agreements').insert({
      org_id: org.id, individual_id: ids.Marcus, title: 'Membership Agreement 2026',
      document_data: AGREEMENT_DOC, status: 'signed', created_by: fac.id,
      signer_name: 'Marcus Reed', signed_at: '2026-05-15T15:30:00.000Z',
      // A flowing, signature-like scribble.
      signature_paths: [
        'M20,82 C34,32 54,32 60,76 C64,108 80,108 88,70 C95,36 110,36 120,80 C128,114 150,58 166,74 C186,94 202,40 216,70 C228,94 250,54 276,70',
        'M28,100 C110,118 190,108 272,94',
      ],
    });
    console.log('  added agreements (1 pending for member, 1 signed)');
  } else {
    console.log('  ⚠️  SKIPPED agreements — run migration 0019 in Supabase, then re-run this seed.');
  }

  console.log('\n✅ Demo accounts ready:\n');
  console.log(`  FACILITATOR  ${FAC_EMAIL}   /   ${PASSWORD}`);
  console.log(`  MEMBER       ${MEM_EMAIL}   /   ${PASSWORD}`);
  console.log(`\n  Org: Demo Sober Living · join code ${org.join_code}\n`);
}

main().catch((e) => { console.error('Seed failed:', e.message || e); process.exit(1); });
