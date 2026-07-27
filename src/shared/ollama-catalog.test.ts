import { describe, it, expect } from 'vitest'
import {
  deriveCatalogEntry,
  deriveUseCases,
  estimateRamGB,
  mapFamily,
  mapQuantization,
  mergeCatalog,
  parseParameterBillions,
  sizeTierFor,
  OllamaLibraryModel,
  OllamaLibraryTag
} from './ollama-catalog'
import { CookbookModel } from './types'
import { normalizeOllamaTag } from './ollama-tags'

const qwen3: OllamaLibraryModel = {
  name: 'qwen3',
  description:
    'Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.',
  capabilities: ['tools', 'thinking']
}

const qwen3_8b: OllamaLibraryTag = {
  tag: '8b',
  modelType: '8.2B',
  fileType: 'Q4_K_M',
  sizeBytes: 5225374496,
  modelFamily: 'qwen3',
  contextLabel: '40K',
  inputs: ['Text']
}

describe('parseParameterBillions', () => {
  it('reads billions, millions and thousands', () => {
    expect(parseParameterBillions('8.2B')).toBe(8.2)
    expect(parseParameterBillions('671.0B')).toBe(671)
    expect(parseParameterBillions('137M')).toBe(0.137)
    expect(parseParameterBillions('22.7m')).toBe(0.023)
  })

  it('defaults a bare number to billions', () => {
    expect(parseParameterBillions('7')).toBe(7)
  })

  it('rejects unparseable or non-positive values', () => {
    expect(parseParameterBillions('unknown')).toBeNull()
    expect(parseParameterBillions('')).toBeNull()
    expect(parseParameterBillions('0B')).toBeNull()
  })
})

describe('sizeTierFor', () => {
  it('matches the tiers the curated catalog uses', () => {
    expect(sizeTierFor(1.2)).toBe('tiny')
    expect(sizeTierFor(2.6)).toBe('tiny')
    expect(sizeTierFor(3.2)).toBe('small')
    expect(sizeTierFor(9)).toBe('small')
    expect(sizeTierFor(14)).toBe('medium')
    expect(sizeTierFor(46.7)).toBe('large')
    expect(sizeTierFor(70)).toBe('xl')
    expect(sizeTierFor(235)).toBe('xxl')
    expect(sizeTierFor(400)).toBe('xxl')
    expect(sizeTierFor(1000)).toBe('datacenter')
  })
})

describe('mapQuantization', () => {
  it('keeps exact matches', () => {
    expect(mapQuantization('Q4_K_M')).toBe('Q4_K_M')
    expect(mapQuantization('Q8_0')).toBe('Q8_0')
    expect(mapQuantization('Q6_K')).toBe('Q6_K')
  })

  it('rounds unlisted types onto the nearest listed one', () => {
    expect(mapQuantization('Q4_K_S')).toBe('Q4_K_M')
    expect(mapQuantization('Q5_K_S')).toBe('Q5_K_M')
    expect(mapQuantization('Q3_K_L')).toBe('Q4_0')
    expect(mapQuantization('IQ2_XXS')).toBe('Q4_0')
    expect(mapQuantization('F16')).toBe('FP16')
    expect(mapQuantization('BF16')).toBe('FP16')
  })

  it('falls back to Q4_K_M for unknown types', () => {
    expect(mapQuantization('MXFP4')).toBe('Q4_K_M')
    expect(mapQuantization('')).toBe('Q4_K_M')
  })
})

describe('mapFamily', () => {
  it('prefers the more specific family', () => {
    expect(mapFamily('codellama')).toBe('codellama')
    expect(mapFamily('deepseek-r1')).toBe('deepseek')
    expect(mapFamily('devstral')).toBe('devstral')
    expect(mapFamily('codegemma')).toBe('gemma')
  })

  it('falls back to the registry family, then to other', () => {
    expect(mapFamily('nous-hermes2', 'llama')).toBe('hermes')
    expect(mapFamily('some-new-model', 'qwen2')).toBe('qwen')
    expect(mapFamily('totally-unknown')).toBe('other')
  })

  it('does not treat an embedded "yi" as the Yi family', () => {
    expect(mapFamily('bespoke-minicheck')).toBe('other')
  })
})

describe('deriveUseCases', () => {
  it('maps capability chips onto use cases', () => {
    expect(deriveUseCases(qwen3)).toEqual(['chat', 'reasoning', 'agentic'])
    expect(deriveUseCases({ name: 'llava', description: '', capabilities: ['vision'] })).toEqual([
      'chat',
      'vision'
    ])
  })

  it('marks embedding models as embedding only', () => {
    expect(
      deriveUseCases({ name: 'nomic-embed-text', description: '', capabilities: ['embedding'] })
    ).toEqual(['embedding'])
  })

  it('infers code from the name or description', () => {
    expect(
      deriveUseCases({ name: 'qwen2.5-coder', description: '', capabilities: [] })
    ).toContain('code')
  })
})

