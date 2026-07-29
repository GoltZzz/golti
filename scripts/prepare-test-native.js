#!/usr/bin/env node
/**
 * Ensure better-sqlite3 is built for the Node ABI before running tests.
 *
 * `npm run dev` and the `postinstall` hook both rebuild it against Electron's ABI,
 * which makes plain-Node vitest fail with "Module did not self-register". Plain
 * `npm rebuild` won't fix it - it restores the prebuilt binary, which is Electron's.
 * Only rebuild when the module actually fails to load, since node-gyp is slow.
 */
const { execSync } = require('child_process')
const path = require('path')

const pkgDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3')

try {
  // better-sqlite3 loads its native binding lazily, so require() alone proves
  // nothing - actually open a database to force the .node file to load.
  const Database = require(pkgDir)
  new Database(':memory:').close()
  process.exit(0)
} catch (err) {
  console.log('[test] better-sqlite3 is not loadable under Node, rebuilding...')
  console.log(`[test] ${err.message.split('\n')[0]}`)
}

try {
  execSync('npx --no-install node-gyp rebuild --release', { cwd: pkgDir, stdio: 'inherit' })
} catch {
  console.error('[test] Rebuild failed. Run this manually:')
  console.error('[test]   cd node_modules/better-sqlite3 && npx node-gyp rebuild')
  process.exit(1)
}
