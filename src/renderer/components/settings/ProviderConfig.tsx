import React, { useEffect, useState } from 'react'
import { Server, Key, Check, Trash2, Plus, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { AIProviderConfig, ProviderType } from '../../../shared/types'

export const ProviderConfig: React.FC = () => {
  const { providers, fetchProviders, saveProvider, deleteProvider } = useSettingsStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<AIProviderConfig>>({})
  const [testingStatus, setTestingStatus] = useState<string | null>(null)

  useEffect(() => {
    fetchProviders()
  }, [])

  const handleEdit = (p: AIProviderConfig) => {
    setEditingId(p.id)
    setFormData(p)
  }

  const handleCreate = (type: ProviderType) => {
    const newId = `${type}_${Date.now()}`
    const defaultEndpoints: Record<ProviderType, string> = {
      'golti-engine': 'http://127.0.0.1:8391',
      ollama: 'http://localhost:11434',
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      google: 'https://generativelanguage.googleapis.com'
    }
    const names: Record<ProviderType, string> = {
      'golti-engine': 'Golti Engine Local',
      ollama: 'Ollama Local',
      openai: 'OpenAI Cloud',
      anthropic: 'Anthropic Claude',
      google: 'Google Gemini'
    }

    const newProvider: AIProviderConfig = {
      id: newId,
      type,
      name: names[type],
      endpoint: defaultEndpoints[type],
      apiKey: '',
      isActive: true,
      models: []
    }

    setEditingId(newId)
    setFormData(newProvider)
  }

  const handleSave = async () => {
    if (!formData.id || !formData.name || !formData.type) return
    await saveProvider(formData as AIProviderConfig)
    setEditingId(null)
    setFormData({})
  }

  return (
    <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>AI Providers & Backends</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Configure your local Ollama server or add API keys for OpenAI, Anthropic, or Google.
        </p>
      </div>

      {/* Add Provider Buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {(['ollama', 'openai', 'anthropic', 'google'] as ProviderType[]).map(t => (
          <button
            key={t}
            onClick={() => handleCreate(t)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              gap: '6px'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-medium)'}
          >
            <Plus size={14} /> Add {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Provider Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {providers
          .filter((p) => p.type !== 'golti-engine' && p.id !== 'golti-engine-local' && !p.id.startsWith('golti-engine_'))
          .map(p => (
          <div
            key={p.id}
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Server size={18} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</span>
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: p.isActive ? 'var(--accent-primary-alpha)' : 'rgba(255,255,255,0.06)',
                  color: p.isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}>
                  {p.type}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  onClick={() => handleEdit(p)}
                  style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 8px' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteProvider(p.id)}
                  style={{ fontSize: '12px', color: '#e06c75', padding: '4px 8px' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {p.error && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(224, 108, 117, 0.1)',
                border: '1px solid rgba(224, 108, 117, 0.2)',
                color: '#e06c75',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <div style={{ fontWeight: 600 }}>Connection Error</div>
                <div style={{ opacity: 0.9 }}>{p.error}</div>
              </div>
            )}

            {editingId === p.id && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-medium)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {p.type === 'ollama' && (
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Ollama Endpoint URL
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint || ''}
                      onChange={e => setFormData({ ...formData, endpoint: e.target.value })}
                      placeholder="http://localhost:11434"
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                )}

                {p.type !== 'ollama' && (
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      API Key
                    </label>
                    <input
                      type="password"
                      value={formData.apiKey || ''}
                      onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                      placeholder="sk-..."
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button
                    onClick={() => setEditingId(null)}
                    style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--text-on-accent)',
                      fontSize: '12px',
                      fontWeight: 500
                    }}
                  >
                    Save Provider
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
