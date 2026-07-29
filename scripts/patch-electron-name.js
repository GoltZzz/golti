#!/usr/bin/env node
/**
 * Brand the local Electron macOS bundle as Golti for development.
 *
 * Dock tooltips follow the .app folder name + Launch Services registration.
 * CFBundleName alone is not enough - rename the bundle, main executable,
 * helpers, update path.txt, bake the icon, ad-hoc sign, and lsregister.
 */
const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const NAME = 'Golti'
const BUNDLE_ID = 'dev.golti.app'
const electronPkgDir = path.dirname(require.resolve('electron/package.json'))
const distDir = path.join(electronPkgDir, 'dist')
const pathFile = path.join(electronPkgDir, 'path.txt')
const targetAppName = `${NAME}.app`
const targetAppDir = path.join(distDir, targetAppName)
const buddy = '/usr/libexec/PlistBuddy'
const lsregister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

function setOrAdd(plist, key, value) {
  try {
    execFileSync(buddy, ['-c', `Set :${key} ${value}`, plist], { stdio: 'pipe' })
  } catch {
    execFileSync(buddy, ['-c', `Add :${key} string ${value}`, plist], { stdio: 'pipe' })
  }
}

function renameIfExists(from, to) {
  if (fs.existsSync(from) && !fs.existsSync(to)) {
    fs.renameSync(from, to)
    return true
  }
  return false
}

if (!fs.existsSync(pathFile)) {
  console.warn('[patch-electron-name] path.txt missing - skip')
  process.exit(0)
}

// 1) Rename Electron.app → Golti.app
if (!fs.existsSync(targetAppDir)) {
  const electronApp = path.join(distDir, 'Electron.app')
  if (!fs.existsSync(electronApp)) {
    console.warn('[patch-electron-name] Electron.app / Golti.app not found - skip')
    process.exit(0)
  }
  fs.renameSync(electronApp, targetAppDir)
  console.log('[patch-electron-name] Renamed Electron.app → Golti.app')
}

const macosDir = path.join(targetAppDir, 'Contents', 'MacOS')
const frameworksDir = path.join(targetAppDir, 'Contents', 'Frameworks')
const infoPlist = path.join(targetAppDir, 'Contents', 'Info.plist')

// 2) Rename main executable Electron → Golti
const mainExecOld = path.join(macosDir, 'Electron')
const mainExecNew = path.join(macosDir, NAME)
if (renameIfExists(mainExecOld, mainExecNew)) {
  console.log(`[patch-electron-name] Renamed MacOS/Electron → MacOS/${NAME}`)
}
if (!fs.existsSync(mainExecNew)) {
  console.warn('[patch-electron-name] Main executable missing - skip')
  process.exit(0)
}

// 3) path.txt must point at the renamed binary
const expectedPathTxt = `${targetAppName}/Contents/MacOS/${NAME}`
fs.writeFileSync(pathFile, expectedPathTxt)
console.log(`[patch-electron-name] path.txt → ${expectedPathTxt}`)

// 4) Main Info.plist
setOrAdd(infoPlist, 'CFBundleName', NAME)
setOrAdd(infoPlist, 'CFBundleDisplayName', NAME)
setOrAdd(infoPlist, 'CFBundleExecutable', NAME)
setOrAdd(infoPlist, 'CFBundleIdentifier', BUNDLE_ID)

// 5) Rename helper apps + their executables + plists
const helperSpecs = [
  { from: 'Electron Helper.app', to: `${NAME} Helper.app`, execFrom: 'Electron Helper', execTo: `${NAME} Helper` },
  {
    from: 'Electron Helper (GPU).app',
    to: `${NAME} Helper (GPU).app`,
    execFrom: 'Electron Helper (GPU)',
    execTo: `${NAME} Helper (GPU)`
  },
  {
    from: 'Electron Helper (Plugin).app',
    to: `${NAME} Helper (Plugin).app`,
    execFrom: 'Electron Helper (Plugin)',
    execTo: `${NAME} Helper (Plugin)`
  },
  {
    from: 'Electron Helper (Renderer).app',
    to: `${NAME} Helper (Renderer).app`,
    execFrom: 'Electron Helper (Renderer)',
    execTo: `${NAME} Helper (Renderer)`
  }
]

for (const spec of helperSpecs) {
  const fromApp = path.join(frameworksDir, spec.from)
  const toApp = path.join(frameworksDir, spec.to)
  renameIfExists(fromApp, toApp)
  if (!fs.existsSync(toApp)) continue

  const helperMacos = path.join(toApp, 'Contents', 'MacOS')
  renameIfExists(path.join(helperMacos, spec.execFrom), path.join(helperMacos, spec.execTo))

  const helperPlist = path.join(toApp, 'Contents', 'Info.plist')
  if (fs.existsSync(helperPlist)) {
    setOrAdd(helperPlist, 'CFBundleName', spec.execTo)
    setOrAdd(helperPlist, 'CFBundleDisplayName', spec.execTo)
    setOrAdd(helperPlist, 'CFBundleExecutable', spec.execTo)
    const suffix =
      spec.execTo.replace(NAME, '').trim().replace(/[()]/g, '').replace(/\s+/g, '.') || 'helper'
    setOrAdd(helperPlist, 'CFBundleIdentifier', `${BUNDLE_ID}.${suffix.toLowerCase()}`)
  }
  console.log(`[patch-electron-name] Helper ready: ${spec.to}`)
}

// 6) Bake dock icon into the bundle
const projectRoot = path.resolve(__dirname, '..')
const iconIcns = path.join(projectRoot, 'build', 'icon.icns')
const bundleIcns = path.join(targetAppDir, 'Contents', 'Resources', 'electron.icns')
if (fs.existsSync(iconIcns) && fs.existsSync(path.dirname(bundleIcns))) {
  fs.copyFileSync(iconIcns, bundleIcns)
  console.log('[patch-electron-name] Copied build/icon.icns → Resources/electron.icns')
}

// 7) Ad-hoc re-sign after renames
const sign = spawnSync('codesign', ['--force', '--deep', '--sign', '-', targetAppDir], {
  encoding: 'utf8'
})
if (sign.status !== 0) {
  console.warn('[patch-electron-name] codesign warning:', (sign.stderr || sign.stdout || '').trim())
} else {
  console.log('[patch-electron-name] Ad-hoc codesign OK')
}

// 8) Refresh Launch Services
if (fs.existsSync(lsregister)) {
  spawnSync(lsregister, ['-u', path.join(distDir, 'Electron.app')], { stdio: 'ignore' })
  spawnSync(lsregister, ['-f', targetAppDir], { stdio: 'ignore' })
  console.log('[patch-electron-name] lsregister refreshed')
}

console.log(`[patch-electron-name] Dock bundle ready: ${targetAppName} (${BUNDLE_ID})`)
console.log('[patch-electron-name] Fully quit the app, then: killall Dock && npm run dev')
