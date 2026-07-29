import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import os from 'os'
import {
  dbArtifacts,
  dbCitations,
  dbContext,
  dbConversations,
  dbMessages,
  dbProviders,
  dbSettings,
  initDatabase
} from './db/database'
import { getAllModels } from './ai/provider-manager'
import { generateConversationTitle, type GenerateTitleRequest } from './ai/title-generator'
import {
  cancelAllGenerations,
  cancelGeneration,
  getTokenBudgetForConversation,
  hasActiveGenerations,
  resyncGeneration,
  startChatGeneration
} from './ai/chat-runtime'
import {
  addContextFromPath,
  addContextText,
  addContextUrl,
  pickContext,
  pickContextFiles,
  pickContextFolder
} from './services/context-ingest'
import { exportConversation } from './services/export'
import type { SendMessagePayload, InstalledLocalModelInfo } from '../shared/types'
import { MODEL_CATALOG } from '../shared/model-catalog'
import { testWebSearch } from './services/web-search'
import { getAvailableMemoryBytes } from './system/memory'
import { readVram } from './system/vram'
import { readGgufModelInfo } from './engine/gguf'
import {
  initEngine,
  stopEngine,
  startEngine,
  getEngineState,
  onEngineStatusChange,
  updateState,
  downloadEngineBinary,
  deleteEngineBinary,
  downloadModel,
  listLocalModels,
  deleteLocalModel,
  deletePartialModel,
  pauseModelDownload,
  cancelModelDownload,
  loadModelInEngine,
  listEngineDevices,
  getBinaryPath,
  isBinaryInstalled,
  getModelDir
} from './engine'
import { searchHFModels, fetchHFModelDetail } from './hf/hf-client'
import { resolveGguf } from './hf/gguf-resolver'
import {
  getSearchRuntimeState,
  initSearchRuntime,
  installAndStartSearchRuntime,
  onSearchRuntimeStatusChange,
  repairSearchRuntime,
  startSearchRuntime,
  stopSearchRuntime
} from './search-runtime'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import { SystemInfoFull } from '../shared/types'

const execAsync = promisify(exec)

/** Show "Golti" in the menu / dock instead of "Electron" during development. */
app.setName('Golti')

/**
 * Turns the persisted engine settings into concrete offload args:
 *   engineDevice 'cpu'  → no GPU layers
 *   engineDevice 'auto' → auto-pick discrete GPU + auto-size layers
 *   engineDevice 'VulkanN' → force that device
 * engineGpuLayers < 0 means "Auto" (size from VRAM); >= 0 is an explicit count.
 */
function resolveEngineOffload(settings: {
  engineGpuLayers: number
  engineDevice?: string
}): { layers: number | undefined; device: string | undefined } {
  const choice = settings.engineDevice || 'auto'
  if (choice === 'cpu') return { layers: 0, device: undefined }
  const layers = settings.engineGpuLayers < 0 ? undefined : settings.engineGpuLayers
  const device = choice === 'auto' ? undefined : choice
  return { layers, device }
}

