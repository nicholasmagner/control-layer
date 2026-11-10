// Regenerates the README screenshots from a running instance.
//   1. Start the app on an EMPTY database: npm run build && npm start
//   2. DATABASE_URL=<same database> node scripts/screenshots.mjs [http://localhost:3000]
// Creates an admin account, loads the sample company, fills in a demo
// compliance program (scripts/screenshot-data.ts) and captures each screen.
// Needs Playwright with Chromium: npm i -g playwright && npx playwright install chromium
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const EMAIL = 'maria@acme.example';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
// Hide the development-mode indicator if the app is running with `npm run dev`.
await page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s);
}));
const shot = async (name, opts = {}) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}${name}.png`, ...opts }); console.log('saved', name); };
const tab = async id => { await page.goto(`${BASE}/?tab=${id}`); await page.waitForLoadState('networkidle'); };
const tryClick = async locator => { try { await locator.first().click({ timeout: 5000 }); return true; } catch { return false; } };

await page.goto(`${BASE}/setup`);
await page.getByLabel('Your name').fill('Maria Lopez');
await page.getByLabel('Work email').fill(EMAIL);
await page.getByLabel('Password').fill('screenshots-only-password');
await page.getByRole('button', { name: 'Create workspace' }).click();
await page.getByRole('button', { name: 'Load sample data' }).first().click();
await page.getByText('You are viewing').waitFor({ timeout: 120_000 });

execFileSync('npx', ['tsx', new URL('./screenshot-data.ts', import.meta.url).pathname, EMAIL], { stdio: 'inherit' });

await tab('dashboard');
await shot('dashboard');

await tab('controls');
await tryClick(page.getByRole('button', { name: /CC6\.6/ }));
await shot('controls');

await tab('findings');
await tryClick(page.getByRole('button', { name: /No SSH\/RDP open to the internet/ }));
await shot('findings');
await page.keyboard.press('Escape');

await tab('policies');
await shot('policies');

await tab('devices');
await shot('devices');

await tab('risks');
await page.getByText('Heat map').first().evaluate(el => el.closest('div.grid, section, div')?.parentElement?.scrollIntoView({ block: 'start' }));
await shot('risks');

await tab('access');
await tryClick(page.getByText(/^Q4 .*access review/));
await page.getByText(/Keep|Remove/).first().waitFor({ timeout: 30_000 }).catch(() => {});
await shot('access-reviews');

await tab('vendors');
await shot('vendors');

await tab('questionnaires');
await tryClick(page.getByText('Vendor security assessment'));
await page.getByText('Approve').first().waitFor({ timeout: 30_000 }).catch(() => {});
await shot('questionnaires');

await tab('evidence');
await shot('evidence');

await tab('connectors');
await shot('integrations');

await page.goto(`${BASE}/trust`);
await page.waitForLoadState('networkidle');
await shot('trust-center');

await browser.close();
