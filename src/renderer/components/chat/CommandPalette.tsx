import React, { useEffect, useRef } from 'react'
import {
  Paperclip,
  Link2,
  Globe,
  Search,
  SlidersHorizontal,
  Undo2,
  Redo2,
  Check
} from 'lucide-react'

export interface CommandTooltip {
  title: string
  summary: string
  meta?: string
}

export interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  isActive?: boolean
  tooltip?: CommandTooltip
  action: () => void
}

interface CommandPaletteProps {
  filter: string
  trigger?: '@' | '/'
  onClose: () => void
  onSelect: (command: CommandItem) => void
  commands: CommandItem[]
  position?: { top?: number; left?: number; bottom?: number }
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  filter,
  trigger = '@',
  onClose,
  onSelect,
  commands
}) => {
  const isSkills = trigger === '/'
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [hovered, setHovered] = React.useState<{ item: CommandItem; top: number; left: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHoverTimer = (): void => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  const showTooltip = (cmd: CommandItem, el: HTMLElement): void => {
    clearHoverTimer()
    if (!cmd.tooltip) {
      setHovered(null)
      return
    }
    const rect = el.getBoundingClientRect()
    hoverTimer.current = setTimeout(() => {
      setHovered({ item: cmd, top: rect.top, left: rect.right + 10 })
    }, 320)
  }

  const hideTooltip = (): void => {
    clearHoverTimer()
    setHovered(null)
  }

  useEffect(() => clearHoverTimer, [])

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
    (cmd.description && cmd.description.toLowerCase().includes(filter.toLowerCase()))
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands[selectedIndex]) {
          e.preventDefault()
          onSelect(filteredCommands[selectedIndex])
        }
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [filteredCommands, selectedIndex, onClose, onSelect])

  if (filteredCommands.length === 0) {
    return (
      <div ref={containerRef} className="command-palette animate-fade-in">
        <div className="command-palette-empty">No matching commands found</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="command-palette animate-fade-in" role="menu">
      <div className="command-palette-header">
        <span>{isSkills ? 'Skills' : 'Tools & Context'}</span>
        {filter && <span className="command-palette-filter">{trigger}{filter}</span>}
      </div>
      <div className="command-palette-list">
        {filteredCommands.map((cmd, idx) => (
          <button
            key={cmd.id}
            className={`command-item ${idx === selectedIndex ? 'is-selected' : ''} ${cmd.isActive ? 'is-active' : ''} ${isSkills ? 'is-skill' : ''}`}
            onClick={() => onSelect(cmd)}
            onMouseEnter={(e) => {
              setSelectedIndex(idx)
              showTooltip(cmd, e.currentTarget)
            }}
            onMouseLeave={hideTooltip}
            onFocus={(e) => showTooltip(cmd, e.currentTarget)}
            onBlur={hideTooltip}
            role="menuitem"
          >
            <div className="command-item-icon">{cmd.icon}</div>
            <div className="command-item-content">
              <div className="command-item-label">
                <span>{isSkills && cmd.id !== '__new-skill' ? `/${cmd.label}` : cmd.label}</span>
                {cmd.isActive && <Check size={12} className="command-active-check" />}
              </div>
              {cmd.description && <div className="command-item-desc">{cmd.description}</div>}
            </div>
            {cmd.shortcut && <span className="command-item-shortcut">{cmd.shortcut}</span>}
          </button>
        ))}
      </div>
      {hovered && (
        <div
          className="command-tooltip animate-fade-in"
          role="tooltip"
          style={{ top: hovered.top, left: hovered.left }}
        >
          <div className="command-tooltip-title">{hovered.item.tooltip?.title}</div>
          <div className="command-tooltip-summary">{hovered.item.tooltip?.summary}</div>
          {hovered.item.tooltip?.meta && (
            <div className="command-tooltip-meta">{hovered.item.tooltip.meta}</div>
          )}
        </div>
      )}
    </div>
  )
}
