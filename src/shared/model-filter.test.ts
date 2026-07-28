import { describe, expect, it } from 'vitest'
import {
  EMPTY_MODEL_FILTERS,
  FAMILY_OPTIONS,
  SIZE_TIER_RANGES,
  catalogFacets,
  filterModels,
  hasActiveFilters,
  matchesModelFilters,
  matchesSearch
} from './model-filter'
import { sizeTierFor } from './model-taxonomy'
import { MODEL_CATALOG } from './model-catalog'
import { CookbookModel, SystemInfoFull } from './types'

const testModel: CookbookModel = {
  id: 'test-llama-8b',
  name: 'Llama 3.1 8B Instruct',
  family: 'llama',
  parameterBillions: 8.0,
  sizeTier: 'small',
  quantization: 'Q4_K_M',
  useCases: ['chat', 'code'],
  ramRequiredGB: 5.5,
  ramRecommendedGB: 8.0,
  diskSizeGB: 4.7,
  ollamaTag: 'llama3.1:8b',
  description: 'Meta state-of-the-art open model.',
  highlights: ['Meta model', 'Good all-rounder']
}

const testModel2: CookbookModel = {
  id: 'test-qwen-72b',
  name: 'Qwen 2.5 72B',
  family: 'qwen',
  parameterBillions: 72.0,
  sizeTier: 'xl',
  quantization: 'Q4_K_M',
  useCases: ['reasoning'],
  ramRequiredGB: 45.0,
  ramRecommendedGB: 64.0,
  diskSizeGB: 42.0,
  ollamaTag: 'qwen2.5:72b',
  description: 'Alibaba flagship reasoning model.',
  highlights: ['Reasoning powerhouse']
}

