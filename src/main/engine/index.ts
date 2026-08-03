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
  registerGenerationChecker,
  EngineBusyError,
  compactEngineKvCache,
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

export async function initEngine(): Promise<EngineState> {
  const isInstalled = isBinaryInstalled()
  if (!isInstalled) {
    return getEngineState()
  }

  // Check if any local GGUF models exist
  const models = listLocalModels()
  const defaultModelPath = models.length > 0 ? models[0].filepath : undefined

  // Ensure Golti Engine provider is active in DB
  const providers = dbProviders.list()
  const engineProvider = providers.find((p) => p.type === 'golti-engine')
  if (engineProvider && !engineProvider.isActive) {
    dbProviders.upsert({ ...engineProvider, isActive: true })
  }

  try {
    const state = await startEngine(defaultModelPath)
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
  registerGenerationChecker,
  EngineBusyError,
  compactEngineKvCache,
  type EngineDevice,
  downloadModel,
  listLocalModels,
  deleteLocalModel,
  deletePartialModel,
  pauseModelDownload,
  cancelModelDownload,
  getModelDir
}

