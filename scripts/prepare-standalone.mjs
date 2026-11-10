// Completes the Next.js standalone bundle (.next/standalone) so it can run on
// its own: copies static assets, the public folder, fonts and database
// migrations next to server.js. Run after `NEXT_OUTPUT=standalone npm run build`.
import { cpSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
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
// Next links some server packages (e.g. .next/node_modules/sharp-<hash>) with
// absolute symlinks into the build machine's folders. Those break on any other
// computer and are rejected by macOS code signing, so replace every symlink
// with a real copy of what it points to.
function inlineSymlinks(dir) {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      const target = realpathSync(p);
      rmSync(p, { recursive: true, force: true });
      cpSync(target, p, { recursive: true, dereference: true });
      count++;
    } else if (st.isDirectory()) {
      count += inlineSymlinks(p);
    }
  }
  return count;
}
const inlined = inlineSymlinks(out);
if (inlined) console.log(`Replaced ${inlined} symlink(s) with copies`);

// Next copies .env files into the bundle; settings must come from the
// environment at run time, never from the build machine.
for (const f of readdirSync(out)) if (f.startsWith('.env')) rmSync(path.join(out, f));
console.log(`Standalone server ready in ${path.relative(root, out)}`);
