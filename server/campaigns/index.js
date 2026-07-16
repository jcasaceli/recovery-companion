/**
 * Campaign orchestrator: runs the directory + app + follow-up senders on a
 * schedule (8am America/Los_Angeles) with the same caps and 90s spacing as the
 * old Mac cron. Send state lives in Supabase, so it's safe across redeploys.
 */
import cron from 'node-cron';
import { importHistoryOnce, sentTodayCount } from './lib.js';
import { runDirectory } from './directory.js';
import { runAppOutreach, runAppFollowups } from './app.js';

const CAPS = { directory: 50, app: 30, followups: 35 };
const DELAY_MS = 90000;

/** Caps are DAILY, not per-run: subtract what already went out today. A run that
 *  died partway (a redeploy restarts this service and kills it mid-send) can
 *  then be topped up by a later catch-up run without double-sending. */
async function remainingToday(campaign, cap) {
  const already = await sentTodayCount(campaign);
  return { cap: Math.max(0, cap - already), already };
}

/** Run everything once. Directory runs concurrently with (app → follow-ups);
 *  the two app steps are sequential so we don't double the app subdomain's rate. */
export async function runAll({ dry = false, log = console.log } = {}) {
  if (!dry && !process.env.UNSUB_SECRET) {
    throw new Error('UNSUB_SECRET not set — refusing to send (unsubscribe links would break)');
  }
  log(`[campaigns] run start (dry=${dry}) ${new Date().toISOString()}`);

  const [dirLeft, appLeft, fuLeft] = await Promise.all([
    remainingToday('directory', CAPS.directory),
    remainingToday('app', CAPS.app),
    remainingToday('app_followup', CAPS.followups),
  ]);
  log(`[campaigns] today so far — directory ${dirLeft.already}/${CAPS.directory}, app ${appLeft.already}/${CAPS.app}, app_followup ${fuLeft.already}/${CAPS.followups} · remaining ${dirLeft.cap}/${appLeft.cap}/${fuLeft.cap}`);

  const skip = (campaign) => ({ campaign, sent: 0, skipped: 'daily cap already met' });
  const [directory, appChain] = await Promise.all([
    dirLeft.cap === 0
      ? skip('directory')
      : runDirectory({ cap: dirLeft.cap, delayMs: DELAY_MS, dry, log }).catch((e) => ({ campaign: 'directory', error: e.message })),
    (async () => {
      const out = appLeft.cap === 0
        ? skip('app')
        : await runAppOutreach({ cap: appLeft.cap, delayMs: DELAY_MS, dry, log }).catch((e) => ({ campaign: 'app', error: e.message }));
      const fu = fuLeft.cap === 0
        ? skip('app_followup')
        : await runAppFollowups({ cap: fuLeft.cap, delayMs: DELAY_MS, dry, log }).catch((e) => ({ campaign: 'app_followup', error: e.message }));
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
    // Catch-up runs. Because caps are now "remaining today", these are no-ops
    // once the day's quota is met — but if the 8am run was cut short (a deploy
    // restarts this service and kills it mid-send), they finish the day's send
    // instead of silently losing it.
    cron.schedule('0 11 * * *', () => { guardedRun({ dry: false }); }, { timezone: 'America/Los_Angeles' });
    cron.schedule('0 14 * * *', () => { guardedRun({ dry: false }); }, { timezone: 'America/Los_Angeles' });
    console.log('[campaigns] scheduled: 8:00 America/Los_Angeles + catch-up 11:00 & 14:00 (ENABLED)');
  } else {
    console.log('[campaigns] scheduling SKIPPED (set CAMPAIGNS_ENABLED=true to arm the 8am cron)');
  }
}

export { guardedRun };
