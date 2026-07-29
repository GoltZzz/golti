import { describe, expect, it } from 'vitest'
import {
  ENGINE_LOAD_BASE_MS,
  ENGINE_LOAD_CEILING_MS,
  classifyEngineFailure,
  estimateEngineLoadBudgetMs,
  modelDisplayName,
  modelFitsInMemory
} from './engine-startup'

const GB = 1024 * 1024 * 1024

describe('estimateEngineLoadBudgetMs', () => {
  it('falls back to the base budget when the size is unknown', () => {
    expect(estimateEngineLoadBudgetMs(undefined, 8 * GB)).toBe(ENGINE_LOAD_BASE_MS)
  })

  it('gives a bigger model more time', () => {
    const small = estimateEngineLoadBudgetMs(0.6 * GB, 8 * GB)
    const large = estimateEngineLoadBudgetMs(4.7 * GB, 8 * GB)
    expect(large).toBeGreaterThan(small)
  })

  it('allows far more time when the model does not fit in free memory', () => {
    const fits = estimateEngineLoadBudgetMs(4.7 * GB, 16 * GB)
    const swaps = estimateEngineLoadBudgetMs(4.7 * GB, 3 * GB)
    expect(swaps).toBeGreaterThan(fits * 2)
  })

  it('never exceeds the ceiling', () => {
    expect(estimateEngineLoadBudgetMs(200 * GB, 1 * GB)).toBe(ENGINE_LOAD_CEILING_MS)
  })

  it('beats the old fixed 8 second window for a 4.7 GB model on a 3 GB machine', () => {
    expect(estimateEngineLoadBudgetMs(4.7 * GB, 3 * GB)).toBeGreaterThan(8_000)
  })
})

describe('modelFitsInMemory', () => {
  it('treats unknown values as fitting', () => {
    expect(modelFitsInMemory(undefined, undefined)).toBe(true)
  })

  it('rejects a model larger than free memory', () => {
    expect(modelFitsInMemory(4.7 * GB, 3 * GB)).toBe(false)
  })

  it('accepts a model comfortably inside free memory', () => {
    expect(modelFitsInMemory(0.6 * GB, 3 * GB)).toBe(true)
  })
})

describe('modelDisplayName', () => {
  it('strips directories and the gguf suffix', () => {
    expect(modelDisplayName('/Users/x/Golti/models/Qwen3-8B-Q4_K_M.gguf')).toBe('Qwen3-8B-Q4_K_M')
  })

  it('handles a missing path', () => {
    expect(modelDisplayName(undefined)).toBe('the model')
  })
})

describe('classifyEngineFailure', () => {
  it('reports a memory problem when a timeout hits a model that cannot fit', () => {
    const failure = classifyEngineFailure({
      timedOut: true,
      modelPath: '/models/Qwen3-8B-Q4_K_M.gguf',
      modelSizeBytes: 4.7 * GB,
      freeMemoryBytes: 3 * GB
    })
    expect(failure.kind).toBe('out-of-memory')
    expect(failure.action).toBe('choose-smaller-model')
    expect(failure.detail).toContain('4.7 GB')
    expect(failure.detail).toContain('3.0 GB')
  })

  it('reports a plain timeout when the model does fit', () => {
    const failure = classifyEngineFailure({
      timedOut: true,
      modelPath: '/models/tiny.gguf',
      modelSizeBytes: 0.5 * GB,
      freeMemoryBytes: 8 * GB
    })
    expect(failure.kind).toBe('load-timeout')
  })

  it('detects a GPU allocation failure', () => {
    const failure = classifyEngineFailure({ stderr: 'ggml_vulkan: ErrorOutOfDeviceMemory' })
    expect(failure.kind).toBe('gpu-memory')
  })

  it('detects a busy port', () => {
    const failure = classifyEngineFailure({ stderr: 'bind: address already in use' })
    expect(failure.kind).toBe('port-in-use')
  })

  it('does not classify harmless startup chatter as a failure cause', () => {
    const failure = classifyEngineFailure({
      stderr:
        "0.00.268.260 I srv load_model: loading model '/models/Qwen3-8B-Q4_K_M.gguf'\n" +
        "0.00.916.439 W load: control-looking token: 128247 '</s>' was not control-type",
      timedOut: true,
      modelSizeBytes: 0.5 * GB,
      freeMemoryBytes: 8 * GB
    })
    expect(failure.kind).toBe('load-timeout')
  })

  it('keeps the raw log available for the details view', () => {
    const failure = classifyEngineFailure({ stderr: 'some raw log', timedOut: true })
    expect(failure.logs).toBe('some raw log')
  })
})
