import React from 'react'
import { FileText, Folder, Link2, Type, X } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

const iconFor = (type: string) => {
  if (type === 'folder') return <Folder size={12} />
  if (type === 'url') return <Link2 size={12} />
  if (type === 'text') return <Type size={12} />
  return <FileText size={12} />
}

export const ContextTray: React.FC = () => {
  const { contextItems, toggleContextItem, removeContextItem } = useChatStore()

  if (contextItems.length === 0) return null

  return (
    <div className="context-tray" aria-label="Attached context">
      {contextItems.map((item) => (
        <div
          key={item.id}
          className={`context-chip ${item.enabled ? '' : 'is-disabled'}`}
          title={item.error || `${item.tokenEstimate} tokens`}
        >
          <button
            onClick={() => toggleContextItem(item.id, !item.enabled)}
            aria-label={item.enabled ? 'Disable context' : 'Enable context'}
            style={{ display: 'inline-flex', color: 'inherit' }}
          >
            {iconFor(item.type)}
          </button>
          <span className="context-chip-name">{item.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {item.tokenEstimate}
          </span>
          <button onClick={() => removeContextItem(item.id)} aria-label={`Remove ${item.name}`}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
