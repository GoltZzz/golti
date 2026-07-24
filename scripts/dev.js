#!/usr/bin/env node
/**
 * Wrapper around `electron-vite dev`.
 *
 * VS Code's extension host exports ELECTRON_RUN_AS_NODE=1, and every integrated
 * terminal inherits it. With that set, Electron boots as plain Node, so
 * `require('electron')` hands back a path string instead of the API object and the
 * main process dies on the first `app.getPath()` with a confusing
 * "Cannot read properties of undefined". Strip it before launching.
 */
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const env = { ...process.env }
if (env.ELECTRON_RUN_AS_NODE) {
  delete env.ELECTRON_RUN_AS_NODE
  console.log('[dev] Unset ELECTRON_RUN_AS_NODE (inherited from the host terminal)')
}
delete env.ELECTRON_NO_ATTACH_CONSOLE

// Resolve the local electron-vite so this works whether launched via npm (which
// adds node_modules/.bin to PATH) or directly with `node scripts/dev.js`.
const binName = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
const localBin = path.join(__dirname, '..', 'node_modules', '.bin', binName)
const command = fs.existsSync(localBin) ? localBin : 'electron-vite'

const child = spawn(command, ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
