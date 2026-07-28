import { describe, it, expect } from 'vitest'
import {
  isChatCapableRepo,
  parseQuantLabel,
  normalizeQuant,
  parseParamsFromRepoName,
  deriveParameterBillions,
  estimateRamGB,
  estimateParamsFromBytes,
  selectQuantVariants,
  deriveSummary,
  prettifyRepoName,
  deriveUseCases,
  buildCookbookModels,
  reconcileParams,
  HFModelSummaryRaw,
  HFTreeEntryRaw
} from './hf-catalog'

function summaryRaw(overrides: Partial<HFModelSummaryRaw> = {}): HFModelSummaryRaw {
  return {
    id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    tags: ['gguf', 'text-generation'],
    pipeline_tag: 'text-generation',
    downloads: 1000,
    likes: 10,
    ...overrides
  }
}

describe('isChatCapableRepo', () => {
  it('accepts a text-generation gguf repo', () => {
    expect(isChatCapableRepo(summaryRaw())).toBe(true)
  })

  it('rejects repos without a gguf tag', () => {
    expect(isChatCapableRepo(summaryRaw({ tags: ['safetensors'] }))).toBe(false)
  })

  it('rejects embedding models by pipeline tag', () => {
    expect(
      isChatCapableRepo(
        summaryRaw({
          id: 'mixedbread-ai/mxbai-embed-large-v1',
          pipeline_tag: 'feature-extraction'
        })
      )
    ).toBe(false)
  })

  it('rejects embedding models that only declare the tag', () => {
    expect(
      isChatCapableRepo(
        summaryRaw({
          id: 'ggml-org/some-model-GGUF',
          pipeline_tag: undefined,
          tags: ['gguf', 'sentence-similarity']
        })
      )
    ).toBe(false)
  })

  it('rejects by name even when the pipeline tag looks fine', () => {
    expect(
      isChatCapableRepo(summaryRaw({ id: 'ggml-org/embeddinggemma-300M-GGUF' }))
    ).toBe(false)
    expect(isChatCapableRepo(summaryRaw({ id: 'someone/bge-reranker-GGUF' }))).toBe(false)
  })

  it('accepts vision-chat repos published as image-text-to-text', () => {
    expect(
      isChatCapableRepo(
        summaryRaw({
          id: 'unsloth/Qwen3.5-4B-GGUF',
          pipeline_tag: 'image-text-to-text',
          tags: ['gguf', 'image-text-to-text', 'conversational']
        })
      )
    ).toBe(true)
  })

  it('rejects private or disabled repos', () => {
    expect(isChatCapableRepo(summaryRaw({ private: true }))).toBe(false)
    expect(isChatCapableRepo(summaryRaw({ disabled: true }))).toBe(false)
  })
})

describe('parseQuantLabel', () => {
  it.each([
    ['Llama-3.2-3B-Instruct-Q4_K_M.gguf', 'Q4_K_M'],
    ['Llama-3.2-3B-Instruct-IQ4_XS.gguf', 'IQ4_XS'],
    ['Meta-Llama-3.1-8B-Instruct-Q8_0.gguf', 'Q8_0'],
    ['model.f16.gguf', 'F16'],
    ['Qwen2.5-7B-Instruct-Q3_K_L.gguf', 'Q3_K_L']
  ])('parses %s', (filename, expected) => {
    expect(parseQuantLabel(filename)).toBe(expected)
  })

  it('returns null when no quant token is present', () => {
    expect(parseQuantLabel('tokenizer.gguf')).toBeNull()
  })
})

describe('normalizeQuant', () => {
  it('maps labels onto the supported union', () => {
    expect(normalizeQuant('Q4_K_M')).toBe('Q4_K_M')
    expect(normalizeQuant('Q4_K_S')).toBe('Q4_K_M')
    expect(normalizeQuant('Q8_0')).toBe('Q8_0')
    expect(normalizeQuant('BF16')).toBe('FP16')
    expect(normalizeQuant('IQ4_XS')).toBe('Q4_0')
  })
})

