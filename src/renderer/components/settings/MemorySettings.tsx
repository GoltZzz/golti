import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useMemoryStore } from '../../stores/memoryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useEngineStore } from '../../stores/engineStore'
import { Memory } from '../../../shared/types'

function updatedLabel(ts: number): string {
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86400000)
  if (days < 1) {
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Updated just now'
    return `Updated ${hours}h ago`
  }
  if (days < 7) return `Updated ${days} day${days === 1 ? '' : 's'} ago`
  const d = new Date(ts)
  return `Updated ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

const CardRow: React.FC<{
  memory: Memory
  onOpen: (m: Memory) => void
  onDelete: (id: string) => void
}> = ({ memory, onOpen, onDelete }) => {
  const [hover, setHover] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(memory)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(memory)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr auto auto',
        alignItems: 'center',
        gap: 'var(--space-4)',
        width: '100%',
        textAlign: 'left',
        padding: '16px',
        cursor: 'pointer',
        backgroundColor: hover ? 'var(--bg-card)' : 'transparent',
        borderBottom: '1px solid var(--border-subtle)'
      }}
    >
      <span
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {memory.title}
      </span>
      <span
        style={{
          fontSize: '14px',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0
        }}
        title={memory.summary}
      >
        {memory.summary}
      </span>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {updatedLabel(memory.updatedAt)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(memory.id)
        }}
        title="Forget this topic"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '30px',
          height: '30px',
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          opacity: hover ? 1 : 0.55
        }}
      >
        <Trash2 size={17} />
      </button>
    </div>
  )
}

const CardDetail: React.FC<{
  memory: Memory
  onBack: () => void
  onDelete: (id: string) => void
}> = ({ memory, onBack, onDelete }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
    <button
      onClick={onBack}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        alignSelf: 'flex-start',
        background: 'transparent',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: '13px',
        padding: 0
      }}
    >
      <ChevronLeft size={16} /> Back
    </button>

    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        {memory.title}
      </h3>
      <button
        onClick={() => {
          onDelete(memory.id)
          onBack()
        }}
        style={{
          fontSize: '13px',
          padding: '8px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          color: 'var(--text-primary)',
          cursor: 'pointer'
        }}
      >
        Delete
      </button>
    </div>

    <div>
      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
        Summary
      </div>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        {memory.summary}
      </p>
    </div>

    {memory.details.length > 0 && (
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          Details
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {memory.details.map((d, i) => (
            <li key={i} style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {d}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
)

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange
}) => (
  <button
    onClick={() => onChange(!checked)}
    role="switch"
    aria-checked={checked}
    style={{
      width: '42px',
      height: '24px',
      borderRadius: '999px',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      flexShrink: 0,
      backgroundColor: checked ? 'var(--accent-primary)' : 'var(--border-medium)',
      transition: 'background-color 0.15s ease',
      position: 'relative'
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: '3px',
        left: checked ? '21px' : '3px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'left 0.15s ease'
      }}
    />
  </button>
)

export const MemorySettings: React.FC = () => {
  const { memories, loading, error, fetchMemories, deleteMemory } = useMemoryStore()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const localModels = useEngineStore((s) => s.localModels)
  const fetchLocalModels = useEngineStore((s) => s.fetchLocalModels)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const memoryEnabled = settings?.memoryEnabled ?? true

  useEffect(() => {
    fetchMemories()
    fetchLocalModels()
  }, [fetchMemories, fetchLocalModels])

  const grouped = useMemo(() => {
    const map = new Map<string, Memory[]>()
    for (const m of memories) {
      const list = map.get(m.category) ?? []
      list.push(m)
      map.set(m.category, list)
    }
    return Array.from(map.entries())
  }, [memories])

  const selected = selectedId ? memories.find((m) => m.id === selectedId) ?? null : null

  if (selected) {
    return (
      <div style={{ maxWidth: '760px' }}>
        <CardDetail memory={selected} onBack={() => setSelectedId(null)} onDelete={deleteMemory} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Recall
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {memories.length} {memories.length === 1 ? 'topic' : 'topics'} distilled from your
          conversations.
        </p>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: '16px',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Generate memory from chats
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Allow Golti to distill durable facts, preferences, and project context from your chats.
            </div>
          </div>
          <Toggle checked={memoryEnabled} onChange={(v) => updateSettings({ memoryEnabled: v })} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: '16px',
            opacity: memoryEnabled ? 1 : 0.5
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Memory model
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              A dedicated model used to extract memories. Runs CPU-only so it won't disturb your chat.
            </div>
          </div>
          <select
            value={settings?.memoryModel || ''}
            disabled={!memoryEnabled}
            onChange={(e) => updateSettings({ memoryModel: e.target.value || undefined })}
            style={{
              minWidth: '200px',
              padding: '7px 8px',
              fontSize: '12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-medium)'
            }}
          >
            <option value="">Use loaded chat model</option>
            {localModels.map((m) => (
              <option key={m.filename} value={m.filename}>
                {m.filename} · {m.sizeGB} GB
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Memory list */}
      {loading && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading memories…</p>}
      {error && <p style={{ fontSize: '13px', color: 'var(--accent-danger, #e5484d)' }}>{error}</p>}

      {!loading && memories.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No topics yet.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '380px', margin: '4px auto 0' }}>
            As you chat, durable facts, preferences, and project context are collected here automatically.
          </p>
        </div>
      )}

      {!loading &&
        grouped.map(([category, group]) => (
          <div key={category}>
            <h4
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 var(--space-2)'
              }}
            >
              {category}
            </h4>
            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {group.map((m) => (
                <CardRow
                  key={m.id}
                  memory={m}
                  onOpen={(mm) => setSelectedId(mm.id)}
                  onDelete={deleteMemory}
                />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
