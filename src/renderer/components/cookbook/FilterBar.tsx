import React from 'react'
import { useCookbookStore } from '../../stores/cookbookStore'
import { Search, X, RotateCcw } from 'lucide-react'
import { MODEL_CATALOG } from '../../../shared/model-catalog'
import {
  catalogFacets,
  availableOptions,
  hasActiveFilters,
  USE_CASE_OPTIONS,
  FAMILY_OPTIONS,
  SIZE_TIER_OPTIONS,
  QUANTIZATION_OPTIONS
} from '../../../shared/model-filter'

const facets = catalogFacets(MODEL_CATALOG)
const useCaseOptions = availableOptions(USE_CASE_OPTIONS, facets.useCases)
const familyOptions = availableOptions(FAMILY_OPTIONS, facets.families)
const sizeTierOptions = availableOptions(SIZE_TIER_OPTIONS, facets.sizeTiers)
const quantizationOptions = availableOptions(QUANTIZATION_OPTIONS, facets.quantizations)

export const FilterBar: React.FC = () => {
  const {
    filters,
    sortBy,
    searchQuery,
    systemInfo,
    loadingInfo,
    scanError,
    setFilter,
    toggleFilterValue,
    resetFilters,
    setSort,
    setSearch
  } = useCookbookStore()

  const active = hasActiveFilters(filters, searchQuery)
  const isCompatDisabled = systemInfo === null

  let compatHint: string | null = null
  if (isCompatDisabled) {
    if (loadingInfo) {
      compatHint = 'Checking your hardware…'
    } else if (scanError) {
      compatHint = 'Hardware scan failed - rescan to filter by fit.'
    } else {
      compatHint = 'Scan your hardware to filter by fit.'
    }
  }

  return (
    <div className="cookbook-filter-bar animate-fade-in">
      {/* Search and Sort */}
      <div className="filter-row main-row">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, family, description, or tag…"
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

        {active && (
          <button onClick={resetFilters} className="reset-btn" title="Reset all filters">
            <RotateCcw size={14} />
            Reset
          </button>
        )}
      </div>

      {/* Advanced Filters */}
      <div className="filter-row advanced-row">
        <div className="filter-section">
          <span className="filter-label">Use Case</span>
          <div className="chips-container">
            {useCaseOptions.map((uc) => {
              const isActive = filters.useCases.includes(uc.id)
              return (
                <button
                  key={uc.id}
                  onClick={() => toggleFilterValue('useCases', uc.id)}
                  className={`filter-chip ${isActive ? 'active' : ''}`}
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
            {familyOptions.map((fam) => {
              const isActive = filters.families.includes(fam.id)
              return (
                <button
                  key={fam.id}
                  onClick={() => toggleFilterValue('families', fam.id)}
                  className={`filter-chip ${isActive ? 'active' : ''}`}
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
            {sizeTierOptions.map((tier) => {
              const isActive = filters.sizeTiers.includes(tier.id)
              return (
                <button
                  key={tier.id}
                  onClick={() => toggleFilterValue('sizeTiers', tier.id)}
                  className={`filter-chip ${isActive ? 'active' : ''}`}
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
              {quantizationOptions.map((quant) => {
                const isActive = filters.quantizations.includes(quant.id)
                return (
                  <button
                    key={quant.id}
                    onClick={() => toggleFilterValue('quantizations', quant.id)}
                    className={`filter-chip ${isActive ? 'active' : ''}`}
                  >
                    {quant.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
            <label className={`toggle-label ${isCompatDisabled ? 'is-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={filters.compatibleOnly}
                disabled={isCompatDisabled}
                onChange={(e) => setFilter('compatibleOnly', e.target.checked)}
                className="toggle-checkbox"
              />
              <span className="toggle-text">Hide models that won't fit</span>
            </label>
            {compatHint && <span className="toggle-hint">{compatHint}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
