import React, { useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, Cloud, AlertTriangle, Download, Loader2, Search } from 'lucide-react'
import { useHFCatalogStore } from '../../stores/hfCatalogStore'
import { useCookbookStore } from '../../stores/cookbookStore'
import { useEngineStore } from '../../stores/engineStore'
import { ModelCard } from './ModelCard'
import { SystemInfoFull } from '../../../shared/types'
import { matchesModelFilters, ModelFilterContext } from '../../../shared/model-filter'

interface HuggingFaceBrowserProps {
  systemInfo: SystemInfoFull | null
}

function formatDownloads(count: number): string {
  if (count >= 1e6) return `${Math.round((count / 1e6) * 10) / 10}M`
  if (count >= 1e3) return `${Math.round(count / 1e3)}K`
  return String(count)
}

export const HuggingFaceBrowser: React.FC<HuggingFaceBrowserProps> = ({ systemInfo }) => {
  const {
    enabled,
    results,
    loading,
    error,
    stale,
    details,
    expanded,
    setEnabled,
    search,
    toggleExpanded
  } = useHFCatalogStore()

  const searchQuery = useCookbookStore((s) => s.searchQuery)
  const filters = useCookbookStore((s) => s.filters)
  const resetFilters = useCookbookStore((s) => s.resetFilters)
  const localModels = useEngineStore((s) => s.localModels)

  // hfCatalogStore.search already applied searchQuery server-side on HF, and HF matches
  // more broadly than client-side search (e.g. author, tags), so pass searchQuery: '' deliberately.
  const filterContext = useMemo<ModelFilterContext>(
    () => ({ filters, searchQuery: '', systemInfo }),
    [filters, systemInfo]
  )

  useEffect(() => {
    if (!enabled) return
    const handle = setTimeout(() => {
      void search(searchQuery)
    }, 350)
    return () => clearTimeout(handle)
  }, [enabled, searchQuery])

  return (
    <div className="catalog-section hf-browser-section">
      <div className="catalog-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cloud size={18} style={{ color: 'var(--text-muted)' }} />
          <h2 style={{ margin: 0 }}>Browse Hugging Face</h2>
        </div>
        <button
          className="hf-toggle-button"
          onClick={() => setEnabled(!enabled)}
          aria-expanded={enabled}
        >
          {enabled ? 'Hide' : 'Browse more models'}
        </button>
      </div>

      {enabled && (
        <>
          <div className="hf-disclaimer">
            <AlertTriangle size={14} />
            <span>
              Community-published models, not verified by Golti. Memory estimates are calculated
              from file size and may be approximate - check the compatibility badge before
              downloading.
            </span>
          </div>

          {stale && (
            <div className="hf-disclaimer hf-disclaimer-warn">
              <AlertTriangle size={14} />
              <span>Showing cached results - could not reach Hugging Face.</span>
            </div>
          )}

          {error && !stale && (
            <div className="hf-disclaimer hf-disclaimer-warn">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          {loading && results.length === 0 ? (
            <div className="hf-loading">
              <Loader2 size={16} className="spin" />
              <span>Searching Hugging Face…</span>
            </div>
          ) : results.length === 0 ? (
            <div className="empty-catalog-state small-empty" style={{ padding: '16px', textAlign: 'center' }}>
              <Search size={28} className="empty-icon" />
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                {searchQuery.trim()
                  ? `No Hugging Face models matched “${searchQuery.trim()}”.`
                  : 'No results available right now.'}
              </p>
            </div>
          ) : (
            <ul className="hf-repo-list">
              {results.map((repo) => {
                const isOpen = !!expanded[repo.repoId]
                const detail = details[repo.repoId]
                const matchingModels = detail?.models
                  ? detail.models.filter((m) => matchesModelFilters(m, filterContext))
                  : []
                return (
                  <li key={repo.repoId} className="hf-repo-item">
                    <button
                      className="hf-repo-row"
                      onClick={() => toggleExpanded(repo.repoId)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <div className="hf-repo-text">
                        <span className="hf-repo-name">{repo.name}</span>
                        <span className="hf-repo-author">{repo.author}</span>
                      </div>
                      <span className="hf-repo-downloads">
                        <Download size={12} /> {formatDownloads(repo.downloads)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="hf-repo-detail">
                        {detail?.loading && (
                          <div className="hf-loading">
                            <Loader2 size={16} className="spin" />
                            <span>Loading available sizes…</span>
                          </div>
                        )}

                        {detail?.error && (
                          <div className="hf-disclaimer hf-disclaimer-warn">
                            <AlertTriangle size={14} />
                            <span>{detail.error}</span>
                          </div>
                        )}

                        {repo.gated && !detail?.loading && (
                          <div className="hf-disclaimer hf-disclaimer-warn">
                            <AlertTriangle size={14} />
                            <span>
                              This repository is gated on Hugging Face and may refuse to download
                              without an account.
                            </span>
                          </div>
                        )}

                        {detail && !detail.loading && detail.models.length > 0 && matchingModels.length === 0 && (
                          <div className="hf-disclaimer">
                            <AlertTriangle size={14} />
                            <span>
                              All {detail.models.length} available size{detail.models.length === 1 ? '' : 's'} are hidden by your current filters.
                            </span>
                            <button
                              onClick={resetFilters}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-cyan)',
                                cursor: 'pointer',
                                padding: 0,
                                font: 'inherit',
                                textDecoration: 'underline',
                                marginLeft: 'auto'
                              }}
                            >
                              Reset filters
                            </button>
                          </div>
                        )}

                        {detail && !detail.loading && matchingModels.length > 0 && (
                          <div className="catalog-grid">
                            {matchingModels.map((model) => (
                              <ModelCard
                                key={model.id}
                                model={model}
                                systemInfo={systemInfo}
                                isInstalled={
                                  !!model.ggufFilename &&
                                  localModels.some((lm) => lm.filename === model.ggufFilename)
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
