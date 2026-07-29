import React, { useEffect, useState } from 'react'
import { Server, Trash2, Plus } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { AIProviderConfig, ProviderType } from '../../../shared/types'

export const ProviderConfig: React.FC = () => {
  const { providers, fetchProviders, saveProvider, deleteProvider } = useSettingsStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<AIProviderConfig>>({})

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
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      google: 'https://generativelanguage.googleapis.com'
    }
    const names: Record<ProviderType, string> = {
      'golti-engine': 'Golti Engine Local',
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
    <div className="settings-panel settings-panel--narrow">
      <div>
        <h3 className="settings-card__title">AI Providers & Backends</h3>
        <p className="settings-card__desc">
          Add API keys for OpenAI, Anthropic, or Google. Local models run on Golti Engine.
        </p>
      </div>

      {/* Add Provider Buttons */}
      <div className="settings-btn-row">
        {(['openai', 'anthropic', 'google'] as ProviderType[]).map(t => (
          <button key={t} onClick={() => handleCreate(t)} className="settings-btn settings-btn--ghost">
            <Plus size={14} /> Add {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Provider Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {providers
          .filter((p) => p.type !== 'golti-engine' && p.id !== 'golti-engine-local' && !p.id.startsWith('golti-engine_'))
          .map(p => (
          <div key={p.id} className="settings-card">
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
                <button onClick={() => handleEdit(p)} className="settings-btn settings-btn--ghost">
                  Edit
                </button>
                <button onClick={() => deleteProvider(p.id)} className="settings-btn settings-btn--danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {p.error && (
              <div className="settings-error" style={{ gap: '4px' }}>
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
                  <label className="settings-field-label">Display Name</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="settings-input"
                  />
                </div>

                <div>
                  <label className="settings-field-label">API Key</label>
                  <input
                    type="password"
                    value={formData.apiKey || ''}
                    onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="settings-input"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button onClick={() => setEditingId(null)} className="settings-btn settings-btn--link" style={{ padding: '6px 12px' }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} className="settings-btn settings-btn--primary">
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
