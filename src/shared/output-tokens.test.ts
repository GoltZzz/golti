import { describe, it, expect } from 'vitest'
import {
  LOCAL_OUTPUT_FLOOR,
  LOCAL_OUTPUT_CEILING,
  baselineLocalOutputTokens,
  resolveLocalMaxOutputTokens
} from './output-tokens'

describe('baselineLocalOutputTokens', () => {
  it('gives reasoning models room to think', () => {
    expect(baselineLocalOutputTokens('deepseek-r1:8b')).toBe(8192)
    expect(baselineLocalOutputTokens('qwq-32b-preview')).toBe(8192)
    expect(baselineLocalOutputTokens('Qwen3-14B-Q4_K_M')).toBe(8192)
  })

  it('gives coding models room for whole files', () => {
    expect(baselineLocalOutputTokens('qwen2.5-coder:7b')).toBe(8192)
    expect(baselineLocalOutputTokens('devstral-small')).toBe(8192)
  })

  it('scales down for tiny models', () => {
    expect(baselineLocalOutputTokens('llama3.2:1b')).toBe(2048)
    expect(baselineLocalOutputTokens('qwen2.5:0.5b')).toBe(2048)
    expect(baselineLocalOutputTokens('llama3.2:3b')).toBe(3072)
  })

  it('falls back to a general-purpose default', () => {
    expect(baselineLocalOutputTokens('llama3.1:8b')).toBe(4096)
    expect(baselineLocalOutputTokens('mistral-nemo')).toBe(4096)
  })

  it('does not read a parameter count out of a version number', () => {
    expect(baselineLocalOutputTokens('llama3.1:8b')).toBe(4096)
    expect(baselineLocalOutputTokens('gemma2:27b')).toBe(4096)
  })
})

describe('resolveLocalMaxOutputTokens', () => {
  it('uses the family baseline when the context window is roomy', () => {
    expect(
      resolveLocalMaxOutputTokens({
        modelName: 'deepseek-r1:8b',
        contextWindow: 32768,
        promptTokens: 1000
      })
    ).toBe(8192)
  })

  it('fits the cap to a small context window', () => {
    expect(
      resolveLocalMaxOutputTokens({
        modelName: 'deepseek-r1:8b',
        contextWindow: 4096,
        promptTokens: 1000
      })
    ).toBe(2584)
  })

  it('never returns less than the floor, even when the prompt fills the window', () => {
    expect(
      resolveLocalMaxOutputTokens({
        modelName: 'llama3.1:8b',
        contextWindow: 4096,
        promptTokens: 4000
      })
    ).toBe(LOCAL_OUTPUT_FLOOR)
  })

  it('honours an explicit user setting', () => {
    expect(
      resolveLocalMaxOutputTokens({
        modelName: 'llama3.2:1b',
        requested: 6000,
        contextWindow: 32768
      })
    ).toBe(6000)
  })

  it('still fits an explicit setting to the context window', () => {
    expect(
      resolveLocalMaxOutputTokens({
        modelName: 'llama3.1:8b',
        requested: 100000,
        contextWindow: 8192,
        promptTokens: 2000
      })
    ).toBe(5680)
  })

  it('treats zero and undefined as auto', () => {
    const auto = resolveLocalMaxOutputTokens({ modelName: 'llama3.1:8b' })
    expect(resolveLocalMaxOutputTokens({ modelName: 'llama3.1:8b', requested: 0 })).toBe(auto)
    expect(auto).toBe(4096)
  })

  it('caps runaway explicit values', () => {
    expect(
      resolveLocalMaxOutputTokens({ modelName: 'llama3.1:8b', requested: 999999 })
    ).toBe(LOCAL_OUTPUT_CEILING)
  })

  it('works with no context window information', () => {
    expect(resolveLocalMaxOutputTokens({ modelName: 'qwq:32b' })).toBe(8192)
  })
})
