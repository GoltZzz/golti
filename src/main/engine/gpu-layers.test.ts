import { describe, expect, it, vi, beforeEach } from 'vitest'

const gguf = vi.hoisted(() => ({ info: null as any }))
const gpu = vi.hoisted(() => ({ vendor: 'nvidia' as string, vramGB: 4 as number | null }))
const file = vi.hoisted(() => ({ sizeBytes: 0 }))

vi.mock('./gguf', () => ({
  readGgufModelInfo: () => gguf.info
}))
vi.mock('./gpu-detect', () => ({
  detectGpu: async () => ({ vendor: gpu.vendor, vramGB: gpu.vramGB, name: 'Test GPU' })
}))
vi.mock('./binary-manager', () => ({
  getInstalledBackend: () => 'vulkan',
  getBinaryPath: () => '/fake/llama-server',
  getEngineSpawnEnv: () => ({}),
  isBinaryInstalled: () => true,
  LLAMA_VERSION: 'test'
}))
vi.mock('fs', async (orig) => {
  const actual = (await orig()) as any
  return {
    ...actual,
    default: { ...actual.default, statSync: () => ({ size: file.sizeBytes }) },
    statSync: () => ({ size: file.sizeBytes })
  }
})

const { computeGpuLayers } = await import('./engine-process')

const GB = 1024 ** 3
/** DeepSeek-R1-Distill-Qwen-14B geometry, read from the real file. */
const QWEN_14B = { architecture: 'qwen2', blockCount: 48, embeddingLength: 5120, headCount: 40, headCountKv: 8 }
/** DeepSeek-R1-Distill-Qwen-7B geometry. */
const QWEN_7B = { architecture: 'qwen2', blockCount: 28, embeddingLength: 3584, headCount: 28, headCountKv: 4 }

beforeEach(() => {
  gpu.vendor = 'nvidia'
  gpu.vramGB = 4
  gguf.info = null
  file.sizeBytes = 0
})

describe('computeGpuLayers', () => {
  it('uses the real block count instead of assuming 32 layers', async () => {
    gguf.info = QWEN_14B
    file.sizeBytes = 8.37 * GB
    // A GTX 1650 reporting 3.83 GB free. The old weights-only maths at 32
    // nominal layers produced 11; counting all 48 layers and their KV gives 16.
    expect(await computeGpuLayers('/models/14b.gguf', 3.83)).toBe(16)
  })

  it('charges each layer for its KV cache, not just its weights', async () => {
    gguf.info = QWEN_14B
    file.sizeBytes = 8.37 * GB
    const withKv = await computeGpuLayers('/models/14b.gguf', 3.83)

    // Same model, KV geometry unreadable → weights-only sizing is more optimistic.
    gguf.info = { ...QWEN_14B, embeddingLength: undefined }
    const withoutKv = await computeGpuLayers('/models/14b.gguf', 3.83)
    expect(withoutKv).toBeGreaterThan(withKv)
  })

  it('offloads everything when the model and its KV comfortably fit', async () => {
    gguf.info = QWEN_7B
    file.sizeBytes = 4.36 * GB
    expect(await computeGpuLayers('/models/7b.gguf', 24)).toBe(-1)
  })

  it('never returns more layers than the model has', async () => {
    gguf.info = QWEN_7B
    file.sizeBytes = 4.36 * GB
    const layers = await computeGpuLayers('/models/7b.gguf', 8)
    expect(layers === -1 || layers <= QWEN_7B.blockCount).toBe(true)
  })

  it('falls back to the nominal count when the header cannot be read', async () => {
    gguf.info = null
    file.sizeBytes = 8.37 * GB
    const layers = await computeGpuLayers('/models/unknown.gguf', 3.83)
    expect(layers).toBeGreaterThan(0)
    expect(layers).toBeLessThan(32)
  })

  it('stays on the CPU when there is no usable headroom', async () => {
    gguf.info = QWEN_14B
    file.sizeBytes = 8.37 * GB
    expect(await computeGpuLayers('/models/14b.gguf', 1)).toBe(0)
  })

  it('stays on the CPU when no GPU was detected', async () => {
    gpu.vendor = 'none'
    gguf.info = QWEN_14B
    file.sizeBytes = 8.37 * GB
    expect(await computeGpuLayers('/models/14b.gguf', 3.83)).toBe(0)
  })

  it('offloads everything on Apple unified memory', async () => {
    gpu.vendor = 'apple'
    expect(await computeGpuLayers('/models/14b.gguf', undefined)).toBe(-1)
  })

  it('sizes a smaller model onto the same card more generously', async () => {
    gguf.info = QWEN_14B
    file.sizeBytes = 8.37 * GB
    const big = await computeGpuLayers('/models/14b.gguf', 3.83)

    gguf.info = QWEN_7B
    file.sizeBytes = 4.36 * GB
    const small = await computeGpuLayers('/models/7b.gguf', 3.83)

    // Same VRAM, but the 7B keeps a far larger share of itself on the GPU.
    expect(small / QWEN_7B.blockCount).toBeGreaterThan(big / QWEN_14B.blockCount)
  })
})
