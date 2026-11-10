import 'dotenv/config';
import { syncControls } from '@/assessment/engine';
import { recomputeAssessments } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { loadSampleData } from '@/scan/run';

/**
 * Loads the framework control catalog. Safe to run any number of times.
 *   npm run db:seed            -> controls only
 *   SEED_SAMPLE_DATA=true ...  -> also loads the sample company
 */
async function main() {
  await syncControls();
  await recomputeAssessments();
  console.log(`Framework controls ready (${await prisma.control.count()} controls).`);

  if (process.env.SEED_SAMPLE_DATA === 'true') {
    await loadSampleData('seed script');
    console.log('Sample data loaded.');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
