import React, { useEffect, useState } from 'react'
import { ChevronDown, RefreshCw, Server, Zap } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

export const ModelSelector: React.FC = () => {
  const { models, selectedModel, setSelectedModel, fetchModels, isLoadingModels } = useChatStore()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    fetchModels()
  }, [])

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

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 500
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
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '260px',
            maxHeight: '300px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            padding: '4px'
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
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Available Models</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchModels()
              }}
              title="Refresh Models"
              style={{ padding: '2px', color: 'var(--text-muted)' }}
            >
              <RefreshCw size={12} className={isLoadingModels ? 'dot-flashing' : ''} />
            </button>
          </div>

          {models.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No active models found.<br />Check Cookbook or Settings to download models.
            </div>
          ) : (
            models.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  setSelectedModel(m)
                  setIsOpen(false)
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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                {getProviderBadge(m.providerType)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

