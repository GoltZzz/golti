import React, { useEffect, useRef, useState } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [adjusted, setAdjusted] = useState(position)

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = position.x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : position.x
    const y = position.y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : position.y
    setAdjusted({ x, y })
  }, [position])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: adjusted.x, top: adjusted.y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`context-menu-item ${item.danger ? 'is-danger' : ''}`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