describe('estimateRamGB', () => {
  it('stays at or above the download size', () => {
    for (const disk of [0.5, 1.3, 4.7, 19.9, 42.5, 404.4]) {
      const { required, recommended } = estimateRamGB(disk)
      expect(required).toBeGreaterThan(disk)
      expect(recommended).toBeGreaterThan(required)
    }
  })

  it('lands close to the curated hand-tuned numbers', () => {
    expect(estimateRamGB(4.7).required).toBeCloseTo(5.4, 1)
    expect(estimateRamGB(42).required).toBeCloseTo(44.6, 1)
  })
})

describe('deriveCatalogEntry', () => {
  it('builds a full catalog entry', () => {
    const entry = deriveCatalogEntry(qwen3, qwen3_8b)
    expect(entry).toEqual({
      id: 'qwen3:8b-q4_k_m',
      name: 'Qwen3 8B (Q4_K_M)',
      family: 'qwen',
      parameterBillions: 8.2,
      sizeTier: 'small',
      quantization: 'Q4_K_M',
      useCases: ['chat', 'reasoning', 'agentic'],
      ramRequiredGB: 6,
      ramRecommendedGB: 7.5,
      diskSizeGB: 5.2,
      ollamaTag: 'qwen3:8b',
      description: qwen3.description,
      highlights: ['40K context window', 'Tool calling', 'Reasoning / thinking mode', '5.2 GB download']
    })
  })

  it('omits the tag suffix for latest', () => {
    const entry = deriveCatalogEntry(qwen3, { ...qwen3_8b, tag: 'latest' })
    expect(entry?.name).toBe('Qwen3 (Q4_K_M)')
    expect(entry?.ollamaTag).toBe('qwen3:latest')
  })

  it('leaves GGUF fields unset — the registry has no direct download', () => {
    const entry = deriveCatalogEntry(qwen3, qwen3_8b)
    expect(entry?.ggufUrl).toBeUndefined()
    expect(entry?.ggufFilename).toBeUndefined()
  })

  it('returns null on unusable registry data', () => {
    expect(deriveCatalogEntry(qwen3, { ...qwen3_8b, modelType: '?' })).toBeNull()
    expect(deriveCatalogEntry(qwen3, { ...qwen3_8b, sizeBytes: 0 })).toBeNull()
  })

  it('truncates long descriptions at a sentence boundary', () => {
    const entry = deriveCatalogEntry(
      {
        ...qwen3,
        description: `${'A capable model. '.repeat(20)}`
      },
      qwen3_8b
    )
    expect(entry!.description.length).toBeLessThanOrEqual(220)
    expect(entry!.description.endsWith('.')).toBe(true)
  })
})

describe('mergeCatalog', () => {
  const curated: CookbookModel = {
    id: 'qwen3:8b-q4',
    name: 'Qwen3 8B (Q4_K_M)',
    family: 'qwen',
    parameterBillions: 8.2,
    sizeTier: 'small',
    quantization: 'Q4_K_M',
    useCases: ['chat'],
    ramRequiredGB: 6,
    ramRecommendedGB: 8,
    diskSizeGB: 5.2,
    ollamaTag: 'qwen3:8b',
    ggufUrl: 'https://example.invalid/qwen3.gguf',
    description: 'Hand written.',
    highlights: ['Curated']
  }

  it('drops generated entries that duplicate a curated Ollama tag', () => {
    const generated = deriveCatalogEntry(qwen3, qwen3_8b)!
    const merged = mergeCatalog([curated], [generated])
    expect(merged).toEqual([curated])
  })

  it('treats a tagless curated tag as :latest', () => {
    const merged = mergeCatalog(
      [{ ...curated, ollamaTag: 'qwen3' }],
      [deriveCatalogEntry(qwen3, { ...qwen3_8b, tag: 'latest' })!]
    )
    expect(merged).toHaveLength(1)
  })

  it('keeps generated entries the curated list does not cover', () => {
    const generated = deriveCatalogEntry(qwen3, { ...qwen3_8b, tag: '14b', modelType: '14.8B' })!
    const merged = mergeCatalog([curated], [generated])
    expect(merged.map((m) => m.id)).toEqual([curated.id, generated.id])
  })

  it('deduplicates within the generated list', () => {
    const generated = deriveCatalogEntry(qwen3, qwen3_8b)!
    const merged = mergeCatalog([], [generated, { ...generated }])
    expect(merged).toHaveLength(1)
  })
})

describe('MODEL_CATALOG', () => {
  it('has unique ids and unique Ollama tags after the merge', async () => {
    const { MODEL_CATALOG } = await import('./model-catalog')
    const ids = MODEL_CATALOG.map((m) => m.id)
    const tags = MODEL_CATALOG.map((m) => normalizeOllamaTag(m.ollamaTag))
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(tags).size).toBe(tags.length)
  })

  it('never lists a model whose required RAM is below its download size', async () => {
    const { MODEL_CATALOG } = await import('./model-catalog')
    for (const model of MODEL_CATALOG) {
      expect(model.ramRecommendedGB).toBeGreaterThanOrEqual(model.ramRequiredGB)
    }
  })
})
