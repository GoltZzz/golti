import { describe, expect, it } from 'vitest'
import { presentableErrorMessage } from './error-display'

describe('presentableErrorMessage', () => {
  it('collapses a llama-server log dump to its first line', () => {
    const log = [
      '0.00.260.682 I cmn common_param: verbosity = 3 (adjust with the `-lv N` CLI arg)',
      '0.00.265.202 W srv llama_server: CORS is set to allow all origins',
      '0.00.265.202 W srv llama_server: more info: https://github.com/ggml-org/llama.cpp/pull/25655',
      "0.00.268.260 I srv load_model: loading model '/models/Qwen3-8B-Q4_K_M.gguf'"
    ].join('\n')
    const out = presentableErrorMessage(new Error(log))
    expect(out).not.toContain('\n')
    expect(out).not.toContain('`')
    expect(out).toContain('verbosity = 3')
    expect(out).not.toContain('CORS')
  })

  it('strips urls so they cannot render as links', () => {
    const out = presentableErrorMessage(new Error('see https://example.com/thing for details'))
    expect(out).not.toContain('http')
  })

  it('strips code fences', () => {
    const out = presentableErrorMessage(new Error('bad thing ```sh\nrm -rf\n``` end'))
    expect(out).not.toContain('```')
  })

  it('keeps a short friendly message intact', () => {
    const msg = 'This model is too big for your free memory. Pick a smaller one.'
    expect(presentableErrorMessage(new Error(msg))).toBe(msg)
  })

  it('truncates very long messages', () => {
    const out = presentableErrorMessage(new Error('x'.repeat(1000)))
    expect(out.length).toBeLessThanOrEqual(281)
    expect(out.endsWith('…')).toBe(true)
  })

  it('falls back when there is no message', () => {
    expect(presentableErrorMessage(new Error(''))).toContain('Something went wrong')
  })
})
