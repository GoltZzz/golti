import React, { useEffect } from 'react'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useEngineStore } from '../../stores/engineStore'
import { HardwareCard } from './HardwareCard'
import { FilterBar } from './FilterBar'
import { ModelCard } from './ModelCard'
import { MODEL_CATALOG } from '../../../shared/model-catalog'
import { getCompatibility } from '../../../shared/compatibility'
import { findInstalledOllamaTag, isOllamaTagInstalled } from '../../../shared/ollama-tags'
import { CookbookModel } from '../../../shared/types'
import { AlertCircle, ExternalLink, Info, Terminal, Zap, CheckCircle2 } from 'lucide-react'

export const CookbookView: React.FC = () => {
  const {
    systemInfo,
    loadingInfo,
    scanError,
    ollamaOnline,
    installedModels,
    filters,
    sortBy,
    searchQuery,
    scanHardware,
    checkOllama,
    fetchInstalled
  } = useCookbookStore()

  const { engineState, localModels, setupListeners, installEngine, isInstallingBinary } = useEngineStore()

  useEffect(() => {
    scanHardware()
    checkOllama()
    fetchInstalled()
    const unsub = setupListeners()
    return () => unsub()
  }, [])

  const isEngineDownloaded = (model: CookbookModel) =>
    !!(model.ggufFilename && localModels.some((lm) => lm.filename === model.ggufFilename))

  const isDownloaded = (model: CookbookModel) =>
    isOllamaTagInstalled(model.ollamaTag, installedModels) || isEngineDownloaded(model)

  // Filter Catalog
  const filteredModels = MODEL_CATALOG.filter(model => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = model.name.toLowerCase().includes(q)
      const matchDesc = model.description.toLowerCase().includes(q)
      const matchFam = model.family.toLowerCase().includes(q)
      const matchTag = model.ollamaTag.toLowerCase().includes(q)
      if (!matchName && !matchDesc && !matchFam && !matchTag) return false
    }

    // 2. Use Cases Filter
    if (filters.useCases.length > 0) {
      const hasOverlap = model.useCases.some(uc => filters.useCases.includes(uc))
      if (!hasOverlap) return false
    }

    // 3. Family Filter
    if (filters.families.length > 0) {
      if (!filters.families.includes(model.family)) return false
    }

    // 4. Size Tier Filter
    if (filters.sizeTiers.length > 0) {
      if (!filters.sizeTiers.includes(model.sizeTier)) return false
    }

    // 5. Quantization Filter
    if (filters.quantizations.length > 0) {
      if (!filters.quantizations.includes(model.quantization)) return false
    }

    // 6. Compatibility Filter
    if (filters.compatibleOnly && systemInfo) {
      const comp = getCompatibility(systemInfo, model)
      if (comp === 'wont_fit') return false
    }

    return true
  })

  // Sort Catalog — downloaded models first, then selected secondary sort
  const sortedModels = [...filteredModels].sort((a, b) => {
    const aDownloaded = isDownloaded(a) ? 1 : 0
    const bDownloaded = isDownloaded(b) ? 1 : 0
    if (aDownloaded !== bDownloaded) {
      return bDownloaded - aDownloaded
    }

    if (sortBy === 'name') {
      return a.name.localeCompare(b.name)
    }

    if (sortBy === 'size') {
      return a.parameterBillions - b.parameterBillions
    }

    if (sortBy === 'family') {
      return a.family.localeCompare(b.family)
    }

    if (sortBy === 'compatibility') {
      const aComp = getCompatibility(systemInfo, a)
      const bComp = getCompatibility(systemInfo, b)

      const weights = { great: 4, runs: 3, tight: 2, wont_fit: 1 }
      const aWeight = weights[aComp] || 0
      const bWeight = weights[bComp] || 0

      if (aWeight !== bWeight) {
        return bWeight - aWeight // Descending (better compatibility first)
      }
      // If weights match, smaller parameter size first (runs faster)
      return a.parameterBillions - b.parameterBillions
    }

    return 0
  })

  return (
    <div className="cookbook-container animate-fade-in">
      <div className="cookbook-scrollable">
        {/* Top Header Section */}
        <div className="cookbook-header-title">
          <h1>Hardware Cookbook</h1>
          <p>Scan your device specs, verify compatibility, and download optimized local LLMs directly to your system.</p>
        </div>

        {/* Hardware scan summary */}
        <HardwareCard
          systemInfo={systemInfo}
          loading={loadingInfo}
          scanError={scanError}
          onRescan={scanHardware}
        />

        {/* Golti Engine Status Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(229, 192, 123, 0.08)',
            border: '1px solid rgba(229, 192, 123, 0.25)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={20} style={{ color: '#e5c07b' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#e5c07b' }}>
                Golti Engine (Built-in Local AI)
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                {engineState.status === 'running'
                  ? `Running on port ${engineState.port || 8391} ${engineState.loadedModel ? `• Loaded: ${engineState.loadedModel.split(/[\/\\]/).pop()}` : ''}`
                  : engineState.status === 'not-installed'
                  ? 'Run models locally without installing Ollama or terminal setup.'
                  : `Status: ${engineState.status}`}
              </p>
            </div>
          </div>

          {engineState.status === 'not-installed' ? (
            <button
              onClick={() => installEngine()}
              disabled={isInstallingBinary}
              style={{
                backgroundColor: '#e5c07b',
                color: '#1e1e1e',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {isInstallingBinary ? 'Installing Engine...' : '1-Click Install Engine'}
            </button>
          ) : (
            <span style={{ fontSize: '12px', color: '#98c379', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={14} /> Installed
            </span>
          )}
        </div>

        {/* Ollama Offline Banner */}
        {!ollamaOnline && (
          <div className="ollama-offline-banner">
            <div className="banner-left">
              <AlertCircle size={20} className="alert-icon" />
              <div className="banner-text">
                <h3>Local Ollama Server Offline</h3>
                <p>We couldn't connect to Ollama on http://localhost:11434. Installing models requires Ollama to be running.</p>
              </div>
            </div>
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ollama-download-link"
            >
              Get Ollama <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Filtering Options */}
        <FilterBar />

        {/* Catalog grid */}
        <div className="catalog-section">
          <div className="catalog-header">
            <h2>Recommended Local Models</h2>
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
                  isInstalled={isOllamaTagInstalled(model.ollamaTag, installedModels)}
                  installedOllamaTag={findInstalledOllamaTag(model.ollamaTag, installedModels)}
                  isOllamaOnline={ollamaOnline}
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

        {/* Ollama setup guides / tips */}
        <div className="cookbook-tips-card">
          <div className="tips-header">
            <Terminal size={18} className="tips-icon" />
            <h3>Ollama Cheat Sheet & Tips</h3>
          </div>
          <div className="tips-grid">
            <div className="tip-box">
              <h4>Start Ollama manually</h4>
              <code>ollama serve</code>
              <p>Run this command in your terminal if the application is not running in the background.</p>
            </div>
            <div className="tip-box">
              <h4>Verify running models</h4>
              <code>ollama list</code>
              <p>Shows all downloaded models and their sizes on disk.</p>
            </div>
            <div className="tip-box">
              <h4>Memory Headroom</h4>
              <p>For Apple Silicon Macs, the OS shares memory between system and graphics. Close memory-intensive apps (like Photoshop or Chrome tabs) before launching 8B+ models to avoid swapping.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
