import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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
import { filterModels, ModelFilterContext } from '../../../shared/model-filter'
import { CookbookModel } from '../../../shared/types'
import { Info, HardDrive } from 'lucide-react'

// The catalog holds hundreds of models; mounting every card at once makes the
// view (and each search keystroke) stall. Cards are rendered in pages instead,
// with the next page mounted as the user scrolls near the end of the grid.
const CATALOG_PAGE_SIZE = 24

const COMPAT_WEIGHTS = { great: 4, runs: 3, tight: 2, wont_fit: 1 } as const

export const CookbookView: React.FC = () => {
  const {
    systemInfo,
    loadingInfo,
    scanError,
    detailedInstalledModels,
    filters,
    sortBy,
    searchQuery,
    scanHardware,
    fetchInstalled
  } = useCookbookStore()

  const { engineState, localModels, setupListeners, installEngine, reinstallEngine, startEngine, stopEngine, isInstallingBinary } = useEngineStore()
  const { settings, fetchSettings } = useSettingsStore()

  useEffect(() => {
    fetchSettings()
    scanHardware()
    fetchInstalled()
    const unsubEngine = setupListeners()
    return () => {
      unsubEngine()
    }
  }, [])

  // Typing updates the input immediately; the catalog filters against the
  // deferred value so React can interrupt the heavy re-render mid-keystroke.
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const downloadedFilenames = useMemo(
    () => new Set(localModels.map((lm) => lm.filename)),
    [localModels]
  )

  const isEngineDownloaded = (model: CookbookModel) =>
    !!(model.ggufFilename && downloadedFilenames.has(model.ggufFilename))

  const filterContext = useMemo<ModelFilterContext>(
    () => ({ filters, searchQuery: deferredSearchQuery, systemInfo }),
    [filters, deferredSearchQuery, systemInfo]
  )

  const filteredModels = useMemo(
    () => filterModels(MODEL_CATALOG, filterContext),
    [filterContext]
  )

  const sortedModels = useMemo(() => {
    const downloaded = new Map<string, number>()
    const compatWeight = new Map<string, number>()
    for (const m of filteredModels) {
      downloaded.set(m.id, m.ggufFilename && downloadedFilenames.has(m.ggufFilename) ? 1 : 0)
      if (sortBy === 'compatibility') {
        compatWeight.set(m.id, COMPAT_WEIGHTS[getCompatibility(systemInfo, m)] || 0)
      }
    }

    return [...filteredModels].sort((a, b) => {
      const aDownloaded = downloaded.get(a.id)!
      const bDownloaded = downloaded.get(b.id)!
      if (aDownloaded !== bDownloaded) {
        return bDownloaded - aDownloaded
      }

      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'size') return a.parameterBillions - b.parameterBillions
      if (sortBy === 'family') return a.family.localeCompare(b.family)

      if (sortBy === 'compatibility') {
        const aWeight = compatWeight.get(a.id)!
        const bWeight = compatWeight.get(b.id)!
        if (aWeight !== bWeight) return bWeight - aWeight
        return a.parameterBillions - b.parameterBillions
      }

      return 0
    })
  }, [filteredModels, downloadedFilenames, sortBy, systemInfo])

  // Start over at the first page whenever the result set changes shape. Done
  // during render (not in an effect) so a long list is never mounted in full
  // for one frame before being cut back.
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE)
  const [pageResetKey, setPageResetKey] = useState({ filterContext, sortBy })
  if (pageResetKey.filterContext !== filterContext || pageResetKey.sortBy !== sortBy) {
    setPageResetKey({ filterContext, sortBy })
    setVisibleCount(CATALOG_PAGE_SIZE)
  }

  const visibleModels = sortedModels.slice(0, visibleCount)
  const hasMoreModels = visibleCount < sortedModels.length

  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel || !hasMoreModels) return
    // Re-observing after every page makes the observer report again even if
    // the sentinel never left the preload margin (e.g. on a tall window).
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => n + CATALOG_PAGE_SIZE)
        }
      },
      { root: scrollRef.current, rootMargin: '0px 0px 800px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreModels, visibleCount])

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
      <div className="cookbook-scrollable" ref={scrollRef}>
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
                  No installed local models match your search.
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
            <>
              <div className="catalog-grid">
                {visibleModels.map(model => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    systemInfo={systemInfo}
                    isInstalled={isEngineDownloaded(model)}
                  />
                ))}
              </div>
              {hasMoreModels && <div ref={loadMoreRef} className="catalog-load-more" aria-hidden="true" />}
            </>
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
