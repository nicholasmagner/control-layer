/**
 * Runs once when the server starts: makes sure the control catalog is loaded
 * and starts the automatic-scan scheduler. The schedule itself is a setting
 * (Settings > Automatic scans), checked every few minutes, so changes take
 * effect without a restart. For serverless hosting, run `npm run scan` from a
 * cron job instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { backfillCrosswalkLinks, recomputeAssessments, syncControls } = await import('./assessment/engine');
  try {
    await syncControls();
    // Existing evidence also counts toward frameworks added since it was collected.
    if ((await backfillCrosswalkLinks()) > 0) await recomputeAssessments();
  } catch (err) {
    console.error('[startup] Could not load the control catalog. Is the database running and migrated?', err);
    return;
  }

  const { getSettings } = await import('./lib/settings');
  const { connectorInfo } = await import('./connectors');
  const { runScan } = await import('./scan/run');
  const { prisma } = await import('./db/prisma');

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const hours = (await getSettings()).scanIntervalHours;
      if (!hours) return;
      for (const c of (await connectorInfo()).filter(x => x.configured)) {
        const last = await prisma.checkRun.findFirst({
          where: { provider: c.provider, isSample: false },
          orderBy: { startedAt: 'desc' },
          select: { startedAt: true },
        });
        if (last && Date.now() - last.startedAt.getTime() < hours * 3_600_000) continue;
        const s = await runScan(c.provider, { actor: 'scheduled scan' });
        console.log(`[scheduled scan] ${c.provider}: ${s.ok ? `${s.failed} failing resources` : `failed - ${s.error}`}`);
      }
    } catch (err) {
      console.error('[scheduled scan]', err);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 5 * 60_000).unref();
  setTimeout(tick, 60_000).unref();
}
