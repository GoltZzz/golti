import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getBinaryPath, isBinaryInstalled, getEngineSpawnEnv } from './binary-manager'
import { getModelDir } from './model-downloader'

export const EMBEDDING_MODEL_FILENAME = 'nomic-embed-text-v1.5.Q4_K_M.gguf'
export const EMBEDDING_MODEL_URL =
  'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf'
const EMBEDDING_PORT = 8392
const EMBEDDING_ENDPOINT = `http://127.0.0.1:${EMBEDDING_PORT}`

let serverProcess: ChildProcess | null = null
let starting: Promise<boolean> | null = null
let downloading: Promise<boolean> | null = null

function embeddingDir(): string {
  const dir = path.join(getModelDir(), '_embeddings')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function modelPath(): string {
  return path.join(embeddingDir(), EMBEDDING_MODEL_FILENAME)
}

export function isEmbeddingModelInstalled(): boolean {
  return fs.existsSync(modelPath())
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${EMBEDDING_ENDPOINT}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureModelDownloaded(): Promise<boolean> {
  if (isEmbeddingModelInstalled()) return true
  if (downloading) return downloading

  downloading = (async () => {
    const target = modelPath()
    const temp = `${target}.part`
    console.warn('[EmbeddingServer] Starting model download for nomic-embed-text...')
    try {
      const res = await fetch(EMBEDDING_MODEL_URL)
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const fileStream = fs.createWriteStream(temp)
      const reader = res.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) fileStream.write(Buffer.from(value))
      }
      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
      })
      fs.renameSync(temp, target)
      console.warn('[EmbeddingServer] Model download complete!')
      return true
    } catch (err) {
      console.warn('[EmbeddingServer] Model download failed:', err)
      try {
        if (fs.existsSync(temp)) fs.unlinkSync(temp)
      } catch {}
      return false
    } finally {
      downloading = null
    }
  })()

  return downloading
}

export async function waitForEmbeddingModel(): Promise<boolean> {
  return ensureModelDownloaded()
}

async function ensureServerRunning(): Promise<boolean> {
  if (serverProcess && (await checkHealth())) return true
  if (starting) return starting

  starting = (async () => {
    if (!isBinaryInstalled() || !isEmbeddingModelInstalled()) {
      console.warn('[EmbeddingServer] Cannot start server: binaryInstalled=', isBinaryInstalled(), 'modelInstalled=', isEmbeddingModelInstalled())
      return false
    }

    const args = [
      '--host', '127.0.0.1',
      '--port', String(EMBEDDING_PORT),
      '--model', modelPath(),
      '--embeddings',
      '--pooling', 'mean',
      '--ctx-size', '2048',
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
      console.warn('[EmbeddingServer] Spawn failed:', err)
      serverProcess = null
      return false
    }

    serverProcess.stderr?.on('data', (d: Buffer) => console.log(`[embedding-server] ${d}`))
    serverProcess.on('exit', () => {
      serverProcess = null
    })

    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      if (serverProcess === null) return false
      if (await checkHealth()) return true
      await new Promise((r) => setTimeout(r, 500))
    }
    console.warn('[EmbeddingServer] Server health check timed out after 60s')
    return false
  })().finally(() => {
    starting = null
  })

  return starting
}

export async function embed(text: string): Promise<number[] | null> {
  const input = text.trim()
  if (!input) return null

  if (!isEmbeddingModelInstalled()) {
    console.warn('[EmbeddingServer] embed() requested but model not installed. Starting background download...')
    void ensureModelDownloaded()
    return null
  }
  if (!(await ensureServerRunning())) {
    console.warn('[EmbeddingServer] embed() requested but server is not running')
    return null
  }

  try {
    const res = await fetch(`${EMBEDDING_ENDPOINT}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, model: EMBEDDING_MODEL_FILENAME }),
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) {
      console.warn(`[EmbeddingServer] HTTP ${res.status} from embedding endpoint`)
      return null
    }
    const data = await res.json()
    const vector = data?.data?.[0]?.embedding
    if (!Array.isArray(vector) || vector.length === 0) {
      console.warn('[EmbeddingServer] Invalid embedding vector returned:', data)
      return null
    }
    return vector.map(Number)
  } catch (err) {
    console.warn('[EmbeddingServer] Embedding request failed:', err)
    return null
  }
}

export async function prewarmEmbeddingServer(): Promise<void> {
  if (!(await ensureModelDownloaded())) return
  await ensureServerRunning()
}

export async function stopEmbeddingServer(): Promise<void> {
  const proc = serverProcess
  serverProcess = null
  if (proc && !proc.killed) {
    proc.kill()
  }
}

