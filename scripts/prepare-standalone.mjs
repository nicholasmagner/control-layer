// Completes the Next.js standalone bundle (.next/standalone) so it can run on
// its own: copies static assets, the public folder, fonts and database
// migrations next to server.js. Run after `NEXT_OUTPUT=standalone npm run build`.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '.next', 'standalone');
if (!existsSync(path.join(out, 'server.js'))) {
  console.error('No standalone build found. Run: NEXT_OUTPUT=standalone npm run build');
  process.exit(1);
}
const copy = (from, to) => {
  rmSync(path.join(out, to), { recursive: true, force: true });
  cpSync(path.join(root, from), path.join(out, to), { recursive: true });
};
copy('.next/static', '.next/static');
copy('public', 'public');
copy('assets', 'assets');
copy('prisma/migrations', 'prisma/migrations');
// Next copies .env files into the bundle; settings must come from the
// environment at run time, never from the build machine.
for (const f of readdirSync(out)) if (f.startsWith('.env')) rmSync(path.join(out, f));
console.log(`Standalone server ready in ${path.relative(root, out)}`);
