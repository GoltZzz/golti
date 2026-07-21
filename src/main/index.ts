import { app, BrowserWindow, ipcMain } from 'electron'
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
import {
  cancelGeneration,
  getTokenBudgetForConversation,
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
import type { SendMessagePayload } from '../shared/types'
import { testWebSearch } from './services/web-search'
import {
  initEngine,
  stopEngine,
  startEngine,
  getEngineState,
  onEngineStatusChange,
  downloadEngineBinary,
  downloadModel,
  listLocalModels,
  deleteLocalModel,
  loadModelInEngine
} from './engine'
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

async function getFullSystemInfo(): Promise<SystemInfoFull> {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
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
  }
  
  const speedGHz = cpus[0]?.speed ? cpus[0].speed / 1000 : 0
  
  // RAM
  const totalGB = totalMem / (1024 * 1024 * 1024)
  const freeGB = freeMem / (1024 * 1024 * 1024)
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100
  
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
      const [name, memStr] = stdout.trim().split(',')
      gpuName = name.trim()
      vramGB = parseInt(memStr.trim(), 10) / 1024
    } catch {
      gpuName = 'Generic GPU'
    }
  }
  
  // Disk speed benchmark
  let diskRead: number | null = null
  let diskWrite: number | null = null
  try {
    const tempFilePath = path.join(app.getPath('userData'), 'temp_disk_bench.tmp')
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

    await fs.promises.unlink(tempFilePath)
  } catch (err) {
    console.error('Disk benchmark failed:', err)
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
      writeMBps: diskWrite
    },
    thermals: {
      cpuTempC
    }
  }
}


