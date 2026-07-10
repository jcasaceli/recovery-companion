/**
 * Campaign orchestrator: runs the directory + app + follow-up senders on a
 * schedule (8am America/Los_Angeles) with the same caps and 90s spacing as the
 * old Mac cron. Send state lives in Supabase, so it's safe across redeploys.
 */
import cron from 'node-cron';
import { importHistoryOnce } from './lib.js';
import { runDirectory } from './directory.js';
import { runAppOutreach, runAppFollowups } from './app.js';

const CAPS = { directory: 50, app: 30, followups: 35 };
const DELAY_MS = 90000;

/** Run everything once. Directory runs concurrently with (app → follow-ups);
 *  the two app steps are sequential so we don't double the app subdomain's rate. */
export async function runAll({ dry = false, log = console.log } = {}) {
  log(`[campaigns] run start (dry=${dry}) ${new Date().toISOString()}`);
  const [directory, appChain] = await Promise.all([
    runDirectory({ cap: CAPS.directory, delayMs: DELAY_MS, dry, log }).catch((e) => ({ campaign: 'directory', error: e.message })),
    (async () => {
      const out = await runAppOutreach({ cap: CAPS.app, delayMs: DELAY_MS, dry, log }).catch((e) => ({ campaign: 'app', error: e.message }));
      const fu = await runAppFollowups({ cap: CAPS.followups, delayMs: DELAY_MS, dry, log }).catch((e) => ({ campaign: 'app_followup', error: e.message }));
      return [out, fu];
    })(),
  ]);
  const results = [directory, ...appChain];
  log(`[campaigns] run complete: ${JSON.stringify(results)}`);
  return results;
}

let running = false;
async function guardedRun(opts) {
  if (running) { console.warn('[campaigns] previous run still going — skipping'); return; }
  running = true;
  try { return await runAll(opts); }
  finally { running = false; }
}

/** Import the Mac history once, then schedule the daily 8am Pacific run. */
export async function initCampaigns() {
  try {
    const imported = await importHistoryOnce();
    console.log('[campaigns] history import:', JSON.stringify(imported));
  } catch (e) { console.warn('[campaigns] history import failed:', e.message); }

  // Off by default until you flip CAMPAIGNS_ENABLED=true — so deploying can't
  // accidentally start blasting before the dry-run is verified.
  if (process.env.CAMPAIGNS_ENABLED === 'true') {
    cron.schedule('0 8 * * *', () => { guardedRun({ dry: false }); }, { timezone: 'America/Los_Angeles' });
    console.log('[campaigns] scheduled: 8:00 America/Los_Angeles (ENABLED)');
  } else {
    console.log('[campaigns] scheduling SKIPPED (set CAMPAIGNS_ENABLED=true to arm the 8am cron)');
  }
}

export { guardedRun };