describe('parseParamsFromRepoName', () => {
  it('reads the parameter count from the repo name', () => {
    expect(parseParamsFromRepoName('bartowski/Llama-3.2-3B-Instruct-GGUF')).toBe(3)
    expect(parseParamsFromRepoName('org/Qwen2.5-72B-Instruct-GGUF')).toBe(72)
    expect(parseParamsFromRepoName('ggml-org/embeddinggemma-300M-GGUF')).toBe(0.3)
  })

  it('returns null when there is no size token', () => {
    expect(parseParamsFromRepoName('org/mystery-model-GGUF')).toBeNull()
  })
})

describe('deriveParameterBillions', () => {
  it('prefers the exact gguf total from the API', () => {
    expect(
      deriveParameterBillions('bartowski/Llama-3.2-3B-Instruct-GGUF', { total: 3212749888 })
    ).toBe(3.213)
  })

  it('falls back to the repo name when metadata is missing', () => {
    expect(deriveParameterBillions('bartowski/Llama-3.2-3B-Instruct-GGUF', undefined)).toBe(3)
  })

  it('distrusts metadata that contradicts the repo name', () => {
    expect(deriveParameterBillions('prism-ml/Bonsai-27B-gguf', { total: 3646000000 })).toBe(27)
  })

  it('keeps metadata that broadly agrees with the repo name', () => {
    expect(deriveParameterBillions('org/Qwen2.5-7B-GGUF', { total: 7616000000 })).toBe(7.616)
  })
})

describe('reconcileParams', () => {
  const variant = {
    quantization: 'Q4_K_M' as const,
    quantLabel: 'Q4_K_M',
    filename: 'a-Q4_K_M.gguf',
    url: 'https://example.invalid/a.gguf',
    fileSizeBytes: 1.79e9
  }

  it('prefers the file size when the declared size cannot explain it', () => {
    expect(reconcileParams(27, variant)).toBeLessThan(5)
  })

  it('keeps the declared size when the file size is consistent', () => {
    expect(reconcileParams(3, variant)).toBe(3)
  })
})

describe('estimateRamGB', () => {
  it('leaves headroom above the weights', () => {
    const ram = estimateRamGB(2.02e9, 8192)
    expect(ram.required).toBeGreaterThan(2.02)
    expect(ram.recommended).toBeGreaterThan(ram.required)
  })

  it('does not let a huge advertised context explode the estimate', () => {
    const huge = estimateRamGB(2.02e9, 1_000_000)
    const normal = estimateRamGB(2.02e9, 8192)
    expect(huge.required).toBe(normal.required)
  })

  it('scales with file size', () => {
    expect(estimateRamGB(40e9, 4096).required).toBeGreaterThan(estimateRamGB(2e9, 4096).required)
  })
})

describe('estimateParamsFromBytes', () => {
  it('approximates parameter count from a quantized file size', () => {
    expect(estimateParamsFromBytes(2.02e9, 'Q4_K_M')).toBeCloseTo(3.4, 1)
    expect(estimateParamsFromBytes(4.9e9, 'Q4_K_M')).toBeCloseTo(8.2, 1)
  })
})

