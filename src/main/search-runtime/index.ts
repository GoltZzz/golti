import type { SearchRuntimeProgress, SearchRuntimeState } from '../../shared/types'
import {
  getInstalledVersion,
  installSearchRuntime,
  isSearchRuntimeInstalled,
  reinstallSearchRuntime
} from './binary-manager'
import {
  ensureSearchRuntimeRunning,
  getSearchAuthToken,
  getSearchEndpoint,
  getSearchRuntimeState,
  onSearchRuntimeStatusChange,
  refreshInstalledStatus,
  setSearchRuntimeDownloading,
  startSearchRuntime,
  stopSearchRuntime
} from './process-manager'

export async function initSearchRuntime(): Promise<SearchRuntimeState> {
  return refreshInstalledStatus()
}

export async function installAndStartSearchRuntime(
  onProgress?: (p: SearchRuntimeProgress) => void,
  ports?: { apiPort?: number; searxPort?: number }
): Promise<SearchRuntimeState> {
  setSearchRuntimeDownloading()
  try {
    if (!isSearchRuntimeInstalled()) {
      await installSearchRuntime(onProgress)
    }
    refreshInstalledStatus()
    return startSearchRuntime(ports)
  } catch (err: any) {
    setSearchRuntimeDownloading(err?.message || 'Failed to set up Web Search')
    throw err
  }
}

export async function repairSearchRuntime(
  onProgress?: (p: SearchRuntimeProgress) => void,
  ports?: { apiPort?: number; searxPort?: number }
): Promise<SearchRuntimeState> {
  await stopSearchRuntime()
  setSearchRuntimeDownloading()
  try {
    await reinstallSearchRuntime(onProgress)
    refreshInstalledStatus()
    return startSearchRuntime(ports)
  } catch (err: any) {
    setSearchRuntimeDownloading(err?.message || 'Failed to repair Web Search')
    throw err
  }
}

export {
  ensureSearchRuntimeRunning,
  getInstalledVersion,
  getSearchAuthToken,
  getSearchEndpoint,
  getSearchRuntimeState,
  installSearchRuntime,
  isSearchRuntimeInstalled,
  onSearchRuntimeStatusChange,
  startSearchRuntime,
  stopSearchRuntime
}
