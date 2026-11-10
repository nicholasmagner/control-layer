/**
 * Runs once when the server starts: makes sure the control catalog is loaded
 * and, if SCAN_INTERVAL_HOURS is set, schedules scans of every configured
 * cloud account. (For serverless hosting, run `npm run scan` from a cron job
 * instead.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { syncControls } = await import('./assessment/engine');
  try {
    await syncControls();
  } catch (err) {
    console.error('[startup] Could not load the control catalog. Is the database running and migrated?', err);
    return;
  }

  const { scanIntervalHours } = await import('./lib/settings');
  const hours = scanIntervalHours();
  if (!hours) return;

  const { connectorInfo } = await import('./connectors');
  const { runScan } = await import('./scan/run');
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const c of (await connectorInfo()).filter(x => x.configured)) {
        const s = await runScan(c.provider, { actor: 'scheduled scan' });
        console.log(`[scheduled scan] ${c.provider}: ${s.ok ? `${s.failed} failing resources` : `failed - ${s.error}`}`);
      }
    } finally {
      running = false;
    }
  };
  setInterval(tick, hours * 3_600_000).unref();
  console.log(`[startup] Scheduled scans every ${hours} hour(s).`);
}
