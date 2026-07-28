import React, { useEffect } from 'react'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useEngineStore } from '../../stores/engineStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { EngineStatusBadge } from '../common/EngineStatusBadge'
import { HardwareCard } from './HardwareCard'
import { FilterBar } from './FilterBar'
import { ModelCard } from './ModelCard'
import { InstalledModelCard } from './InstalledModelCard'
import { HuggingFaceBrowser } from './HuggingFaceBrowser'
import { MODEL_CATALOG } from '../../../shared/model-catalog'
import { getCompatibility } from '../../../shared/compatibility'
import { CookbookModel } from '../../../shared/types'
import { Info, HardDrive } from 'lucide-react'

export const CookbookView: React.FC = () => {
  const {
    systemInfo,
    loadingInfo,
    scanError,
    detailedInstalledModels,
    filters,
    sortBy,
    searchQuery,
    scanHardware
  } = useCookbookStore()

  const { engineState, localModels, setupListeners, installEngine, reinstallEngine, startEngine, stopEngine, isInstallingBinary } = useEngineStore()
  const { settings, fetchSettings } = useSettingsStore()

  useEffect(() => {
    fetchSettings()
    scanHardware()
    const unsubEngine = setupListeners()
    return () => {
      unsubEngine()
    }
  }, [])

  const isEngineDownloaded = (model: CookbookModel) =>
    !!(model.ggufFilename && localModels.some((lm) => lm.filename === model.ggufFilename))

  const filteredModels = MODEL_CATALOG.filter(model => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = model.name.toLowerCase().includes(q)
      const matchDesc = model.description.toLowerCase().includes(q)
      const matchFam = model.family.toLowerCase().includes(q)
      const matchTag = model.ollamaTag.toLowerCase().includes(q)
      if (!matchName && !matchDesc && !matchFam && !matchTag) return false
    }

    if (filters.useCases.length > 0) {
      const hasOverlap = model.useCases.some(uc => filters.useCases.includes(uc))
      if (!hasOverlap) return false
    }

    if (filters.families.length > 0) {
      if (!filters.families.includes(model.family)) return false
    }

    if (filters.sizeTiers.length > 0) {
      if (!filters.sizeTiers.includes(model.sizeTier)) return false
    }

    if (filters.quantizations.length > 0) {
      if (!filters.quantizations.includes(model.quantization)) return false
    }

    if (filters.compatibleOnly && systemInfo) {
      const comp = getCompatibility(systemInfo, model)
      if (comp === 'wont_fit') return false
    }

    return true
  })

  const sortedModels = [...filteredModels].sort((a, b) => {
    const aDownloaded = isEngineDownloaded(a) ? 1 : 0
    const bDownloaded = isEngineDownloaded(b) ? 1 : 0
    if (aDownloaded !== bDownloaded) {
      return bDownloaded - aDownloaded
    }

    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'size') return a.parameterBillions - b.parameterBillions
    if (sortBy === 'family') return a.family.localeCompare(b.family)

    if (sortBy === 'compatibility') {
      const aComp = getCompatibility(systemInfo, a)
      const bComp = getCompatibility(systemInfo, b)
      const weights = { great: 4, runs: 3, tight: 2, wont_fit: 1 }
      const aWeight = weights[aComp] || 0
      const bWeight = weights[bComp] || 0
      if (aWeight !== bWeight) return bWeight - aWeight
      return a.parameterBillions - b.parameterBillions
    }

    return 0
  })

  const filteredInstalledLocal = detailedInstalledModels.filter((m) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      m.name.toLowerCase().includes(q) ||
      m.tag.toLowerCase().includes(q) ||
      (m.family && m.family.toLowerCase().includes(q)) ||
      (m.providerName && m.providerName.toLowerCase().includes(q))
    )
  })

  return (
    <div className="cookbook-container animate-fade-in">
      <div className="cookbook-scrollable">
        <div className="cookbook-header-title">
          <div>
            <h1>Hardware Cookbook</h1>
            <p>Scan your device specs, verify compatibility, and download optimized local LLMs directly to your system.</p>
          </div>
        </div>

        <HardwareCard
          systemInfo={systemInfo}
          loading={loadingInfo}
          scanError={scanError}
          onRescan={scanHardware}
        />

        {settings?.engineEnabled !== false && (localModels.length > 0 || isInstallingBinary) && (
          <EngineStatusBadge
            engineState={engineState}
            isInstallingBinary={isInstallingBinary}
            onInstall={installEngine}
            onReinstall={reinstallEngine}
            onStart={startEngine}
            onStop={stopEngine}
            style={{ marginBottom: '16px' }}
          />
        )}

        <FilterBar />

        {detailedInstalledModels.length > 0 && (
          <div className="catalog-section installed-models-section">
            <div className="catalog-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={18} style={{ color: '#98c379' }} />
                <h2 style={{ margin: 0 }}>Your Installed Local Models</h2>
              </div>
              <span className="results-count">
                {filteredInstalledLocal.length} local model{filteredInstalledLocal.length === 1 ? '' : 's'} available
              </span>
            </div>

            {filteredInstalledLocal.length > 0 ? (
              <div className="installed-models-grid">
                {filteredInstalledLocal.map((m) => (
                  <InstalledModelCard key={m.id} model={m} />
                ))}
              </div>
            ) : (
              <div className="empty-catalog-state small-empty" style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                  No installed local models match your current filters.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="catalog-section">
          <div className="catalog-header">
            <h2>Recommended Models</h2>
            <span className="results-count">
              Showing {sortedModels.length} of {MODEL_CATALOG.length} models
            </span>
          </div>

          {sortedModels.length > 0 ? (
            <div className="catalog-grid">
              {sortedModels.map(model => (
                <ModelCard
                  key={model.id}
                  model={model}
                  systemInfo={systemInfo}
                  isInstalled={isEngineDownloaded(model)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-catalog-state">
              <Info size={36} className="empty-icon" />
              <h3>No Models Found</h3>
              <p>Try clearing some filters or searching for another term.</p>
            </div>
          )}
        </div>

        <HuggingFaceBrowser systemInfo={systemInfo} />
      </div>
    </div>
  )
}
