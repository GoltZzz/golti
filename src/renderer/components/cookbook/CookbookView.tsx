import React, { useEffect } from 'react'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useEngineStore } from '../../stores/engineStore'
import { useOllamaProcessStore } from '../../stores/ollamaProcessStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { EngineStatusBadge } from '../common/EngineStatusBadge'
import { HardwareCard } from './HardwareCard'
import { FilterBar } from './FilterBar'
import { ModelCard } from './ModelCard'
import { InstalledModelCard } from './InstalledModelCard'
import { MODEL_CATALOG } from '../../../shared/model-catalog'
import { getCompatibility } from '../../../shared/compatibility'
import { findInstalledOllamaTag, isOllamaTagInstalled } from '../../../shared/ollama-tags'
import { CookbookModel, ModelSource } from '../../../shared/types'
import { AlertCircle, ExternalLink, Info, Terminal, Zap, CheckCircle2, HardDrive } from 'lucide-react'

export const CookbookView: React.FC = () => {
  const [showManualGuide, setShowManualGuide] = React.useState(true)
  const {
    systemInfo,
    loadingInfo,
    scanError,
    ollamaOnline,
    installedModels,
    detailedInstalledModels,
    filters,
    sortBy,
    searchQuery,
    scanHardware,
    checkOllama,
    fetchInstalled,
    setupPullListeners
  } = useCookbookStore()

  const { engineState, localModels, setupListeners, installEngine, reinstallEngine, startEngine, stopEngine, isInstallingBinary } = useEngineStore()
  const { processState: ollamaState, isInstallingBinary: isInstallingOllama, downloadProgress: ollamaProgress, setupListeners: setupOllamaListeners, installOllama, startOllama, stopOllama } = useOllamaProcessStore()
  const { settings, fetchSettings } = useSettingsStore()

  useEffect(() => {
    fetchSettings()
    scanHardware()
    checkOllama()
    fetchInstalled()
    const unsubEngine = setupListeners()
    const unsubOllama = setupOllamaListeners()
    const unsubPull = setupPullListeners()
    return () => {
      unsubEngine()
      unsubOllama()
      unsubPull()
    }
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

    if (filters.sources.length > 0) {
      const matchesSource = filters.sources.some((source) =>
        source === 'golti-engine' ? !!model.ggufUrl : !!model.ollamaTag
      )
      if (!matchesSource) return false
    }

    // 3. Use Cases Filter
    if (filters.useCases.length > 0) {
      const hasOverlap = model.useCases.some(uc => filters.useCases.includes(uc))
      if (!hasOverlap) return false
    }

    // 4. Family Filter
    if (filters.families.length > 0) {
      if (!filters.families.includes(model.family)) return false
    }

    // 5. Size Tier Filter
    if (filters.sizeTiers.length > 0) {
      if (!filters.sizeTiers.includes(model.sizeTier)) return false
    }

    // 6. Quantization Filter
    if (filters.quantizations.length > 0) {
      if (!filters.quantizations.includes(model.quantization)) return false
    }

    // 7. Compatibility Filter
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

  const filteredInstalledLocal = detailedInstalledModels.filter((m) => {
    if (
      filters.sources.length > 0 &&
      !filters.sources.includes(m.providerType as ModelSource)
    ) {
      return false
    }

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
        {/* Top Header Section */}
        <div className="cookbook-header-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Hardware Cookbook</h1>
            <p>Scan your device specs, verify compatibility, and download optimized local LLMs directly to your system.</p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            {ollamaState.status === 'not-installed' ? (
              <button
                onClick={() => installOllama()}
                disabled={isInstallingOllama}
                style={{
                  backgroundColor: '#98c379',
                  color: '#1e1e1e',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: isInstallingOllama ? 'not-allowed' : 'pointer'
                }}
              >
                {isInstallingOllama ? `Installing Ollama... ${ollamaProgress ? ollamaProgress.percent + '%' : ''}` : 'Install Built-in Ollama'}
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Ollama Status: {ollamaState.status === 'running' ? 'Running' : ollamaState.status === 'stopped' ? 'Stopped' : 'Starting...'}
                </span>
                <button
                  onClick={() => ollamaState.status === 'running' ? stopOllama() : startOllama()}
                  disabled={ollamaState.status === 'starting'}
                  style={{
                    backgroundColor: ollamaState.status === 'running' ? 'rgba(224, 108, 117, 0.1)' : 'rgba(152, 195, 121, 0.1)',
                    color: ollamaState.status === 'running' ? '#e06c75' : '#98c379',
                    border: `1px solid ${ollamaState.status === 'running' ? 'rgba(224, 108, 117, 0.3)' : 'rgba(152, 195, 121, 0.3)'}`,
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: ollamaState.status === 'starting' ? 'not-allowed' : 'pointer'
                  }}
                >
                  {ollamaState.status === 'running' ? 'Stop' : 'Start'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hardware scan summary */}
        <HardwareCard
          systemInfo={systemInfo}
          loading={loadingInfo}
          scanError={scanError}
          onRescan={scanHardware}
        />

        {/* Golti Engine Status Banner */}
        {settings?.engineEnabled !== false && (
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

        {/* ELI5 Manual Setup Guide & Offline Banner */}
        {(!ollamaOnline && ollamaState.status !== 'running' && ollamaState.status !== 'starting') && (
          <div className="ollama-offline-wrapper" style={{ marginTop: '20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* ELI5 Manual Ollama Setup Guide */}
            <div className="cookbook-eli5-card">
              <div className="eli5-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="eli5-badge" style={{ backgroundColor: 'rgba(97, 175, 239, 0.15)', color: '#61afef', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ELI5 Guide
                  </span>
                  <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>How to Download & Install Ollama Manually</h3>
                </div>
                <button
                  onClick={() => setShowManualGuide(!showManualGuide)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#61afef',
                    border: '1px solid rgba(97, 175, 239, 0.3)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  {showManualGuide ? 'Hide Guide' : 'Show 3-Step Guide'}
                </button>
              </div>

              {showManualGuide && (
                <div className="eli5-content animate-fade-in" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                  <p className="eli5-intro" style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                    Think of <strong>Ollama</strong> as the engine that powers local AI models on your device.
                    If automatic installation fails or you prefer managing it yourself, follow these 3 simple steps:
                  </p>

                  <div className="eli5-steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    <div className="eli5-step" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', position: 'relative' }}>
                      <div className="step-number" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#61afef', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>1</div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-primary)' }}>Download Official App</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        Visit <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: '#61afef', textDecoration: 'none', fontWeight: 600 }}>ollama.com/download <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /></a> and grab the free installer for your OS.
                      </p>
                    </div>

                    <div className="eli5-step" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
                      <div className="step-number" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#61afef', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>2</div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-primary)' }}>Run the Installer</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        Open the downloaded file (<code>.dmg</code> on Mac or <code>.exe</code> on Windows) and complete standard setup.
                      </p>
                    </div>

                    <div className="eli5-step" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
                      <div className="step-number" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#61afef', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>3</div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-primary)' }}>Launch & Connect</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        Open the Ollama desktop app (or type <code>ollama serve</code> in terminal). Golti will auto-detect it on <code>http://localhost:11434</code>!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Offline Status Banner */}
            <div className="ollama-offline-banner">
              <div className="banner-left">
                <AlertCircle size={20} className="alert-icon" />
                <div className="banner-text">
                  <h3>Local Ollama Server Offline</h3>
                  <p>
                    {ollamaState.status === 'not-installed' 
                      ? "Ollama isn't installed. Click 'Install Built-in Ollama' above to download and run it directly within Golti, or follow the 3-step guide above."
                      : "The Ollama background process is stopped. Click 'Start' in the header to run it."
                    }
                  </p>
                </div>
              </div>
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ollama-download-link"
              >
                Get External Ollama <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {/* Filtering Options */}
        <FilterBar />

        {/* Installed Local Models Section */}
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
