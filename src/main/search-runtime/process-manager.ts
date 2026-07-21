import { spawn, ChildProcess } from 'child_process'
import net from 'net'
import type { SearchRuntimeState } from '../../shared/types'
import {
  getApiBinaryPath,
  getInstalledVersion,
  getSearxLauncherPath,
  isSearchRuntimeInstalled
} from './binary-manager'
import { getOrCreateSearchToken } from './token'
import { DEFAULT_SEARCH_API_PORT, DEFAULT_SEARX_PORT } from './constants'

let apiProcess: ChildProcess | null = null
let searxProcess: ChildProcess | null = null
let currentState: SearchRuntimeState = {
  status: 'not-installed',
  apiHealthy: false,
  searxHealthy: false,
  apiPort: DEFAULT_SEARCH_API_PORT,
  searxPort: DEFAULT_SEARX_PORT
}

type Listener = (state: SearchRuntimeState) => void
const listeners = new Set<Listener>()

export function onSearchRuntimeStatusChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function updateState(updates: Partial<SearchRuntimeState>): SearchRuntimeState {
  currentState = { ...currentState, ...updates }
  for (const l of listeners) l(currentState)
  return currentState
}

export function getSearchRuntimeState(): SearchRuntimeState {
  if (!isSearchRuntimeInstalled() && currentState.status !== 'downloading') {
    return {
      ...currentState,
      status: currentState.status === 'error' ? 'error' : 'not-installed'
    }
  }
  return currentState
}

export function setSearchRuntimeDownloading(error?: string): void {
  updateState({
    status: error ? 'error' : 'downloading',
    error,
    apiHealthy: false,
    searxHealthy: false
  })
}

async function findFreePort(preferred: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => server.close(() => resolve(true)))
      server.listen(port, '127.0.0.1')
    })

  for (let i = 0; i < 20; i++) {
    const port = preferred + i
    if (await tryPort(port)) return port
  }
  throw new Error('No free local port available for Web Search')
}

export async function checkSearchApiHealth(
  port = currentState.apiPort || DEFAULT_SEARCH_API_PORT
): Promise<{ ok: boolean; engine?: string; searxReady?: boolean }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500)
    })
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as any
    return {
      ok: data.status === 'ok',
      engine: data.engine,
      searxReady: Boolean(data.searxReady)
    }
  } catch {
    return { ok: false }
  }
}

async function waitForHealth(port: number, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const health = await checkSearchApiHealth(port)
    if (health.ok) {
      updateState({
        status: 'running',
        apiHealthy: true,
        searxHealthy: Boolean(health.searxReady),
        engine: health.engine,
        error: undefined
      })
      return true
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

function killProcess(proc: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || proc.killed) {
      resolve()
      return
    }
    proc.once('exit', () => resolve())
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }
      resolve()
    }, 2000)
  })
}

export async function stopSearchRuntime(): Promise<SearchRuntimeState> {
  await killProcess(apiProcess)
  await killProcess(searxProcess)
  apiProcess = null
  searxProcess = null
  return updateState({
    status: isSearchRuntimeInstalled() ? 'stopped' : 'not-installed',
    apiHealthy: false,
    searxHealthy: false,
    engine: undefined,
    version: getInstalledVersion()
  })
}

