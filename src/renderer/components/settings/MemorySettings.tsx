import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Trash2, Plus, Search, Edit3, ExternalLink, X, Check } from 'lucide-react'
import { useMemoryStore } from '../../stores/memoryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useEngineStore } from '../../stores/engineStore'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useChatStore } from '../../stores/chatStore'
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
  onUpdate: (id: string, updates: { category?: string; title?: string; summary?: string; details?: string[] }) => Promise<void>
}> = ({ memory, onBack, onDelete, onUpdate }) => {
  const { setActiveTab } = useSidebarStore()
  const { selectConversation } = useChatStore()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(memory.title)
  const [category, setCategory] = useState(memory.category)
  const [summary, setSummary] = useState(memory.summary)
  const [detailsText, setDetailsText] = useState(memory.details.join('\n'))

  const handleSave = async () => {
    const details = detailsText
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean)
    await onUpdate(memory.id, { title, category, summary, details })
    setIsEditing(false)
  }

  const handleJumpToSource = async () => {
    if (memory.sourceConversationId) {
      setActiveTab('chat')
      await selectConversation(memory.sourceConversationId)
    }
  }

  return (
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
        <ChevronLeft size={16} /> Back to Recall
      </button>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', backgroundColor: 'var(--bg-card)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Summary</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Details (one per line)</label>
            <textarea
              rows={4}
              value={detailsText}
              onChange={(e) => setDetailsText(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsEditing(false)}
              style={{ padding: '6px 14px', fontSize: '13px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border-medium)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{ padding: '6px 14px', fontSize: '13px', borderRadius: 'var(--radius-md)', background: 'var(--accent-primary)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Check size={14} /> Save Changes
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
            <div>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', fontWeight: 600 }}>
                {memory.category}
              </span>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>
                {memory.title}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                <Edit3 size={15} /> Edit
              </button>
              <button
                onClick={() => {
                  onDelete(memory.id)
                  onBack()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--accent-danger, #e5484d)',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              Summary
            </div>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {memory.summary}
            </p>
          </div>

          {memory.details.length > 0 && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                Details
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {memory.details.map((d, i) => (
                  <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {memory.sourceConversationId && (
            <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={handleJumpToSource}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--accent-primary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <ExternalLink size={14} /> Jump to source conversation
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const CreateMemoryModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSave: (input: { category: string; title: string; summary: string; details: string[] }) => Promise<void>
}> = ({ isOpen, onClose, onSave }) => {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Personal')
  const [summary, setSummary] = useState('')
  const [detailsText, setDetailsText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !summary.trim()) return
    setSubmitting(true)
    const details = detailsText
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean)
    await onSave({
      title: title.trim(),
      category: category.trim() || 'General',
      summary: summary.trim(),
      details
    })
    setSubmitting(false)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-surface, #1e1e24)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Create Memory Fact
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Coding Standards & Stack"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Category</label>
            <input
              type="text"
              placeholder="e.g. Personal, Work, Code, Project"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Summary *</label>
            <textarea
              rows={2}
              required
              placeholder="Short summary of this memory"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px', resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Details (optional, one per line)</label>
            <textarea
              rows={3}
              placeholder="Additional facts or details..."
              value={detailsText}
              onChange={(e) => setDetailsText(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', marginTop: '4px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border-medium)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: 'var(--radius-md)', background: 'var(--accent-primary)', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              {submitting ? 'Creating...' : 'Save Memory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

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
  const { memories, loading, error, fetchMemories, createMemory, updateMemory, deleteMemory } = useMemoryStore()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const localModels = useEngineStore((s) => s.localModels)
  const fetchLocalModels = useEngineStore((s) => s.fetchLocalModels)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)

  const memoryEnabled = settings?.memoryEnabled ?? true

  useEffect(() => {
    fetchMemories()
    fetchLocalModels()
  }, [fetchMemories, fetchLocalModels])

  const filteredMemories = useMemo(() => {
    if (!filterText.trim()) return memories
    const q = filterText.toLowerCase()
    return memories.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.details.some((d) => d.toLowerCase().includes(q))
    )
  }, [memories, filterText])

  const grouped = useMemo(() => {
    const map = new Map<string, Memory[]>()
    for (const m of filteredMemories) {
      const list = map.get(m.category) ?? []
      list.push(m)
      map.set(m.category, list)
    }
    return Array.from(map.entries())
  }, [filteredMemories])

  const selected = selectedId ? memories.find((m) => m.id === selectedId) ?? null : null

  if (selected) {
    return (
      <div style={{ maxWidth: '760px' }}>
        <CardDetail
          memory={selected}
          onBack={() => setSelectedId(null)}
          onDelete={deleteMemory}
          onUpdate={updateMemory}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Recall & Brain Memory
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {memories.length} {memories.length === 1 ? 'topic' : 'topics'} distilled from chats or added manually.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          <Plus size={16} /> Add Memory
        </button>
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

      {/* Live Search Filter Input */}
      {memories.length > 0 && (
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            placeholder="Filter memories by title, category, or detail..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              fontSize: '13px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-medium)'
            }}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Memory list */}
      {loading && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading memories…</p>}
      {error && <p style={{ fontSize: '13px', color: 'var(--accent-danger, #e5484d)' }}>{error}</p>}

      {!loading && memories.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No topics yet.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '380px', margin: '4px auto 0' }}>
            As you chat, durable facts, preferences, and project context are collected here automatically, or you can add facts manually.
          </p>
        </div>
      )}

      {!loading && filteredMemories.length === 0 && memories.length > 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No memories match "{filterText}"</p>
        </div>
      )}

      {!loading &&
        grouped.map(([category, group]) => (
          <div key={category}>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-muted)',
                margin: '0 0 var(--space-2)'
              }}
            >
              {category} ({group.length})
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

      <CreateMemoryModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSave={createMemory}
      />
    </div>
  )
}
