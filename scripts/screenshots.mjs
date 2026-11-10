// Regenerates the README screenshots from a running instance with sample data.
//   1. Start the app on an empty database: npm run build && npm start
//   2. node scripts/screenshots.mjs [http://localhost:3000]
// Creates an admin account, loads sample data and captures each screen.
// Needs Playwright with Chromium: npm i -g playwright && npx playwright install chromium
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = new URL('../screenshots/', import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('saved', name); };
const nav = name => page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();

await page.goto(`${BASE}/setup`);
await page.getByLabel('Your name').fill('Maria Lopez');
await page.getByLabel('Work email').fill('maria@acme.example');
await page.getByLabel('Password').fill('screenshots-only-password');
await page.getByRole('button', { name: 'Create workspace' }).click();
await page.getByRole('button', { name: 'Load sample data' }).first().click();
await page.getByText('You are viewing').waitFor({ timeout: 60_000 });
await shot('dashboard');

await nav('Controls');
await page.getByRole('button', { name: /CC6\.6/ }).first().click();
await page.getByRole('button', { name: /CC6\.6/ }).first().scrollIntoViewIfNeeded();
await shot('controls');

await nav('Findings');
await page.getByRole('button', { name: /No SSH\/RDP open to the internet/ }).first().click();
await shot('findings');
await page.keyboard.press('Escape');

await nav('Evidence & Audits');
await shot('evidence');

await nav('Cloud Accounts');
await shot('cloud-accounts');

await browser.close();
