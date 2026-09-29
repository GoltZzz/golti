#!/usr/bin/env node
/**
 * Ensure better-sqlite3 is built for Electron's ABI before `npm run dev`.
 *
 * `npm test` rebuilds it against the Node ABI (see prepare-test-native.js), so dev
 * needs to switch it back. A forced `@electron/rebuild -f` recompiles SQLite from
 * source on every launch (~80s), so only rebuild when the module actually fails
 * to load under Electron.
 */
const { execFileSync, execSync } = require('child_process')
const path = require('path')

const pkgDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3')
// From plain Node, the electron package exports the path to its binary.
const electronBin = require('electron')

try {
  // better-sqlite3 loads its native binding lazily, so require() alone proves
  // nothing - actually open a database to force the .node file to load.
  execFileSync(
    electronBin,
    ['-e', `new (require(${JSON.stringify(pkgDir)}))(':memory:').close()`],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' }
  )
  process.exit(0)
} catch (err) {
  console.log('[dev] better-sqlite3 is not loadable under Electron, rebuilding...')
  const lines = String(err.stderr || err.message).split('\n')
  const detail = lines.find((l) => /Error|NODE_MODULE_VERSION/.test(l)) ?? lines.find((l) => l.trim())
  if (detail) console.log(`[dev] ${detail}`)
}

try {
  execSync('npx @electron/rebuild -f -w better-sqlite3', { stdio: 'inherit' })
} catch {
  console.error('[dev] Rebuild failed. Run this manually:')
  console.error('[dev]   npx @electron/rebuild -f -w better-sqlite3')
  process.exit(1)
}
