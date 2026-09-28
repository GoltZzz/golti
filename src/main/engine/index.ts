import { isBinaryInstalled, downloadEngineBinary, deleteEngineBinary, getBinaryPath } from './binary-manager'
import {
  startEngine,
  stopEngine,
  loadModelInEngine,
  getEngineState,
  onEngineStatusChange,
  updateState,
  checkEngineHealth,
  listEngineDevices,
  type EngineDevice
} from './engine-process'
import {
  downloadModel,
  listLocalModels,
  deleteLocalModel,
  deletePartialModel,
  pauseModelDownload,
  cancelModelDownload,
  getModelDir
} from './model-downloader'
import { EngineDownloadProgress, EngineState } from '../../shared/types'
import { dbProviders } from '../db/database'

export interface InitEngineOptions {
  /** Model the user last had loaded; preferred over the first file on disk. */
  preferredModelPath?: string
  port?: number
  gpuLayers?: number
  deviceId?: string
}

/** Picks the startup model: the last-used one if it still exists, else the first on disk. */
export function pickStartupModel(
  models: { filepath: string }[],
  preferredModelPath?: string
): string | undefined {
  if (preferredModelPath && models.some((m) => m.filepath === preferredModelPath)) {
    return preferredModelPath
  }
  return models[0]?.filepath
}

export async function initEngine(options: InitEngineOptions = {}): Promise<EngineState> {
  const isInstalled = isBinaryInstalled()
  if (!isInstalled) {
    return getEngineState()
  }

  // Check if any local GGUF models exist
  const models = listLocalModels()
  const defaultModelPath = pickStartupModel(models, options.preferredModelPath)

  // Ensure Golti Engine provider is active in DB
  const providers = dbProviders.list()
  const engineProvider = providers.find((p) => p.type === 'golti-engine')
  if (engineProvider && !engineProvider.isActive) {
    dbProviders.upsert({ ...engineProvider, isActive: true })
  }

  try {
    const state = await startEngine(defaultModelPath, options.port, options.gpuLayers, options.deviceId)
    return state
  } catch (e) {
    console.warn('[GoltiEngine] Failed to auto-start engine on init:', e)
    return getEngineState()
  }
}

export {
  isBinaryInstalled,
  downloadEngineBinary,
  deleteEngineBinary,
  getBinaryPath,
  startEngine,
  stopEngine,
  loadModelInEngine,
  getEngineState,
  onEngineStatusChange,
  updateState,
  checkEngineHealth,
  listEngineDevices,
  type EngineDevice,
  downloadModel,
  listLocalModels,
  deleteLocalModel,
  deletePartialModel,
  pauseModelDownload,
  cancelModelDownload,
  getModelDir
}