let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Custom title bar across platforms
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    backgroundColor: '#0b0c10',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  setupIpcHandlers()
  createWindow()

  // Subscribe engine status changes to send to renderer
  onEngineStatusChange((state) => {
    mainWindow?.webContents.send('engine:status-change', state)
  })

  onSearchRuntimeStatusChange((state) => {
    mainWindow?.webContents.send('search-runtime:status-change', state)
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

app.on('before-quit', async () => {
  await Promise.all([stopEngine(), stopSearchRuntime()])
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
  ipcMain.handle('db:providers:upsert', (_, provider: any) => dbProviders.upsert(provider))
  ipcMain.handle('db:providers:delete', (_, id: string) => dbProviders.delete(id))

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
  ipcMain.handle('ai:chat:regenerate', async (_, payload: SendMessagePayload & { messageId: string }) => {
    return startChatGeneration(mainWindow, {
      ...payload,
      regenerateFromId: payload.messageId || payload.regenerateFromId
    })
  })

  // System Info
  ipcMain.handle('system:info', () => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
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
  ipcMain.handle('system:info:full', async () => {
    return await getFullSystemInfo()
  })

  // Cookbook Ollama Status check
  ipcMain.handle('cookbook:ollama-status', async () => {
    const providers = dbProviders.list()
    const ollamaProvider = providers.find(p => p.type === 'ollama')
    const endpoint = (ollamaProvider?.endpoint || 'http://localhost:11434').replace(/\/+$/, '')
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)
      const res = await fetch(`${endpoint}/api/tags`, { signal: controller.signal })
      clearTimeout(timeoutId)
      return { online: res.ok }
    } catch (e) {
      return { online: false }
    }
  })

  // Cookbook Installed Models check
  ipcMain.handle('cookbook:installed-models', async () => {
    const providers = dbProviders.list()
    const ollamaProvider = providers.find(p => p.type === 'ollama')
    const endpoint = (ollamaProvider?.endpoint || 'http://localhost:11434').replace(/\/+$/, '')
    try {
      const res = await fetch(`${endpoint}/api/tags`)
      if (!res.ok) return []
      const data = (await res.json()) as any
      if (Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name || m.model)
      }
      return []
    } catch (e) {
      console.warn('Failed to fetch installed Ollama models:', e)
      return []
    }
  })

  // Cookbook Ollama Model Pull
  ipcMain.handle('cookbook:ollama-pull', async (_, modelTag: string) => {
    const providers = dbProviders.list()
    const ollamaProvider = providers.find(p => p.type === 'ollama')
    const endpoint = (ollamaProvider?.endpoint || 'http://localhost:11434').replace(/\/+$/, '')

    try {
      const response = await fetch(`${endpoint}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modelTag,
          stream: true
        })
      })

      if (!response.ok || !response.body) {
        throw new Error(`Ollama error (${response.status}): ${await response.text()}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      // Process stream asynchronously
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const parsed = JSON.parse(line)
                const completed = parsed.completed || 0
                const total = parsed.total || 0
                const percent = total > 0 ? Math.round((completed / total) * 100) : 0
                
                mainWindow?.webContents.send('cookbook:pull-progress', {
                  modelTag,
                  status: parsed.status || 'pulling',
                  completed,
                  total,
                  percent
                })
              } catch (e) {
                // Ignore partial JSON
              }
            }
          }

          // Done pulling, notify completion
          mainWindow?.webContents.send('cookbook:pull-progress', {
            modelTag,
            status: 'success',
            completed: 100,
            total: 100,
            percent: 100
          })

          // Trigger model scan refresh in provider manager
          setTimeout(async () => {
            try {
              await getAllModels()
            } catch (err) {}
          }, 1000)

        } catch (streamErr: any) {
          console.error('[Ollama Pull Stream Error]', streamErr)
          mainWindow?.webContents.send('cookbook:pull-progress', {
            modelTag,
            status: 'error',
            completed: 0,
            total: 0,
            percent: 0,
            error: streamErr.message
          })
        }
      })()

      return { success: true }
    } catch (err: any) {
      console.error('[Ollama Pull Error]', err)
      return { success: false, error: err.message }
    }
  })

  // Golti Engine IPC Handlers
  ipcMain.handle('engine:status', () => getEngineState())
  
  ipcMain.handle('engine:install', async () => {
    return await downloadEngineBinary((progress) => {
      mainWindow?.webContents.send('engine:download-progress', progress)
    })
  })

  ipcMain.handle('engine:start', async () => {
    const settings = dbSettings.get()
    const models = listLocalModels()
    const defaultModel = models.length > 0 ? models[0].filepath : undefined
    return await startEngine(defaultModel, settings.enginePort, settings.engineGpuLayers)
  })

  ipcMain.handle('engine:stop', async () => {
    return await stopEngine()
  })

  ipcMain.handle('engine:load-model', async (_, ggufPath: string) => {
    const settings = dbSettings.get()
    return await loadModelInEngine(ggufPath, settings.enginePort, settings.engineGpuLayers)
  })

  ipcMain.handle('engine:download-model', async (_, url: string, filename: string) => {
    const res = await downloadModel(url, filename, (progress) => {
      mainWindow?.webContents.send('engine:download-progress', progress)
    })
    try {
      await getAllModels()
    } catch (e) {}
    return res
  })

  ipcMain.handle('engine:list-models', () => listLocalModels())

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
      const res = deleteLocalModel(filename)
      try {
        await getAllModels()
      } catch (e) {}
      return { success: res, error: res ? undefined : 'Model file not found' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete model' }
    }
  })

  // Cookbook Ollama Model Delete
  ipcMain.handle('cookbook:ollama-delete', async (_, modelTag: string) => {
    const providers = dbProviders.list()
    const ollamaProvider = providers.find(p => p.type === 'ollama')
    const endpoint = (ollamaProvider?.endpoint || 'http://localhost:11434').replace(/\/+$/, '')

    try {
      const response = await fetch(`${endpoint}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelTag, name: modelTag })
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return {
          success: false,
          error: text || `Ollama delete failed (${response.status})`
        }
      }

      try {
        await getAllModels()
      } catch (e) {}

      return { success: true }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to delete Ollama model. Is Ollama running?'
      }
    }
  })
}

