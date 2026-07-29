import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getBinaryPath, isBinaryInstalled, getEngineSpawnEnv } from './binary-manager'
import { getModelDir } from './model-downloader'
import { dbSettings } from '../db/database'

const MEMORY_PORT = 8393
const MEMORY_ENDPOINT = `http://127.0.0.1:${MEMORY_PORT}`

let serverProcess: ChildProcess | null = null
let starting: Promise<boolean> | null = null
let loadedFilename: string | null = null

function resolveModelPath(filename: string): string | null {
  const base = path.basename(filename)
  if (base !== filename || !base.toLowerCase().endsWith('.gguf') || base.includes('..')) {
    return null
  }
  const full = path.join(getModelDir(), base)
  return fs.existsSync(full) ? full : null
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MEMORY_ENDPOINT}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

function stopProcess(): void {
  const proc = serverProcess
  serverProcess = null
  loadedFilename = null
  if (proc && !proc.killed) proc.kill()
}

async function ensureServerRunning(filename: string): Promise<boolean> {
  const modelPath = resolveModelPath(filename)
  if (!modelPath || !isBinaryInstalled()) return false

  if (serverProcess && loadedFilename === filename && (await checkHealth())) return true
  if (starting) return starting

  if (serverProcess && loadedFilename !== filename) stopProcess()

  starting = (async () => {
    const args = [
      '--host', '127.0.0.1',
      '--port', String(MEMORY_PORT),
      '--model', modelPath,
      '--ctx-size', '4096',
      '--n-gpu-layers', '0'
    ]

    const binaryPath = getBinaryPath()
    try {
      serverProcess = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: getEngineSpawnEnv(binaryPath)
      })
    } catch (err) {
      console.warn('[MemoryServer] Spawn failed:', err)
      serverProcess = null
      return false
    }

    loadedFilename = filename
    serverProcess.stderr?.on('data', (d: Buffer) => console.log(`[memory-server] ${d}`))
    serverProcess.on('exit', () => {
      serverProcess = null
      loadedFilename = null
    })

    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      if (serverProcess === null) return false
      if (await checkHealth()) return true
      await new Promise((r) => setTimeout(r, 500))
    }
    return false
  })().finally(() => {
    starting = null
  })

  return starting
}

export async function runMemoryCompletion(
  filename: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  if (!(await ensureServerRunning(filename))) return null
  try {
    const res = await fetch(`${MEMORY_ENDPOINT}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: filename,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        temperature: 0,
        max_tokens: 512
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

export async function prewarmMemoryServer(): Promise<void> {
  const filename = dbSettings.get().memoryModel?.trim()
  if (!filename) return
  await ensureServerRunning(filename)
}

export function stopMemoryServer(): void {
  stopProcess()
}
