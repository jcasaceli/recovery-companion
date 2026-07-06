/**
 * Seeds a self-contained DEMO account for tutorial videos:
 *   • 1 owner, 2 house managers, 2 houses
 *   • ~5 residents per house with pre-filled info
 *   • 1 linked demo MEMBER login (to show the resident's-eye view)
 *   • sample notes, UAs, payments, meeting check-ins, forms & agreements
 *
 * Idempotent: re-running wipes the previous demo org + demo logins first.
 *
 * Run:  cd server && node seed-demo.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load SUPABASE_URL / SERVICE_ROLE_KEY from server/.env (no dotenv dep) ----
const env = {};
for (const line of readFileSync(join(__dirname, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// --- Demo constants ----------------------------------------------------------
const PASSWORD = 'DemoPass123!';
const ORG_NAME = 'Serenity Sober Living';
const OWNER = { email: 'owner@serenitydemo.app', name: 'Alex Rivera', phone: '512-555-0100' };
const MANAGERS = [
  { email: 'manager1@serenitydemo.app', name: 'Maria Santos', phone: '512-555-0111' },
  { email: 'manager2@serenitydemo.app', name: 'David Chen', phone: '512-555-0122' },
];
const MEMBER = { email: 'member@serenitydemo.app', name: 'Chris Taylor', phone: '512-555-0133' };

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const iso = (n) => new Date(Date.now() - n * 86400000).toISOString();
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function findUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function wipeOrgsCreatedBy(profileId) {
  const { data: orgs } = await admin.from('organizations').select('id').eq('created_by', profileId);
  for (const o of orgs || []) {
    await admin.from('individuals').delete().eq('org_id', o.id);
    await admin.from('houses').delete().eq('org_id', o.id); // cascades house_staff
    await admin.from('org_members').delete().eq('org_id', o.id);
    await admin.from('organizations').delete().eq('id', o.id);
  }
}

async function cleanup() {
  console.log('• Cleaning up any previous demo data…');
  for (const email of [OWNER.email, ...MANAGERS.map((m) => m.email), MEMBER.email]) {
    const u = await findUser(email);
    if (!u) continue;
    await wipeOrgsCreatedBy(u.id);
    await admin.from('individuals').delete().eq('profile_id', u.id);
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
}

async function createFacilitator(email, name, phone, orgName) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { role: 'facilitator', full_name: name, phone, org_name: orgName || undefined },
  });
  if (error) throw error;
  return data.user;
}

async function main() {
  await cleanup();

  // --- Owner + org (the signup trigger creates the org + owner membership) ----
  console.log('• Creating owner + organization…');
  const owner = await createFacilitator(OWNER.email, OWNER.name, OWNER.phone, ORG_NAME);
  await admin.from('profiles').upsert({ id: owner.id, role: 'facilitator', full_name: OWNER.name, email: OWNER.email, phone: OWNER.phone, email_verified: true }, { onConflict: 'id' });

  let org = null;
  for (let i = 0; i < 10 && !org; i++) {
    const { data } = await admin.from('organizations').select('id, join_code').eq('created_by', owner.id).maybeSingle();
    if (data) org = data; else await new Promise((r) => setTimeout(r, 300));
  }
  if (!org) throw new Error('Org was not auto-created by the signup trigger.');
  await admin.from('organizations').update({ name: ORG_NAME, subscription_status: 'active' }).eq('id', org.id);
  console.log(`  org ${org.id}`);

  // --- Houses -----------------------------------------------------------------
  console.log('• Creating houses…');
  const houseDefs = [
    { name: 'Serenity House East', join_code: 'EAST01' },
    { name: 'Serenity House West', join_code: 'WEST01' },
  ];
  const houses = [];
  for (const h of houseDefs) {
    const { data, error } = await admin.from('houses').insert({ org_id: org.id, name: h.name, join_code: h.join_code, capacity: 6 }).select('id, name, join_code').single();
    if (error) throw error;
    houses.push(data);
  }
  const [east, west] = houses;

  // --- Managers ---------------------------------------------------------------
  console.log('• Creating house managers…');
  const mgrs = [];
  for (const m of MANAGERS) {
    const u = await createFacilitator(m.email, m.name, m.phone, 'stray');
    await wipeOrgsCreatedBy(u.id); // remove the auto stray org
    await admin.from('profiles').upsert({ id: u.id, role: 'facilitator', full_name: m.name, email: m.email, phone: m.phone, email_verified: true }, { onConflict: 'id' });
    await admin.from('org_members').upsert({ org_id: org.id, profile_id: u.id, is_owner: false }, { onConflict: 'org_id,profile_id' });
    mgrs.push(u);
  }
  await admin.from('house_staff').upsert({ house_id: east.id, profile_id: mgrs[0].id }, { onConflict: 'house_id,profile_id' });
  await admin.from('house_staff').upsert({ house_id: west.id, profile_id: mgrs[1].id }, { onConflict: 'house_id,profile_id' });

  // --- Demo member login ------------------------------------------------------
  console.log('• Creating demo member login…');
  const { data: mData, error: mErr } = await admin.auth.admin.createUser({
    email: MEMBER.email, password: PASSWORD, email_confirm: true,
    user_metadata: { role: 'individual', full_name: MEMBER.name, phone: MEMBER.phone },
  });
  if (mErr) throw mErr;
  const memberUser = mData.user;
  await admin.from('profiles').upsert({ id: memberUser.id, role: 'individual', full_name: MEMBER.name, email: MEMBER.email, phone: MEMBER.phone, email_verified: true }, { onConflict: 'id' });

  // --- Residents --------------------------------------------------------------
  console.log('• Creating residents with pre-filled info…');
  const firstNames = ['James', 'Michael', 'Robert', 'Chris', 'Daniel', 'Marcus', 'Tyler', 'Anthony', 'Kevin', 'Brandon'];
  const lastNames = ['Johnson', 'Williams', 'Brown', 'Taylor', 'Miller', 'Davis', 'Garcia', 'Wilson', 'Martinez', 'Lee'];
  const bedsEast = ['Room 1 · Bed A', 'Room 1 · Bed B', 'Room 2 · Bed A', 'Room 2 · Bed B', 'Room 3 · Bed A'];
  const bedsWest = ['Room A · Bed 1', 'Room A · Bed 2', 'Room B · Bed 1', 'Room B · Bed 2', 'Room C · Bed 1'];

  const makeResident = async (idx, house, beds, i, opts = {}) => {
    const first = opts.firstName || firstNames[idx];
    const last = opts.lastName || lastNames[idx];
    const row = {
      org_id: org.id, house_id: house.id, house_name: house.name,
      first_name: first, last_name: last,
      phone: `512-555-0${String(200 + idx).padStart(3, '0')}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      monthly_rent_cents: rand([70000, 85000, 90000, 95000, 100000]),
      rent_due_day: rand([1, 5, 15]),
      level_of_care: 'sober_living',
      sobriety_date: daysAgo(rand([30, 45, 60, 90, 120, 200, 365])),
      program_name: house.name,
      treatment_start_date: daysAgo(rand([30, 60, 90, 150])),
      status: 'in_care',
      bed_label: beds[i],
      move_in_date: daysAgo(rand([20, 45, 70, 120])),
      join_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    };
    if (opts.profileId) row.profile_id = opts.profileId;
    const { data, error } = await admin.from('individuals').insert(row).select('id, first_name, last_name').single();
    if (error) throw error;
    return data;
  };

  const eastResidents = [];
  const westResidents = [];
  // Demo member is the first East resident (linked to the member login).
  eastResidents.push(await makeResident(3, east, bedsEast, 0, { firstName: 'Chris', lastName: 'Taylor', profileId: memberUser.id }));
  for (let i = 1; i < 5; i++) eastResidents.push(await makeResident(i, east, bedsEast, i));
  for (let i = 0; i < 5; i++) westResidents.push(await makeResident(i + 5, west, bedsWest, i));

  const member = eastResidents[0];
  await admin.from('care_relationships').upsert(
    { individual_id: member.id, profile_id: memberUser.id, relation: 'individual', consented_at: new Date().toISOString() },
    { onConflict: 'individual_id,profile_id' },
  );

  // --- Sample activity data ---------------------------------------------------
  console.log('• Adding notes, UAs, payments, check-ins, forms & agreements…');
  const staff = [{ id: owner.id }, { id: mgrs[0].id }, { id: mgrs[1].id }];
  const noteBodies = [
    'Great attitude this week — volunteered to lead the house meeting.',
    'Missed curfew Tuesday; discussed and gave a written reminder.',
    'Started a new job at the warehouse. Very motivated.',
    'Attending 5 meetings/week and has a sponsor. Solid progress.',
    'Reminder to submit updated proof of income by end of month.',
    'Completed 90 days! Celebrated at the Friday house dinner.',
  ];
  const all = [...eastResidents, ...westResidents];
  for (const r of all) {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      await admin.from('notes').insert({ individual_id: r.id, author_id: rand(staff).id, body: rand(noteBodies), visibility: 'facilitators', created_at: iso(rand([1, 3, 6, 10, 14])) });
    }
    const results = ['negative', 'negative', 'negative', 'positive', 'negative'];
    for (let k = 0; k < 2; k++) {
      const res = rand(results);
      await admin.from('ua_tests').insert({ org_id: org.id, individual_id: r.id, tested_at: daysAgo(rand([2, 7, 14, 21, 30])), result: res, substances: res === 'positive' ? 'THC' : null, notes: null });
    }
    await admin.from('payments').insert({ individual_id: r.id, org_id: org.id, amount_cents: 90000, method: rand(['cash', 'cashapp', 'zelle', 'card']), status: 'paid', on_time: rand([true, true, false]), period_month: daysAgo(10).slice(0, 7) + '-01', source: 'manual', paid_at: iso(rand([3, 8, 12])), created_by: owner.id });
  }

  const spots = [
    { address: 'Alano Club, 500 Congress Ave, Austin, TX', lat: 30.267, lon: -97.743 },
    { address: 'First Methodist Church, 1201 Lavaca St, Austin, TX', lat: 30.276, lon: -97.741 },
    { address: 'Serenity Club, 2600 S Lamar Blvd, Austin, TX', lat: 30.243, lon: -97.789 },
  ];
  for (let k = 0; k < 5; k++) {
    const s = rand(spots);
    await admin.from('meeting_checkins').insert({ individual_id: member.id, latitude: s.lat, longitude: s.lon, address: s.address, created_at: iso(rand([1, 3, 5, 8, 12])) });
  }

  const intakeFields = [
    { key: 'full_name', label: 'Full name', type: 'text', required: true },
    { key: 'emergency_contact', label: 'Emergency contact', type: 'phone', required: true },
    { key: 'allergies', label: 'Allergies', type: 'text' },
  ];
  await admin.from('form_responses').insert({ org_id: org.id, individual_id: member.id, title: 'Intake Form', fields: intakeFields, answers: { full_name: 'Chris Taylor', emergency_contact: '512-555-0199', allergies: 'None' }, status: 'completed', signed_at: iso(20), created_by: owner.id });
  await admin.from('form_responses').insert({ org_id: org.id, individual_id: member.id, title: 'Monthly Check-in', fields: intakeFields, answers: {}, status: 'pending', created_by: mgrs[0].id });

  await admin.from('agreements').insert({ org_id: org.id, individual_id: member.id, title: 'House Membership Agreement', status: 'signed', signer_name: 'Chris Taylor', signed_at: iso(25), document_data: 'I agree to abide by the house rules, remain abstinent, attend required meetings, and pay rent on time.' });
  await admin.from('agreements').insert({ org_id: org.id, individual_id: member.id, title: 'Updated House Rules 2026', status: 'pending', document_data: 'Please review and sign the updated 2026 house rules, including the new curfew and chore schedule.' });

  // --- Summary ----------------------------------------------------------------
  console.log('\n========== DEMO ACCOUNT READY ==========');
  console.log(`Org: ${ORG_NAME} (subscription active)`);
  console.log(`\nLog in at app.soberlivingcompanion.com — password for ALL: ${PASSWORD}\n`);
  console.log(`OWNER    ${OWNER.email}`);
  console.log(`MANAGER  ${MANAGERS[0].email}  (assigned to ${east.name})`);
  console.log(`MANAGER  ${MANAGERS[1].email}  (assigned to ${west.name})`);
  console.log(`MEMBER   ${MEMBER.email}        (resident "Chris Taylor" in ${east.name})`);
  console.log(`\nHouse join codes:  ${east.name} = ${east.join_code} · ${west.name} = ${west.join_code}`);
  console.log(`Residents: ${eastResidents.length} in East, ${westResidents.length} in West (${all.length} total)`);
  console.log('========================================\n');
}

main().catch((e) => { console.error('SEED FAILED:', e.message || e); process.exit(1); });
