// electron-builder afterPack hook: copies the ControlLayer server bundle
// (../.next/standalone, including its node_modules, which extraResources
// would skip) into the app's resources/server folder.
const { cpSync, existsSync } = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const source = path.resolve(__dirname, '..', '..', '.next', 'standalone');
  if (!existsSync(path.join(source, 'server.js'))) {
    throw new Error('Server bundle not found. Build it first: NEXT_OUTPUT=standalone npm run build && node scripts/prepare-standalone.mjs');
  }
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  cpSync(source, path.join(resources, 'server'), { recursive: true, dereference: true });
  console.log(`  • copied server bundle to ${path.relative(process.cwd(), path.join(resources, 'server'))}`);
};
