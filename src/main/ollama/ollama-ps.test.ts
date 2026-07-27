import { describe, expect, it } from 'vitest'
import { summarizeOllamaPs } from './ollama-ps'

const GB = 1024 ** 3

describe('summarizeOllamaPs', () => {
  it('reports a fully offloaded model as gpu', () => {
    const info = summarizeOllamaPs({
      models: [{ name: 'llama3.2:3b', size: 4 * GB, size_vram: 4 * GB }]
    })
    expect(info.loaded).toHaveLength(1)
    expect(info.loaded[0]).toMatchObject({ placement: 'gpu', gpuPercent: 100 })
    expect(info.totalVramBytes).toBe(4 * GB)
  })

  it('reports a split load as partial with the real percentage', () => {
    const info = summarizeOllamaPs({
      models: [{ name: 'qwen2.5:14b', size: 10 * GB, size_vram: 6 * GB }]
    })
    expect(info.loaded[0]).toMatchObject({ placement: 'partial', gpuPercent: 60 })
  })

  it('reports a model with no VRAM as cpu', () => {
    const info = summarizeOllamaPs({
      models: [{ name: 'mistral:7b', size: 5 * GB, size_vram: 0 }]
    })
    expect(info.loaded[0]).toMatchObject({ placement: 'cpu', gpuPercent: 0 })
    expect(info.totalVramBytes).toBe(0)
  })

  it('sums across several resident models', () => {
    const info = summarizeOllamaPs({
      models: [
        { name: 'a', size: 4 * GB, size_vram: 4 * GB },
        { name: 'b', size: 2 * GB, size_vram: 1 * GB }
      ]
    })
    expect(info.totalSizeBytes).toBe(6 * GB)
    expect(info.totalVramBytes).toBe(5 * GB)
  })

  it('never reports more than 100% on GPU', () => {
    const info = summarizeOllamaPs({
      models: [{ name: 'rounding', size: 4 * GB, size_vram: 4 * GB + 4096 }]
    })
    expect(info.loaded[0].gpuPercent).toBe(100)
    expect(info.loaded[0].vramBytes).toBe(4 * GB)
  })

  it('falls back to the `model` key when `name` is absent', () => {
    const info = summarizeOllamaPs({ models: [{ model: 'gemma:2b', size: GB, size_vram: GB }] })
    expect(info.loaded[0].name).toBe('gemma:2b')
  })

  it('treats an empty or malformed payload as nothing loaded', () => {
    for (const payload of [{ models: [] }, {}, null, undefined, { models: 'nope' }]) {
      const info = summarizeOllamaPs(payload)
      expect(info.loaded).toEqual([])
      expect(info.totalVramBytes).toBe(0)
    }
  })

  it('skips entries with no usable name', () => {
    expect(summarizeOllamaPs({ models: [{ size: GB, size_vram: GB }] }).loaded).toEqual([])
  })
})
