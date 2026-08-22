import React, { useState } from 'react'
import {
  Workflow,
  Plus,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  UserCheck
} from 'lucide-react'
import { useOfficeStore } from '../../stores/officeStore'
import { OfficeTask } from '../../../shared/types'

interface OfficeTaskRailProps {
  hoveredTaskId?: string | null
  onHoverTask?: (taskId: string | null) => void
}

export const OfficeTaskRail: React.FC<OfficeTaskRailProps> = ({
  hoveredTaskId,
  onHoverTask
}) => {
  const tasks = useOfficeStore((s) => s.tasks)
  const agents = useOfficeStore((s) => s.agents)
  const setSelectedAgentId = useOfficeStore((s) => s.setSelectedAgentId)
  const createTask = useOfficeStore((s) => s.createTask)

  const [isQuickAdding, setIsQuickAdding] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')

  // In-flight or recent tasks ordered: in_progress -> review -> backlog -> completed
  const activeTasks = [...tasks].sort((a, b) => {
    const order: Record<OfficeTask['status'], number> = {
      in_progress: 0,
      review: 1,
      backlog: 2,
      completed: 3
    }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    return b.updatedAt - a.updatedAt
  })

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickTitle.trim()) return
    createTask({ title: quickTitle.trim(), priority: 'medium' })
    setQuickTitle('')
    setIsQuickAdding(false)
  }

  const handleTaskClick = (task: OfficeTask) => {
    if (task.assignedAgentId) {
      setSelectedAgentId(task.assignedAgentId)
    }
  }

  return (
    <div className="office-task-rail" role="region" aria-label="Active workflow task rail">
      {/* Title */}
      <div className="office-task-rail-title">
        <Workflow size={12} color="var(--accent-blue)" />
        <span>Work Flow</span>
      </div>

      {/* Chips List */}
      <div className="office-task-rail-list" role="list">
        {activeTasks.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 8px' }}>
            No active workflow tickets. Create one below or dispatch directives.
          </div>
        ) : (
          activeTasks.slice(0, 12).map((task) => {
            const assignedAgent = agents.find((a) => a.id === task.assignedAgentId)
            const isHovered = hoveredTaskId === task.id
            const isActive = task.status === 'in_progress'

            return (
              <div
                key={task.id}
                role="listitem"
                className={`office-task-chip ${isActive ? 'is-active' : ''} ${isHovered ? 'is-hovered-link' : ''}`}
                onClick={() => handleTaskClick(task)}
                onMouseEnter={() => onHoverTask?.(task.id)}
                onMouseLeave={() => onHoverTask?.(null)}
                title={`Click to inspect assigned agent: ${task.title}`}
              >
                <div
                  className="office-task-chip-status"
                  style={{
                    backgroundColor:
                      task.status === 'in_progress'
                        ? 'var(--accent-blue)'
                        : task.status === 'review'
                        ? 'var(--accent-yellow)'
                        : task.status === 'completed'
                        ? 'var(--status-success)'
                        : 'var(--text-muted)'
                  }}
                />

                <div className="office-task-chip-body">
                  <div className="office-task-chip-title">{task.title}</div>
                  <div className="office-task-chip-meta">
                    <span>
                      {assignedAgent ? `👤 ${assignedAgent.name}` : 'Unassigned'}
                    </span>
                    <span>&middot;</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Quick Add Button or Input */}
      {isQuickAdding ? (
        <form onSubmit={handleQuickAdd} style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Quick task title..."
            autoFocus
            style={{
              height: 28,
              padding: '0 8px',
              fontSize: 11,
              background: 'var(--office-bg-input)',
              border: '1px solid var(--office-border-medium)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
              width: 170
            }}
          />
          <button type="submit" className="office-btn primary" style={{ height: 28, padding: '0 8px' }}>
            Add
          </button>
          <button
            type="button"
            className="office-btn"
            onClick={() => setIsQuickAdding(false)}
            style={{ height: 28, padding: '0 6px' }}
          >
            ✕
          </button>
        </form>
      ) : (
        <button
          className="office-btn"
          onClick={() => setIsQuickAdding(true)}
          style={{ flexShrink: 0, height: 32, fontSize: 11 }}
          title="Quick add a new task to backlog"
        >
          <Plus size={12} />
          <span>New Ticket</span>
        </button>
      )}
    </div>
  )
}
