import React, { useEffect, useState, useRef, useMemo } from 'react'
import { ChevronDown, RefreshCw, Server, Zap, Search, Brain } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { ModelInfo } from '../../../shared/types'

export const ModelSelector: React.FC = () => {
  const { models, selectedModel, setSelectedModel, fetchModels, isLoadingModels } = useChatStore()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchModels()
  }, [])

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
            textTransform: 'uppercase'
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
          textTransform: 'uppercase'
        }}
      >
        {providerType}
      </span>
    )
  }

  const isReasoningModel = (name: string) => {
    const lower = name.toLowerCase()
    return lower.includes('deepseek-r1') || lower.includes('qwen') || lower.includes('reasoning') || lower.includes('think')
  }

  const filteredModels = useMemo(() => {
    if (!searchQuery) return models
    const lowerQuery = searchQuery.toLowerCase()
    return models.filter(m => m.name.toLowerCase().includes(lowerQuery) || m.providerType.toLowerCase().includes(lowerQuery))
  }, [models, searchQuery])

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {}
    filteredModels.forEach(m => {
      if (!groups[m.providerType]) groups[m.providerType] = []
      groups[m.providerType].push(m)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredModels])

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-glass-card)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-medium)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 500,
          transition: 'all var(--transition-fast)',
          cursor: 'pointer'
        }}
      >
        <Server size={14} style={{ color: 'var(--accent-primary)' }} />
        <span>{selectedModel ? selectedModel.name : 'Select Model'}</span>
        {selectedModel && getProviderBadge(selectedModel.providerType)}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            minWidth: '320px',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'rgba(19, 20, 31, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            padding: '4px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <Search size={12} color="var(--text-muted)" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  width: '100%'
                }}
              />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchModels()
              }}
              title="Refresh Models"
              style={{ padding: '2px', color: 'var(--text-muted)', marginLeft: '8px' }}
            >
              <RefreshCw size={12} className={isLoadingModels ? 'dot-flashing' : ''} />
            </button>
          </div>

          {models.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No active models found.<br />Check Cookbook or Settings to download models.
            </div>
          ) : filteredModels.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No models match your search.
            </div>
          ) : (
            groupedModels.map(([provider, providerModels]) => (
              <div key={provider} style={{ marginBottom: '8px' }}>
                <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {provider}
                </div>
                {providerModels.map((m) => {
                  const isReasoning = isReasoningModel(m.name)
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m)
                        setIsOpen(false)
                        setSearchQuery('')
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        backgroundColor: selectedModel?.id === m.id ? 'var(--accent-primary-alpha)' : 'transparent',
                        color: selectedModel?.id === m.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedModel?.id !== m.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                      }}
                      onMouseLeave={(e) => {
                        if (selectedModel?.id !== m.id) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                        {isReasoning && (
                          <span title="Thinking/Reasoning Model" style={{ display: 'inline-flex', color: 'var(--accent-purple)' }}>
                            <Brain size={12} />
                          </span>
                        )}
                      </div>
                      {getProviderBadge(m.providerType)}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