describe('selectQuantVariants', () => {
  const repoId = 'bartowski/Llama-3.2-3B-Instruct-GGUF'

  it('builds resolve urls and keeps one entry per quant', () => {
    const entries: HFTreeEntryRaw[] = [
      { path: '.gitattributes', size: 2842 },
      { path: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', lfs: { size: 2019377696 } },
      { path: 'Llama-3.2-3B-Instruct-Q8_0.gguf', lfs: { size: 3421899296 } }
    ]
    const variants = selectQuantVariants(repoId, entries)
    expect(variants).toHaveLength(2)
    expect(variants[0].quantLabel).toBe('Q4_K_M')
    expect(variants[0].url).toBe(
      `https://huggingface.co/${repoId}/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf`
    )
    expect(variants[0].fileSizeBytes).toBe(2019377696)
  })

  it('skips sharded and projector files the engine cannot load directly', () => {
    const entries: HFTreeEntryRaw[] = [
      { path: 'model-Q4_K_M-00001-of-00002.gguf', lfs: { size: 1e9 } },
      { path: 'mmproj-model-f16.gguf', lfs: { size: 1e8 } },
      { path: 'model-Q4_K_M.gguf', lfs: { size: 2e9 } }
    ]
    const variants = selectQuantVariants(repoId, entries)
    expect(variants.map((v) => v.filename)).toEqual(['model-Q4_K_M.gguf'])
  })

  it('skips files with no usable size', () => {
    const entries: HFTreeEntryRaw[] = [{ path: 'model-Q4_K_M.gguf', lfs: null }]
    expect(selectQuantVariants(repoId, entries)).toHaveLength(0)
  })

  it('orders by quant preference, not alphabetically', () => {
    const entries: HFTreeEntryRaw[] = [
      { path: 'm-Q8_0.gguf', lfs: { size: 3e9 } },
      { path: 'm-Q4_K_M.gguf', lfs: { size: 2e9 } },
      { path: 'm-Q6_K.gguf', lfs: { size: 2.5e9 } }
    ]
    expect(selectQuantVariants(repoId, entries).map((v) => v.quantLabel)).toEqual([
      'Q4_K_M',
      'Q6_K',
      'Q8_0'
    ])
  })
})

describe('deriveSummary', () => {
  it('splits author and name and flags gated repos', () => {
    const s = deriveSummary(summaryRaw({ gated: 'auto' }))
    expect(s.author).toBe('bartowski')
    expect(s.name).toBe('Llama 3.2 3B Instruct')
    expect(s.gated).toBe(true)
  })
})

describe('prettifyRepoName', () => {
  it('drops the GGUF suffix and separators', () => {
    expect(prettifyRepoName('Llama-3.2-3B-Instruct-GGUF')).toBe('Llama 3.2 3B Instruct')
  })
})

describe('deriveUseCases', () => {
  it('always includes chat and adds detected specialties', () => {
    expect(deriveUseCases('org/Qwen2.5-Coder-7B-GGUF')).toContain('code')
    expect(deriveUseCases('org/DeepSeek-R1-Distill-Qwen-7B-GGUF')).toContain('reasoning')
    expect(deriveUseCases('org/Llama-3.2-3B-Instruct-GGUF')).toEqual(['chat'])
  })
})

describe('buildCookbookModels', () => {
  const summary = deriveSummary(summaryRaw())

  it('produces one catalog entry per quant with a download url', () => {
    const models = buildCookbookModels(summary, {
      repoId: summary.repoId,
      parameterBillions: 3.213,
      contextLength: 131072,
      architecture: 'llama',
      variants: [
        {
          quantization: 'Q4_K_M',
          quantLabel: 'Q4_K_M',
          filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
          url: 'https://huggingface.co/x/resolve/main/a.gguf',
          fileSizeBytes: 2019377696
        }
      ]
    })

    expect(models).toHaveLength(1)
    expect(models[0].id).toBe('hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M')
    expect(models[0].family).toBe('llama')
    expect(models[0].sizeTier).toBe('small')
    expect(models[0].ggufUrl).toBeTruthy()
    expect(models[0].ggufFilename).toBe('Llama-3.2-3B-Instruct-Q4_K_M.gguf')
    expect(models[0].ollamaTag).toBe('')
    expect(models[0].ramRequiredGB).toBeGreaterThan(models[0].diskSizeGB)
  })

  it('estimates parameters per variant when metadata is missing', () => {
    const models = buildCookbookModels(summary, {
      repoId: summary.repoId,
      parameterBillions: 0,
      contextLength: null,
      architecture: null,
      variants: [
        {
          quantization: 'Q4_K_M',
          quantLabel: 'Q4_K_M',
          filename: 'a-Q4_K_M.gguf',
          url: 'https://huggingface.co/x/resolve/main/a.gguf',
          fileSizeBytes: 4.9e9
        }
      ]
    })
    expect(models[0].parameterBillions).toBeGreaterThan(7)
    expect(models[0].sizeTier).toBe('small')
  })
})
