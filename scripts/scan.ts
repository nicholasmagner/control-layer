import 'dotenv/config';
import { isProvider, PROVIDERS, type Provider } from '@/checks';
import { connectorInfo } from '@/connectors';
import { prisma } from '@/db/prisma';
import { runScan } from '@/scan/run';

/**
 * Runs scans from the command line or a cron job:
 *   npm run scan            -> every configured cloud account
 *   npm run scan -- aws gcp -> only these providers
 * Exits non-zero if any scan fails.
 */
async function main() {
  const args = process.argv.slice(2);
  const bad = args.filter(a => !isProvider(a));
  if (bad.length) throw new Error(`Unknown provider(s): ${bad.join(', ')}. Use ${PROVIDERS.map(p => p.id).join(', ')}.`);
  const providers: Provider[] = args.length ? (args as Provider[]) : (await connectorInfo()).filter(c => c.configured).map(c => c.provider);
  if (providers.length === 0) {
    console.log('No cloud accounts are configured. See "Cloud accounts" in the app for setup instructions.');
    return;
  }

  let failed = false;
  for (const p of providers) {
    const s = await runScan(p, { actor: 'scheduled scan' });
    if (s.ok) {
      console.log(`${p}: ${s.checksEvaluated} checks, ${s.passed} passing / ${s.failed} failing resources, ${s.newFindings} new and ${s.resolvedFindings} resolved findings.`);
      s.warnings.forEach(w => console.log(`  warning: ${w}`));
    } else {
      failed = true;
      console.error(`${p}: scan failed - ${s.error}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch(e => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