async function getFullSystemInfo(): Promise<SystemInfoFull> {
  const totalMem = os.totalmem()
  const freeMem = await getAvailableMemoryBytes()
  const cpus = os.cpus()
  
  const platform = os.platform()
  const arch = os.arch()
  
  // CPU details
  const cpuModel = cpus[0]?.model || 'Unknown CPU'
  const cores = os.cpus().length
  let physicalCores = cores
  if (platform === 'darwin') {
    try {
      const { stdout } = await execAsync('sysctl -n hw.physicalcpu')
      physicalCores = parseInt(stdout.trim(), 10) || cores
    } catch {}
  } else if (platform === 'linux') {
    // os.cpus() counts threads; derive real cores from the (socket, core) pairs.
    try {
      const cpuinfo = await fs.promises.readFile('/proc/cpuinfo', 'utf8')
      const pairs = new Set<string>()
      let physicalId = ''
      for (const line of cpuinfo.split('\n')) {
        const [rawKey, rawValue] = line.split(':')
        if (!rawValue) continue
        const key = rawKey.trim()
        const value = rawValue.trim()
        if (key === 'physical id') physicalId = value
        if (key === 'core id') pairs.add(`${physicalId}/${value}`)
      }
      if (pairs.size > 0) physicalCores = pairs.size
    } catch {}
  }
  
  const speedGHz = cpus[0]?.speed ? cpus[0].speed / 1000 : 0
  
  // RAM
  const totalGB = totalMem / (1024 * 1024 * 1024)
  const freeGB = freeMem / (1024 * 1024 * 1024)
  const usedPercent = Math.max(0, Math.min(100, ((totalMem - freeMem) / totalMem) * 100))
  
  // GPU details
  let gpuName = 'Unknown GPU'
  let vramGB: number | null = null
  let isAppleSilicon = false
  
  if (platform === 'darwin') {
    try {
      const { stdout } = await execAsync('system_profiler SPDisplaysDataType')
      const lines = stdout.split('\n')
      let currentGpuName = ''
      let currentVram = ''
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('Chipset Model:')) {
          currentGpuName = trimmed.replace('Chipset Model:', '').trim()
        }
        if (trimmed.startsWith('VRAM (Total):') || trimmed.startsWith('VRAM (Dynamic, Max):')) {
          currentVram = trimmed.replace(/VRAM.*:/, '').trim()
        }
      }
      
      if (currentGpuName) {
        gpuName = currentGpuName
      } else {
        if (cpuModel.includes('Apple')) {
          gpuName = cpuModel.replace('Apple', '').trim() + ' GPU'
        }
      }
      
      isAppleSilicon = cpuModel.includes('Apple') || gpuName.includes('Apple')
      
      if (isAppleSilicon) {
        vramGB = null
      } else if (currentVram) {
        const match = currentVram.match(/(\d+)\s*(MB|GB)/i)
        if (match) {
          const num = parseInt(match[1], 10)
          const unit = match[2].toUpperCase()
          if (unit === 'MB') {
            vramGB = num / 1024
          } else {
            vramGB = num
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse GPU info:', e)
      if (cpuModel.includes('Apple')) {
        gpuName = 'Apple GPU'
        isAppleSilicon = true
      }
    }
  } else if (platform === 'win32' || platform === 'linux') {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits')
      // Hybrid laptops list several GPUs; the first is the discrete one.
      const [name, memStr] = stdout.trim().split('\n')[0].split(',')
      gpuName = name.trim()
      vramGB = parseInt(memStr.trim(), 10) / 1024
    } catch {
      gpuName = 'Generic GPU'
    }

    // No NVIDIA card - try AMD, which is common enough on Linux to be worth probing.
    if (vramGB === null && platform === 'linux') {
      try {
        const { stdout } = await execAsync('rocm-smi --showproductname --showmeminfo vram --csv')
        const vramBytes = stdout.match(/(\d{7,})/)?.[1]
        const cardName = stdout.match(/Card series[^,]*,\s*([^\n,]+)/i)?.[1]
        if (cardName) gpuName = cardName.trim()
        if (vramBytes) vramGB = parseInt(vramBytes, 10) / (1024 * 1024 * 1024)
      } catch {}
    }

    // Last resort on Linux: at least name the card so the UI isn't showing "Generic GPU".
    if (gpuName === 'Generic GPU' && platform === 'linux') {
      try {
        const { stdout } = await execAsync('lspci -mm')
        const line = stdout
          .split('\n')
          .find((l) => /"(VGA compatible controller|3D controller|Display controller)"/.test(l))
        const fields = line?.match(/"([^"]*)"/g)?.map((f) => f.slice(1, -1))
        if (fields && fields.length >= 4) gpuName = `${fields[2]} ${fields[3]}`.trim()
      } catch {}
    }
  }
  
  // Disk speed benchmark
  let diskRead: number | null = null
  let diskWrite: number | null = null
  const tempFilePath = path.join(
    app.getPath('userData'),
    `temp_disk_bench_${Date.now()}_${Math.random().toString(36).substring(2)}.tmp`
  )
  try {
    const size = 15 * 1024 * 1024 // 15MB
    const buffer = Buffer.alloc(size, 'x')
    
    const writeStart = process.hrtime.bigint()
    await fs.promises.writeFile(tempFilePath, buffer)
    const writeEnd = process.hrtime.bigint()
    const writeDuration = Number(writeEnd - writeStart) / 1e9
    diskWrite = Math.round(size / (1024 * 1024) / writeDuration)

    const readStart = process.hrtime.bigint()
    await fs.promises.readFile(tempFilePath)
    const readEnd = process.hrtime.bigint()
    const readDuration = Number(readEnd - readStart) / 1e9
    diskRead = Math.round(size / (1024 * 1024) / readDuration)
  } catch (err) {
    console.error('Disk benchmark failed:', err)
  } finally {
    try {
      await fs.promises.rm(tempFilePath, { force: true })
    } catch {}
  }

  // Free space on the volume that holds downloaded models, not necessarily the
  // system volume - models live under ~/Golti/models and that can be a separate disk.
  let diskFreeGB: number | null = null
  let diskTotalGB: number | null = null
  try {
    const stats = await fs.promises.statfs(getModelDir())
    diskFreeGB = Math.round(((stats.bavail * stats.bsize) / 1024 ** 3) * 10) / 10
    diskTotalGB = Math.round(((stats.blocks * stats.bsize) / 1024 ** 3) * 10) / 10
  } catch (err) {
    console.warn('Free disk probe failed:', err)
  }

  // CPU Temperature
  let cpuTempC: number | null = null
  if (platform === 'linux') {
    try {
      const temp = await fs.promises.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8')
      cpuTempC = parseInt(temp.trim(), 10) / 1000
    } catch {}
  }

  return {
    platform,
    arch,
    cpu: {
      model: cpuModel,
      cores: physicalCores,
      threads: cores,
      speedGHz: parseFloat(speedGHz.toFixed(2))
    },
    ram: {
      totalGB: Math.round(totalGB * 10) / 10,
      freeGB: Math.round(freeGB * 10) / 10,
      usedPercent: Math.round(usedPercent)
    },
    gpu: {
      name: gpuName,
      vramGB: vramGB ? Math.round(vramGB * 10) / 10 : null,
      isAppleSilicon,
      unifiedMemoryGB: isAppleSilicon ? Math.round(totalGB) : undefined
    },
    disk: {
      readMBps: diskRead,
      writeMBps: diskWrite,
      freeGB: diskFreeGB,
      totalGB: diskTotalGB
    },
    thermals: {
      cpuTempC
    }
  }
}


