import React from 'react'
import { useCookbookStore } from '../../stores/cookbookStore'
import { Search, X, Filter, RotateCcw } from 'lucide-react'
import { ModelUseCase, ModelFamily, ModelSizeTier, QuantizationType } from '../../../shared/types'

export const FilterBar: React.FC = () => {
  const {
    filters,
    sortBy,
    searchQuery,
    setFilter,
    resetFilters,
    setSort,
    setSearch
  } = useCookbookStore()

  const useCases: { id: ModelUseCase; label: string }[] = [
    { id: 'chat', label: 'Conversational' },
    { id: 'code', label: 'Coding' },
    { id: 'reasoning', label: 'Reasoning' },
    { id: 'vision', label: 'Vision' },
    { id: 'embedding', label: 'Embedding' },
    { id: 'creative', label: 'Creative' }
  ]

  const families: { id: ModelFamily; label: string }[] = [
    { id: 'llama', label: 'Llama' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'qwen', label: 'Qwen' },
    { id: 'gemma', label: 'Gemma' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'phi', label: 'Phi' }
  ]

  const sizeTiers: { id: ModelSizeTier; label: string }[] = [
    { id: 'tiny', label: 'Tiny (<3B)' },
    { id: 'small', label: 'Small (3B-9B)' },
    { id: 'medium', label: 'Medium (10B-15B)' },
    { id: 'large', label: 'Large (16B-35B)' },
    { id: 'xl', label: 'XL (36B+)' }
  ]

  const quantizations: QuantizationType[] = ['Q4_0', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0', 'FP16']

  const toggleFilter = <T extends string>(
    key: 'useCases' | 'families' | 'sizeTiers' | 'quantizations',
    value: T
  ) => {
    const list = filters[key] as string[]
    if (list.includes(value)) {
      setFilter(key, list.filter(item => item !== value) as any)
    } else {
      setFilter(key, [...list, value] as any)
    }
  }

  const hasActiveFilters =
    filters.useCases.length > 0 ||
    filters.families.length > 0 ||
    filters.sizeTiers.length > 0 ||
    filters.quantizations.length > 0 ||
    filters.compatibleOnly ||
    searchQuery.trim().length > 0

  return (
    <div className="cookbook-filter-bar animate-fade-in">
      {/* Search and Sort */}
      <div className="filter-row main-row">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search catalog by model name or family..."
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button onClick={() => setSearch('')} className="clear-search-btn">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="sort-wrapper">
          <label htmlFor="sort-select">Sort by:</label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => setSort(e.target.value as any)}
            className="sort-select"
          >
            <option value="compatibility">Compatibility Fit</option>
            <option value="size">Parameter Size</option>
            <option value="name">Name (A-Z)</option>
            <option value="family">Model Family</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button onClick={resetFilters} className="reset-btn" title="Reset all filters">
            <RotateCcw size={14} />
            Reset
          </button>
        )}
      </div>

      {/* Advanced Filters */}
      <div className="filter-row advanced-row">
        <div className="filter-section">
          <span className="filter-label"><Filter size={12} /> Use Case</span>
          <div className="chips-container">
            {useCases.map(uc => {
              const active = filters.useCases.includes(uc.id)
              return (
                <button
                  key={uc.id}
                  onClick={() => toggleFilter('useCases', uc.id)}
                  className={`filter-chip ${active ? 'active' : ''}`}
                >
                  {uc.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="filter-section">
          <span className="filter-label">Family</span>
          <div className="chips-container">
            {families.map(fam => {
              const active = filters.families.includes(fam.id)
              return (
                <button
                  key={fam.id}
                  onClick={() => toggleFilter('families', fam.id)}
                  className={`filter-chip ${active ? 'active' : ''}`}
                >
                  {fam.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="filter-section">
          <span className="filter-label">Size</span>
          <div className="chips-container">
            {sizeTiers.map(tier => {
              const active = filters.sizeTiers.includes(tier.id)
              return (
                <button
                  key={tier.id}
                  onClick={() => toggleFilter('sizeTiers', tier.id)}
                  className={`filter-chip ${active ? 'active' : ''}`}
                >
                  {tier.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="filter-row-sub">
          <div className="filter-section">
            <span className="filter-label">Quant</span>
            <div className="chips-container">
              {quantizations.map(quant => {
                const active = filters.quantizations.includes(quant)
                return (
                  <button
                    key={quant}
                    onClick={() => toggleFilter('quantizations', quant)}
                    className={`filter-chip ${active ? 'active' : ''}`}
                  >
                    {quant}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={filters.compatibleOnly}
              onChange={(e) => setFilter('compatibleOnly', e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-text">Show compatible only</span>
          </label>
        </div>
      </div>
    </div>
  )
}