export async function startSearchRuntime(options?: {
  apiPort?: number
  searxPort?: number
}): Promise<SearchRuntimeState> {
  if (!isSearchRuntimeInstalled()) {
    return updateState({
      status: 'not-installed',
      error: 'Web Search is not installed yet',
      apiHealthy: false,
      searxHealthy: false
    })
  }

  // Reuse a healthy listener even if we lost the child handle (e.g. after hot reload).
  const preferredApi = options?.apiPort ?? DEFAULT_SEARCH_API_PORT
  const existing = await checkSearchApiHealth(currentState.apiPort || preferredApi)
  if (existing.ok) {
    return updateState({
      status: 'running',
      apiPort: currentState.apiPort || preferredApi,
      apiHealthy: true,
      searxHealthy: Boolean(existing.searxReady),
      engine: existing.engine,
      version: getInstalledVersion(),
      error: undefined
    })
  }

  if (apiProcess || searxProcess) {
    await stopSearchRuntime()
  }

  const preferredSearx = options?.searxPort ?? DEFAULT_SEARX_PORT
  const apiPort = await findFreePort(preferredApi)
  // Prefer a distinct SearXNG port even when the preferred API port was taken.
  const searxStart =
    preferredSearx === apiPort ? preferredSearx + 1 : preferredSearx === preferredApi ? preferredApi + 1 : preferredSearx
  const searxPort = await findFreePort(searxStart === apiPort ? apiPort + 1 : searxStart)
  const token = getOrCreateSearchToken()
  const binary = getApiBinaryPath()
  const searxLauncher = getSearxLauncherPath()

  updateState({
    status: 'starting',
    apiPort,
    searxPort,
    version: getInstalledVersion(),
    error: undefined,
    apiHealthy: false,
    searxHealthy: false
  })

  let searxUrl = ''
  if (searxLauncher) {
    searxProcess = spawn(searxLauncher, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SEARXNG_SETTINGS_PATH: undefined,
        PORT: String(searxPort)
      }
    })
    searxProcess.stdout?.on('data', (d) => {
      updateState({ lastLog: String(d).slice(0, 240) })
    })
    searxProcess.stderr?.on('data', (d) => {
      updateState({ lastLog: String(d).slice(0, 240) })
    })
    searxProcess.on('exit', () => {
      searxProcess = null
      updateState({ searxHealthy: false })
    })
    searxUrl = `http://127.0.0.1:${searxPort}`
    await new Promise((r) => setTimeout(r, 800))
  }

  const args = ['-host', '127.0.0.1', '-port', String(apiPort), '-token', token]
  if (searxUrl) args.push('-searxng', searxUrl)

  apiProcess = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  apiProcess.stdout?.on('data', (d) => {
    updateState({ lastLog: String(d).slice(0, 240) })
  })
  apiProcess.stderr?.on('data', (d) => {
    updateState({ lastLog: String(d).slice(0, 240) })
  })
  apiProcess.on('exit', (code, signal) => {
    apiProcess = null
    if (currentState.status === 'running' || currentState.status === 'starting') {
      updateState({
        status: 'error',
        apiHealthy: false,
        error: `Web Search stopped unexpectedly (${signal || code})`
      })
    }
  })
  apiProcess.on('error', (err) => {
    apiProcess = null
    updateState({ status: 'error', error: err.message, apiHealthy: false })
  })

  const healthy = await waitForHealth(apiPort)
  if (!healthy) {
    await stopSearchRuntime()
    return updateState({
      status: 'error',
      error: 'Web Search could not start. Please try again.',
      apiHealthy: false
    })
  }
  return getSearchRuntimeState()
}

export async function ensureSearchRuntimeRunning(options?: {
  apiPort?: number
  searxPort?: number
}): Promise<SearchRuntimeState> {
  const state = getSearchRuntimeState()
  if (state.status === 'running' && state.apiHealthy) {
    const health = await checkSearchApiHealth(state.apiPort || DEFAULT_SEARCH_API_PORT)
    if (health.ok) {
      return updateState({
        apiHealthy: true,
        searxHealthy: Boolean(health.searxReady),
        engine: health.engine,
        error: undefined
      })
    }
  }
  return startSearchRuntime(options)
}

export function getSearchEndpoint(): string {
  const port = currentState.apiPort || DEFAULT_SEARCH_API_PORT
  return `http://127.0.0.1:${port}`
}

export function getSearchAuthToken(): string {
  return getOrCreateSearchToken()
}

// Initialize status from disk on module load (after app ready typically)
export function refreshInstalledStatus(): SearchRuntimeState {
  if (isSearchRuntimeInstalled()) {
    if (currentState.status === 'not-installed' || currentState.status === 'downloading') {
      return updateState({
        status: 'stopped',
        version: getInstalledVersion(),
        apiHealthy: false,
        searxHealthy: false
      })
    }
  }
  return getSearchRuntimeState()
}
