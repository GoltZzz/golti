import React, { useEffect, useState, useRef, useMemo } from 'react'
import { ChevronDown, RefreshCw, Server, Zap, Search, Brain, Check, X, Sparkles } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { ModelInfo } from '../../../shared/types'
import { parseModelDisplay, type ModelDisplay } from '../../../shared/model-display'
import { useModelCapabilityStore } from '../../stores/modelCapabilityStore'

export const ModelSelector: React.FC = () => {
  const { models, selectedModel, setSelectedModel, fetchModels, isLoadingModels } = useChatStore()
  const reasoningModels = useModelCapabilityStore((s) => s.reasoningModels)
  const isReasoning = (name: string) => Boolean(reasoningModels[name])
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0)
  const [hoveredModel, setHoveredModel] = useState<ModelInfo | null>(null)
  
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    fetchModels()
  }, [])

  // Auto focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
      setHighlightedIndex(0)
    }
  }, [isOpen])

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const parseModelDetails = (name: string): ModelDisplay => parseModelDisplay(name)

  const getProviderBadge = (providerType: string) => {
    if (providerType === 'golti-engine') {
      return (
        <span
          style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: 'rgba(229, 192, 123, 0.15)',
            color: '#e5c07b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            fontWeight: 600,
            textTransform: 'uppercase',
            flexShrink: 0
          }}
        >
          <Zap size={10} /> Golti Engine
        </span>
      )
    }
    return (
      <span
        style={{
          fontSize: '10px',
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: 'var(--accent-primary-alpha)',
          color: 'var(--accent-primary)',
          textTransform: 'uppercase',
          fontWeight: 600,
          flexShrink: 0
        }}
      >
        {providerType}
      </span>
    )
  }

  // Filter models by search query and category chip
  const filteredModels = useMemo(() => {
    return models.filter(m => {
      // Category filter
      if (activeCategory === 'golti' && m.providerType !== 'golti-engine') return false
      if (activeCategory === 'reasoning' && !isReasoning(m.name)) return false

      // Search query filter
      if (!searchQuery) return true
      const lowerQuery = searchQuery.toLowerCase()
      return m.name.toLowerCase().includes(lowerQuery) || m.providerType.toLowerCase().includes(lowerQuery)
    })
  }, [models, searchQuery, activeCategory, reasoningModels])

  // Flat array of models for indexed keyboard navigation
  const flatModels = useMemo(() => filteredModels, [filteredModels])

  // Group models by providerType
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {}
    filteredModels.forEach(m => {
      if (!groups[m.providerType]) groups[m.providerType] = []
      groups[m.providerType].push(m)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredModels])

  // Ensure scroll into view for keyboard navigation
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [highlightedIndex, isOpen])

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (flatModels.length > 0 ? (prev + 1) % flatModels.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (flatModels.length > 0 ? (prev - 1 + flatModels.length) % flatModels.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatModels[highlightedIndex]) {
        setSelectedModel(flatModels[highlightedIndex])
        setIsOpen(false)
        setSearchQuery('')
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  // Current selected parsed info for trigger display
  const selectedParsed = useMemo(() => {
    return selectedModel ? parseModelDetails(selectedModel.name) : null
  }, [selectedModel])

  return (
    <div className="model-selector-container" ref={menuRef} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`model-selector-trigger ${isOpen ? 'is-open' : ''}`}
        aria-label="Select AI Model"
        aria-expanded={isOpen}
      >
        <Server size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
          {selectedParsed ? selectedParsed.displayName : 'Select Model'}
        </span>
        {selectedParsed?.paramSize && (
          <span className="model-selector-badge-param">{selectedParsed.paramSize}</span>
        )}
        {selectedModel && isReasoning(selectedModel.name) && (
          <span className="model-selector-badge-reasoning" title="Reasoning Model">
            <Brain size={12} />
          </span>
        )}
        {selectedModel && getProviderBadge(selectedModel.providerType)}
        <ChevronDown
          size={14}
          style={{
            color: 'var(--text-muted)',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-fast)'
          }}
        />
      </button>

      {isOpen && (
        <div className="model-selector-popover">
          {/* Search Header */}
          <div className="model-selector-header">
            <div className="model-selector-search-wrapper">
              <Search size={12} color="var(--text-muted)" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setHighlightedIndex(0)
                }}
                placeholder="Search models... (↑↓ to navigate)"
                className="model-selector-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="model-selector-search-clear"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchModels()
              }}
              title="Refresh available models"
              className="model-selector-refresh-btn"
            >
              <RefreshCw size={12} className={isLoadingModels ? 'dot-flashing' : ''} />
            </button>
          </div>

          {/* Category Filter Chips */}
          <div className="model-selector-filter-bar">
            <button
              className={`model-selector-chip ${activeCategory === 'all' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveCategory('all')
                setHighlightedIndex(0)
              }}
            >
              All ({models.length})
            </button>
            <button
              className={`model-selector-chip ${activeCategory === 'golti' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveCategory('golti')
                setHighlightedIndex(0)
              }}
            >
              <Zap size={10} style={{ marginRight: 3 }} /> Golti Engine
            </button>
            <button
              className={`model-selector-chip ${activeCategory === 'reasoning' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveCategory('reasoning')
                setHighlightedIndex(0)
              }}
            >
              <Brain size={10} style={{ marginRight: 3 }} /> Reasoning
            </button>
          </div>

          {/* Model List */}
          <div className="model-selector-list">
            {models.length === 0 ? (
              <div style={{ padding: '20px 12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No active models found.<br />Check Cookbook or Settings to download models.
              </div>
            ) : filteredModels.length === 0 ? (
              <div style={{ padding: '20px 12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No models match your search or filter.
              </div>
            ) : (
              (() => {
                let globalIndexCounter = 0
                return groupedModels.map(([provider, providerModels]) => (
                  <div key={provider} className="model-selector-group">
                    <div className="model-selector-group-title">
                      <span>{provider}</span>
                      <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text-muted)' }}>
                        {providerModels.length} {providerModels.length === 1 ? 'model' : 'models'}
                      </span>
                    </div>

                    {providerModels.map((m) => {
                      const itemIndex = globalIndexCounter++
                      const isSelected = selectedModel?.id === m.id
                      const isHighlighted = highlightedIndex === itemIndex
                      const parsed = parseModelDetails(m.name)

                      return (
                        <div
                          key={m.id}
                          ref={(el) => {
                            itemRefs.current[itemIndex] = el
                          }}
                          onClick={() => {
                            setSelectedModel(m)
                            setIsOpen(false)
                            setSearchQuery('')
                          }}
                          onMouseEnter={() => {
                            setHighlightedIndex(itemIndex)
                            setHoveredModel(m)
                          }}
                          onMouseLeave={() => setHoveredModel(null)}
                          className={`model-selector-item ${isSelected ? 'is-selected' : ''} ${
                            isHighlighted ? 'is-highlighted' : ''
                          }`}
                        >
                          {/* Active Selection Indicator Bar */}
                          {isSelected && <div className="model-selector-active-bar" />}

                          <div className="model-selector-item-left">
                            <span className="model-selector-name">{parsed.displayName}</span>

                            {parsed.paramSize && (
                              <span className="model-selector-badge-param">{parsed.paramSize}</span>
                            )}

                            {parsed.quantization && (
                              <span className="model-selector-badge-quant">{parsed.quantization}</span>
                            )}

                            {isReasoning(m.name) && (
                              <span className="model-selector-badge-reasoning" title="Reasoning / Thinking Model">
                                <Brain size={12} />
                              </span>
                            )}
                          </div>

                          {/* Checkmark for selected model */}
                          {isSelected && (
                            <div className="model-selector-check">
                              <Check size={14} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
              })()
            )}
          </div>

          {/* Detailed Hover Tooltip */}
          {hoveredModel && (
            <div className="model-selector-tooltip">
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: 4 }}>
                {hoveredModel.name}
              </span>
              <span>({hoveredModel.providerType})</span>
            </div>
          )}

          {/* Footer Shortcuts hint */}
          <div className="model-selector-footer">
            <span>{filteredModels.length} models</span>
            <span>↑↓ Navigate • ↵ Select • ESC Close</span>
          </div>
        </div>
      )}
    </div>
  )
}