describe('model-filter', () => {
  describe('matchesSearch', () => {
    it('matches by name', () => {
      expect(matchesSearch(testModel, 'Llama 3.1')).toBe(true)
    })

    it('matches by description', () => {
      expect(matchesSearch(testModel, 'state-of-the-art')).toBe(true)
    })

    it('matches by family', () => {
      expect(matchesSearch(testModel, 'llama')).toBe(true)
    })

    it('matches by ollamaTag', () => {
      expect(matchesSearch(testModel, 'llama3.1:8b')).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(matchesSearch(testModel, 'LLAMA')).toBe(true)
    })

    it('treats whitespace-only query as a no-op', () => {
      expect(matchesSearch(testModel, '   ')).toBe(true)
    })

    it('returns false when query does not match', () => {
      expect(matchesSearch(testModel, 'nonexistent-term')).toBe(false)
    })
  })

  describe('matchesModelFilters', () => {
    it('passes everything with EMPTY_MODEL_FILTERS', () => {
      const ctx = { filters: EMPTY_MODEL_FILTERS, searchQuery: '', systemInfo: null }
      expect(matchesModelFilters(testModel, ctx)).toBe(true)
      expect(matchesModelFilters(testModel2, ctx)).toBe(true)
    })

    it('filters OR within a facet (useCases)', () => {
      const ctx = {
        filters: { ...EMPTY_MODEL_FILTERS, useCases: ['chat', 'reasoning'] as any },
        searchQuery: '',
        systemInfo: null
      }
      expect(matchesModelFilters(testModel, ctx)).toBe(true) // has 'chat'
      expect(matchesModelFilters(testModel2, ctx)).toBe(true) // has 'reasoning'
    })

    it('filters AND across two facets (useCases AND family)', () => {
      const ctx = {
        filters: {
          ...EMPTY_MODEL_FILTERS,
          useCases: ['reasoning'] as any,
          families: ['llama'] as any
        },
        searchQuery: '',
        systemInfo: null
      }
      expect(matchesModelFilters(testModel, ctx)).toBe(false) // family llama, but no reasoning
      expect(matchesModelFilters(testModel2, ctx)).toBe(false) // reasoning, but family qwen
    })

    it('compatibleOnly with systemInfo: null filters nothing', () => {
      const ctx = {
        filters: { ...EMPTY_MODEL_FILTERS, compatibleOnly: true },
        searchQuery: '',
        systemInfo: null
      }
      expect(matchesModelFilters(testModel, ctx)).toBe(true)
    })

    it('compatibleOnly with a small machine drops wont_fit and keeps tight', () => {
      // Machine with 16GB RAM: usableGB = 11.52GB.
      // testModel (8B, ramRequired: 5.5GB, kvCache: 0.48GB -> needGB: 5.98GB) fits easily -> runs/great
      // testModel2 (72B, ramRequired: 45GB) -> wont_fit
      const smallMachine: SystemInfoFull = {
        platform: 'darwin',
        arch: 'arm64',
        cpu: { model: 'Apple M1', cores: 8, threads: 8, speedGHz: 3.2 },
        ram: { totalGB: 16, freeGB: 8, usedPercent: 50 },
        gpu: { name: 'Apple M1', vramGB: 16, isAppleSilicon: true },
        disk: { readMBps: 2000, writeMBps: 2000, freeGB: 100, totalGB: 512 },
        thermals: { cpuTempC: 45 }
      }

      const ctx = {
        filters: { ...EMPTY_MODEL_FILTERS, compatibleOnly: true },
        searchQuery: '',
        systemInfo: smallMachine
      }

      expect(matchesModelFilters(testModel, ctx)).toBe(true)
      expect(matchesModelFilters(testModel2, ctx)).toBe(false)
    })

    it('explicitly verifies that tight compatibility survives compatibleOnly filter', () => {
      // Machine with 8GB RAM on Apple Silicon: usableGB = 5.0GB.
      // testModel: ramRequired: 5.5GB, parameterBillions: 8.0 -> kvCache: 0.48GB.
      // needGB = 5.98GB. needGB * 0.85 = 5.083GB.
      // If ramRequired is 4.8GB -> needGB = 5.28GB, needGB * 0.85 = 4.488GB.
      // 4.488GB <= 5.0GB < 5.28GB -> getCompatibility returns 'tight'.
      const tightModel: CookbookModel = {
        ...testModel,
        ramRequiredGB: 4.8,
        ramRecommendedGB: 7.0
      }

      const tightMachine: SystemInfoFull = {
        platform: 'darwin',
        arch: 'arm64',
        cpu: { model: 'Apple M1', cores: 8, threads: 8, speedGHz: 3.2 },
        ram: { totalGB: 8, freeGB: 3, usedPercent: 62.5 },
        gpu: { name: 'Apple M1', vramGB: 8, isAppleSilicon: true },
        disk: { readMBps: 2000, writeMBps: 2000, freeGB: 100, totalGB: 512 },
        thermals: { cpuTempC: 45 }
      }

      const ctx = {
        filters: { ...EMPTY_MODEL_FILTERS, compatibleOnly: true },
        searchQuery: '',
        systemInfo: tightMachine
      }

      expect(matchesModelFilters(tightModel, ctx)).toBe(true)
    })
  })

  describe('SIZE_TIER_RANGES vs sizeTierFor', () => {
    it('verifies boundary table consistency with sizeTierFor', () => {
      for (const row of SIZE_TIER_RANGES) {
        expect(sizeTierFor(row.minB)).toBe(row.id)
        if (row.maxB !== null) {
          expect(sizeTierFor(row.maxB - 0.01)).toBe(row.id)
          expect(sizeTierFor(row.maxB)).not.toBe(row.id)
        }
      }
    })
  })

  describe('catalogFacets & catalog options', () => {
    it('contains no datacenter and no embedding in MODEL_CATALOG facets', () => {
      const facets = catalogFacets(MODEL_CATALOG)
      expect(facets.sizeTiers.has('datacenter')).toBe(false)
      expect(facets.useCases.has('embedding')).toBe(false)
    })

    it('ensures every family present in MODEL_CATALOG has a chip in FAMILY_OPTIONS', () => {
      const facets = catalogFacets(MODEL_CATALOG)
      const optionFamilyIds = new Set(FAMILY_OPTIONS.map((f) => f.id))
      for (const family of facets.families) {
        expect(optionFamilyIds.has(family)).toBe(true)
      }
    })
  })
})