export let mainWindow: BrowserWindow | null = null

/**
 * Send an IPC message to the renderer, but only if the window and its
 * webContents are still alive. During quit the process `exit` events can fire
 * after the window is destroyed; `mainWindow?.` alone doesn't catch that and
 * throws "Object has been destroyed".
 */
function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

/** App icon for window chrome (Win/Linux) and macOS dock during dev. */
function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.resourcesPath, 'build/icon.png'),
    path.join(process.resourcesPath, 'icon.png')
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const iconPath = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 900,
    minHeight: 600,
    title: 'Golti',
    frame: false, // Custom title bar across platforms
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    backgroundColor: '#0b0c10',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Prompt before closing the window while a generation is still streaming.
  // This covers the custom title-bar close button and OS window close, which
  // otherwise tear the window down before `before-quit` can warn the user.
  mainWindow.on('close', (event) => {
    if (cleanupComplete || !hasActiveGenerations()) return
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'question',
      buttons: ['Quit anyway', 'Keep working'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Generation in progress',
      message: 'A response is still being generated.',
      detail: 'If you quit now, the in-progress generation will be stopped.'
    })
    if (choice === 1) {
      event.preventDefault()
      return
    }
    // User confirmed - abort generations so the before-quit handler doesn't
    // prompt a second time and cleanup can run.
    cancelAllGenerations()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const iconPath = resolveAppIcon()
  // BrowserWindow `icon` does not replace the Electron dock glyph on macOS - set it explicitly.
  if (iconPath && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  initDatabase()
  setupIpcHandlers()
  createWindow()

  // Subscribe engine status changes to send to renderer
  onEngineStatusChange((state) => {
    sendToRenderer('engine:status-change', state)
  })

  onSearchRuntimeStatusChange((state) => {
    sendToRenderer('search-runtime:status-change', state)
  })

  // Auto-init engine if enabled
  initEngine().catch((err) => console.warn('[Engine Init Warning]', err))
  initSearchRuntime().catch((err) => console.warn('[SearchRuntime Init Warning]', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Set once cleanup has run so the re-entrant before-quit (fired by app.quit()
// below) is allowed to proceed instead of looping.
let cleanupComplete = false

app.on('before-quit', (event) => {
  if (cleanupComplete) return

  // Cancel the default quit; we drive it ourselves once cleanup finishes so the
  // child processes are actually stopped before the app exits.
  event.preventDefault()

  // Warn the user if a response is still being generated.
  if (hasActiveGenerations() && mainWindow && !mainWindow.isDestroyed()) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Quit anyway', 'Keep working'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Generation in progress',
      message: 'A response is still being generated.',
      detail: 'If you quit now, the in-progress generation will be stopped.'
    })
    if (choice === 1) {
      // Keep working - quit stays cancelled.
      return
    }
    cancelAllGenerations()
  }

  Promise.all([stopEngine(), stopSearchRuntime()])
    .catch((err) => console.warn('[Quit cleanup]', err))
    .finally(() => {
      cleanupComplete = true
      app.quit()
    })
})

function setupIpcHandlers(): void {
  // System Platform
  ipcMain.handle('system:platform', () => process.platform)

  // Window Controls
  ipcMain.on('window:control', (_, action: 'minimize' | 'maximize' | 'close') => {
    if (!mainWindow) return
    if (action === 'minimize') mainWindow.minimize()
    else if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      else mainWindow.maximize()
    } else if (action === 'close') mainWindow.close()
  })

  // DB Conversations
  ipcMain.handle('db:conversations:list', () => dbConversations.list())
  ipcMain.handle('db:conversations:get', (_, id: string) => dbConversations.get(id))
  ipcMain.handle('db:conversations:create', (_, conv: any) => dbConversations.create(conv))
  ipcMain.handle('db:conversations:update', (_, id: string, updates: any) => dbConversations.update(id, updates))
  ipcMain.handle('db:conversations:delete', (_, id: string) => dbConversations.delete(id))
  ipcMain.handle('db:conversations:search', (_, query: string) => dbConversations.search(query))

  // DB Messages
  ipcMain.handle('db:messages:list', (_, conversationId: string) => dbMessages.listForConversation(conversationId))
  ipcMain.handle('db:messages:create', (_, msg: any) => dbMessages.create(msg))
  ipcMain.handle('db:messages:update', (_, id: string, updates: any) => dbMessages.update(id, updates))
  ipcMain.handle('db:messages:versions', (_, messageId: string) => dbMessages.listVersions(messageId))
  ipcMain.handle('db:messages:set-active-leaf', (_, conversationId: string, leafId: string) => {
    dbConversations.update(conversationId, { activeLeafId: leafId })
    return dbMessages.listForConversation(conversationId)
  })

  // Context
  ipcMain.handle('context:list', (_, conversationId: string) => dbContext.list(conversationId))
  ipcMain.handle('context:add-paths', (_, conversationId: string, paths: string[]) =>
    paths.map((p) => addContextFromPath(conversationId, p))
  )
  ipcMain.handle('context:pick', async (_, conversationId: string) =>
    pickContext(mainWindow, conversationId)
  )
  ipcMain.handle('context:pick-files', async (_, conversationId: string) =>
    pickContextFiles(mainWindow, conversationId)
  )
  ipcMain.handle('context:pick-folder', async (_, conversationId: string) =>
    pickContextFolder(mainWindow, conversationId)
  )
  ipcMain.handle('context:add-text', (_, conversationId: string, name: string, content: string) =>
    addContextText(conversationId, name, content, 'text')
  )
  ipcMain.handle('context:add-url', async (_, conversationId: string, url: string) =>
    addContextUrl(conversationId, url)
  )
  ipcMain.handle('context:update', (_, id: string, updates: any) => {
    dbContext.update(id, updates)
    return true
  })
  ipcMain.handle('context:delete', (_, id: string) => {
    dbContext.delete(id)
    return true
  })

  // Artifacts
  ipcMain.handle('artifacts:list', (_, conversationId: string) =>
    dbArtifacts.listForConversation(conversationId)
  )
  ipcMain.handle('artifacts:update', (_, id: string, content: string) =>
    dbArtifacts.updateContent(id, content)
  )
  ipcMain.handle('artifacts:versions', (_, artifactId: string) => dbArtifacts.listVersions(artifactId))
  ipcMain.handle('artifacts:restore', (_, artifactId: string, version: number) =>
    dbArtifacts.restoreVersion(artifactId, version)
  )
  ipcMain.handle(
    'artifacts:save-to-file',
    async (_, { content, filePath, defaultFilename }: { content: string; filePath?: string; defaultFilename?: string }) => {
      try {
        let savePath = filePath
        if (!savePath) {
          const res = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: defaultFilename || 'shell-artifact.txt'
          })
          if (res.canceled || !res.filePath) {
            return { success: false, cancelled: true }
          }
          savePath = res.filePath
        }
        await fs.promises.writeFile(savePath, content, 'utf-8')
        return { success: true, filePath: savePath }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to write file' }
      }
    }
  )

  // Citations
  ipcMain.handle('citations:list', (_, conversationId: string) =>
    dbCitations.listForConversation(conversationId)
  )

  // Token budget
  ipcMain.handle('tokens:budget', (_, conversationId: string, draft?: string) =>
    getTokenBudgetForConversation(conversationId, draft || '')
  )

  // Export
  ipcMain.handle('conversations:export', async (_, options: any) =>
    exportConversation(mainWindow, options)
  )

  // DB Providers
  ipcMain.handle('db:providers:list', () => dbProviders.list())
  ipcMain.handle('db:providers:upsert', (_, provider: any) => {
    const res = dbProviders.upsert(provider)
    sendToRenderer('providers:updated')
    return res
  })
  ipcMain.handle('db:providers:delete', async (_, id: string) => {
    const provider = dbProviders.list().find((p) => p.id === id || (p.type === 'golti-engine' && id.includes('golti-engine')))
    const isGoltiEngine = provider?.type === 'golti-engine' || id === 'golti-engine' || id.startsWith('golti-engine_')

    if (isGoltiEngine) {
      console.warn('[GoltiEngine] Prevented deletion of protected Golti Engine provider:', id)
      return false
    }

    const res = dbProviders.delete(id)
    sendToRenderer('providers:updated')
    return res
  })

  // Settings
  ipcMain.handle('settings:get', () => dbSettings.get())
  ipcMain.handle('settings:update', (_, settings: any) => dbSettings.update(settings))

  // Local web search runtime
  ipcMain.handle('web-search:test', async (_, query?: string) => testWebSearch(query))
  ipcMain.handle('search-runtime:status', () => getSearchRuntimeState())
  ipcMain.handle('search-runtime:install', async () => {
    const settings = dbSettings.get()
    return installAndStartSearchRuntime(
      (progress) => mainWindow?.webContents.send('search-runtime:progress', progress),
      { apiPort: settings.searchRuntimePort, searxPort: settings.searchRuntimeSearxPort }
    )
  })
  ipcMain.handle('search-runtime:start', async () => {
    const settings = dbSettings.get()
    return startSearchRuntime({
      apiPort: settings.searchRuntimePort,
      searxPort: settings.searchRuntimeSearxPort
    })
  })
  ipcMain.handle('search-runtime:stop', async () => stopSearchRuntime())
  ipcMain.handle('search-runtime:repair', async () => {
    const settings = dbSettings.get()
    return repairSearchRuntime(
      (progress) => mainWindow?.webContents.send('search-runtime:progress', progress),
      { apiPort: settings.searchRuntimePort, searxPort: settings.searchRuntimeSearxPort }
    )
  })

  // AI & Models
  ipcMain.handle('ai:models', async () => {
    return await getAllModels()
  })

  ipcMain.handle('ai:chat', async (_, payload: SendMessagePayload) => {
    return startChatGeneration(mainWindow, payload)
  })

  ipcMain.handle('ai:chat:cancel', (_, generationId: string) => cancelGeneration(generationId))
  ipcMain.handle('ai:chat:resync', (_, conversationId: string) =>
    resyncGeneration(mainWindow, conversationId)
  )
  ipcMain.handle('ai:chat:regenerate', async (_, payload: SendMessagePayload & { messageId: string }) => {
    return startChatGeneration(mainWindow, {
      ...payload,
      regenerateFromId: payload.messageId || payload.regenerateFromId
    })
  })

  ipcMain.handle('ai:chat:continue', async (_, payload: SendMessagePayload & { messageId: string }) => {
    return startChatGeneration(mainWindow, {
      ...payload,
      continueMessageId: payload.messageId || payload.continueMessageId
    })
  })

  ipcMain.handle('ai:generate-title', async (_, request: GenerateTitleRequest) => {
    return generateConversationTitle(request)
  })

  // System Info
  ipcMain.handle('system:info', async () => {
    const totalMem = os.totalmem()
    const freeMem = await getAvailableMemoryBytes()
    const cpus = os.cpus()
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model || 'Unknown CPU',
      totalRamGB: Math.round(totalMem / (1024 * 1024 * 1024)),
      freeRamGB: Math.round(freeMem / (1024 * 1024 * 1024))
    }
  })

  // Enhanced System Info for Cookbook
  // Driver-level VRAM: what is actually free on the card right now, counting
  // every consumer rather than only the processes Golti started.
  ipcMain.handle('system:vram', async () => {
    return await readVram()
  })

  ipcMain.handle('system:info:full', async () => {
    return await getFullSystemInfo()
  })

  // Detailed Local Models list (Golti Engine)
  ipcMain.handle('cookbook:detailed-installed-models', async (): Promise<InstalledLocalModelInfo[]> => {
    const installedList: InstalledLocalModelInfo[] = []
    const providers = dbProviders.list()

    // Golti Engine Models (.gguf files)
    try {
      const engineProvider = providers.find(p => p.type === 'golti-engine')
      const localEngineFiles = listLocalModels()
      for (const file of localEngineFiles) {
        const catalogMatch = MODEL_CATALOG.find(cat => cat.ggufFilename === file.filename)
        installedList.push({
          id: `golti-engine:${file.filename}`,
          name: catalogMatch ? catalogMatch.name : file.filename.replace(/\.gguf$/i, ''),
          tag: file.filename,
          providerType: 'golti-engine',
          providerId: engineProvider?.id || 'golti-engine-default',
          providerName: 'Golti Engine',
          sizeBytes: file.sizeBytes,
          sizeFormatted: `${file.sizeGB} GB`,
          isGoltiEngine: true,
          isCatalogModel: !!catalogMatch,
          catalogModelId: catalogMatch?.id,
          parameterSize: catalogMatch ? `${catalogMatch.parameterBillions}B` : undefined,
          quantizationLevel: catalogMatch ? catalogMatch.quantization : undefined,
          family: catalogMatch ? catalogMatch.family : undefined
        })
      }
    } catch (e) {
      console.warn('[Cookbook] Failed to list Golti Engine local models:', e)
    }

    return installedList
  })

  // Golti Engine IPC Handlers
  ipcMain.handle('engine:status', () => getEngineState())
  
  ipcMain.handle('engine:install', async () => {
    updateState({ status: 'downloading', error: undefined })
    sendToRenderer('engine:status-change', getEngineState())
    try {
      const res = await downloadEngineBinary((progress) => {
        mainWindow?.webContents.send('engine:download-progress', progress)
      })
      const providers = dbProviders.list()
      const existing = providers.find((p) => p.type === 'golti-engine')
      if (!existing) {
        dbProviders.upsert({
          id: `golti-engine_${Date.now()}`,
          type: 'golti-engine',
          name: 'Golti Engine Local',
          endpoint: 'http://127.0.0.1:8391',
          apiKey: '',
          isActive: true,
          models: []
        })
      } else if (!existing.isActive) {
        dbProviders.upsert({ ...existing, isActive: true })
      }
      sendToRenderer('providers:updated')

      updateState({ status: 'stopped', error: undefined })
      sendToRenderer('engine:status-change', getEngineState())
      return res
    } catch (err: any) {
      updateState({ status: 'error', error: err.message || String(err) })
      sendToRenderer('engine:status-change', getEngineState())
      throw err
    }
  })

  ipcMain.handle('engine:reinstall', async () => {
    updateState({ status: 'downloading', error: undefined })
    sendToRenderer('engine:status-change', getEngineState())
    try {
      await stopEngine()
    } catch {}
    deleteEngineBinary()

    try {
      const res = await downloadEngineBinary((progress) => {
        mainWindow?.webContents.send('engine:download-progress', progress)
      })
      const providers = dbProviders.list()
      const existing = providers.find((p) => p.type === 'golti-engine')
      if (!existing) {
        dbProviders.upsert({
          id: `golti-engine_${Date.now()}`,
          type: 'golti-engine',
          name: 'Golti Engine Local',
          endpoint: 'http://127.0.0.1:8391',
          apiKey: '',
          isActive: true,
          models: []
        })
      } else if (!existing.isActive) {
        dbProviders.upsert({ ...existing, isActive: true })
      }
      sendToRenderer('providers:updated')

      updateState({ status: 'stopped', error: undefined })
      sendToRenderer('engine:status-change', getEngineState())
      return res
    } catch (err: any) {
      updateState({ status: 'error', error: err.message || String(err) })
      sendToRenderer('engine:status-change', getEngineState())
      throw err
    }
  })

  ipcMain.handle('engine:start', async () => {
    const settings = dbSettings.get()
    const models = listLocalModels()
    const defaultModel = models.length > 0 ? models[0].filepath : undefined
    const { layers, device } = resolveEngineOffload(settings)
    return await startEngine(defaultModel, settings.enginePort, layers, device)
  })

  ipcMain.handle('engine:stop', async () => {
    return await stopEngine()
  })

  ipcMain.handle('engine:load-model', async (_, ggufPath: string) => {
    const settings = dbSettings.get()
    const { layers, device } = resolveEngineOffload(settings)
    return await loadModelInEngine(ggufPath, settings.enginePort, layers, device)
  })

  ipcMain.handle('engine:list-devices', async () => {
    if (!isBinaryInstalled()) return []
    return await listEngineDevices(getBinaryPath())
  })

  ipcMain.handle('engine:download-model', async (_, url: string, filename: string) => {
    const res = await downloadModel(url, filename, (progress) => {
      mainWindow?.webContents.send('engine:download-progress', progress)
    })
    if (res.status === 'complete') {
      try {
        await getAllModels()
      } catch (e) {}
    }
    return res
  })

  ipcMain.handle('engine:pause-download', (_, filename: string) => {
    return { success: pauseModelDownload(filename) }
  })

  ipcMain.handle('engine:cancel-download', (_, filename: string) => {
    return { success: cancelModelDownload(filename) }
  })

  ipcMain.handle('engine:delete-partial', (_, filename: string) => {
    try {
      cancelModelDownload(filename)
      deletePartialModel(filename)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete partial download' }
    }
  })

  ipcMain.handle('engine:list-models', () => {
    // Attach each file's GGUF geometry so the cookbook can rate GPU offload from
    // the model's real shape instead of a parameter-count guess.
    return listLocalModels().map((file) => {
      const info = readGgufModelInfo(file.filepath)
      return {
        ...file,
        geometry: info
          ? {
              blockCount: info.blockCount,
              embeddingLength: info.embeddingLength,
              headCount: info.headCount,
              headCountKv: info.headCountKv,
              fileSizeBytes: file.sizeBytes
            }
          : undefined
      }
    })
  })

  ipcMain.handle('hf:search', async (_, query: string, limit?: number) =>
    searchHFModels(typeof query === 'string' ? query : '', limit)
  )

  ipcMain.handle('hf:model-detail', async (_, repoId: string) => fetchHFModelDetail(repoId))

  ipcMain.handle('hf:resolve-gguf', async (_, ollamaTag: string, quantization?: string) =>
    resolveGguf(
      typeof ollamaTag === 'string' ? ollamaTag : '',
      (quantization as any) || 'Q4_K_M'
    )
  )

  ipcMain.handle('engine:delete-model', async (_, filename: string) => {
    const state = getEngineState()
    if (state.loadedModel) {
      const loadedName = path.basename(state.loadedModel)
      if (loadedName === filename || loadedName === path.basename(filename)) {
        return {
          success: false,
          error: 'This model is currently loaded in Golti Engine. Switch or unload it first, then try again.'
        }
      }
    }

    try {
      cancelModelDownload(filename)
      const res = deleteLocalModel(filename)
      try {
        await getAllModels()
      } catch (e) {}
      return { success: res, error: res ? undefined : 'Model file not found' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete model' }
    }
  })

}

