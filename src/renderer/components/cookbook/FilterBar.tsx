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
import { Tooltip } from '../chat/Tooltip'

const facets = catalogFacets(MODEL_CATALOG)
const useCaseOptions = availableOptions(USE_CASE_OPTIONS, facets.useCases)
const familyOptions = availableOptions(FAMILY_OPTIONS, facets.families)
const sizeTierOptions = availableOptions(SIZE_TIER_OPTIONS, facets.sizeTiers)
const quantizationOptions = availableOptions(QUANTIZATION_OPTIONS, facets.quantizations)

const SECTION_HINTS = {
  useCase: 'What you want the model to be good at. Picking several widens the results.',
  family: 'Who built the model. Families share a training recipe, so they tend to behave alike.',
  size: 'Roughly how many parameters the model has. Bigger means smarter but heavier on RAM.',
  quant: 'How much the weights are compressed. Lower bits = smaller download and less RAM, at some cost in quality.'
} as const

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
          <Tooltip
            label="Compatibility Fit puts the models your machine runs best at the top."
            multiline
            maxWidth={240}
            position="top"
          >
            <label htmlFor="sort-select">Sort by:</label>
          </Tooltip>
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
          <Tooltip label={SECTION_HINTS.useCase} multiline maxWidth={260} position="top">
            <span className="filter-label">Use Case</span>
          </Tooltip>
          <div className="chips-container">
            {useCaseOptions.map((uc) => {
              const isActive = filters.useCases.includes(uc.id)
              return (
                <Tooltip key={uc.id} label={uc.hint ?? uc.label} multiline maxWidth={240}>
                  <button
                    onClick={() => toggleFilterValue('useCases', uc.id)}
                    className={`filter-chip ${isActive ? 'active' : ''}`}
                  >
                    {uc.label}
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </div>

        <div className="filter-section">
          <Tooltip label={SECTION_HINTS.family} multiline maxWidth={260} position="top">
            <span className="filter-label">Family</span>
          </Tooltip>
          <div className="chips-container">
            {familyOptions.map((fam) => {
              const isActive = filters.families.includes(fam.id)
              return (
                <Tooltip key={fam.id} label={fam.hint ?? fam.label} multiline maxWidth={240}>
                  <button
                    onClick={() => toggleFilterValue('families', fam.id)}
                    className={`filter-chip ${isActive ? 'active' : ''}`}
                  >
                    {fam.label}
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </div>

        <div className="filter-section">
          <Tooltip label={SECTION_HINTS.size} multiline maxWidth={260} position="top">
            <span className="filter-label">Size</span>
          </Tooltip>
          <div className="chips-container">
            {sizeTierOptions.map((tier) => {
              const isActive = filters.sizeTiers.includes(tier.id)
              return (
                <Tooltip key={tier.id} label={tier.hint ?? tier.label} multiline maxWidth={240}>
                  <button
                    onClick={() => toggleFilterValue('sizeTiers', tier.id)}
                    className={`filter-chip ${isActive ? 'active' : ''}`}
                  >
                    {tier.label}
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </div>

        <div className="filter-row-sub">
          <div className="filter-section">
            <Tooltip label={SECTION_HINTS.quant} multiline maxWidth={260} position="top">
              <span className="filter-label">Quant</span>
            </Tooltip>
            <div className="chips-container">
              {quantizationOptions.map((quant) => {
                const isActive = filters.quantizations.includes(quant.id)
                return (
                  <Tooltip key={quant.id} label={quant.hint ?? quant.label} multiline maxWidth={250}>
                    <button
                      onClick={() => toggleFilterValue('quantizations', quant.id)}
                      className={`filter-chip ${isActive ? 'active' : ''}`}
                    >
                      {quant.label}
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
            <Tooltip
              label={
                compatHint ??
                "Hides models that need more RAM than this machine has, so you only see ones you can actually run."
              }
              multiline
              maxWidth={250}
              position="top"
            >
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
            </Tooltip>
            {compatHint && <span className="toggle-hint">{compatHint}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
