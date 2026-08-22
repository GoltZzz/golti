import React, { useState } from 'react'
import {
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  UserCheck,
  Play,
  Square
} from 'lucide-react'
import { useOfficeStore } from '../../../stores/officeStore'
import { TaskPriority, TaskStatus } from '../../../../shared/types'

export const TasksPanel: React.FC = () => {
  const {
    tasks,
    agents,
    createTask,
    updateTaskStatus,
    assignTask,
    deleteTask,
    runTask,
    stopAgent
  } = useOfficeStore()

  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium')
  const [newAssignee, setNewAssignee] = useState<string>('')

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    createTask({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      priority: newPriority,
      assignedAgentId: newAssignee || undefined
    })

    setNewTitle('')
    setNewDesc('')
    setIsCreating(false)
  }

  const columns: { id: TaskStatus; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'in_progress', label: 'In Progress', icon: <AlertCircle size={12} />, color: 'var(--accent-blue)' },
    { id: 'backlog', label: 'Backlog', icon: <Clock size={12} />, color: 'var(--text-muted)' },
    { id: 'review', label: 'Review & QA', icon: <UserCheck size={12} />, color: 'var(--accent-yellow)' },
    { id: 'completed', label: 'Completed', icon: <CheckCircle2 size={12} />, color: 'var(--status-success)' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Header with New Task Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Studio Tasks Ledger
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {tasks.length} total tickets
          </div>
        </div>

        <button
          className="office-btn primary"
          onClick={() => setIsCreating((v) => !v)}
          style={{ height: 26, padding: '0 8px', fontSize: 11 }}
        >
          <Plus size={12} /> {isCreating ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {/* Inline Task Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateTask}
          style={{
            padding: 10,
            background: 'var(--office-bg-card)',
            border: '1px solid var(--office-border-medium)',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task Title..."
            autoFocus
            required
            style={{
              background: 'var(--office-bg-input)',
              border: '1px solid var(--office-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
              padding: '4px 8px',
              fontSize: 11
            }}
          />

          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description or requirements (optional)..."
            style={{
              background: 'var(--office-bg-input)',
              border: '1px solid var(--office-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
              padding: '4px 8px',
              fontSize: 11
            }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              style={{
                flex: 1,
                background: 'var(--office-bg-input)',
                border: '1px solid var(--office-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text-primary)',
                padding: '4px 6px',
                fontSize: 10
              }}
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent 🔥</option>
            </select>

            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--office-bg-input)',
                border: '1px solid var(--office-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text-primary)',
                padding: '4px 6px',
                fontSize: 10
              }}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="office-btn"
              onClick={() => setIsCreating(false)}
              style={{ height: 24, fontSize: 10 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="office-btn primary"
              style={{ height: 24, fontSize: 10 }}
            >
              Create Task
            </button>
          </div>
        </form>
      )}

      {/* Task Sections by Status */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id)
          if (colTasks.length === 0 && col.id === 'completed') return null

          return (
            <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  fontWeight: 700,
                  color: col.color,
                  paddingBottom: 2,
                  borderBottom: '1px solid var(--office-border-subtle)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {col.icon}
                  <span>{col.label}</span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    background: 'rgba(255, 255, 255, 0.06)',
                    padding: '0 5px',
                    borderRadius: 8,
                    color: 'var(--text-muted)'
                  }}
                >
                  {colTasks.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {colTasks.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>
                    No tasks in {col.label.toLowerCase()}
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const assignedAgent = agents.find((a) => a.id === task.assignedAgentId)

                    return (
                      <div
                        key={task.id}
                        style={{
                          padding: '8px 10px',
                          background: 'var(--office-bg-card)',
                          border: '1px solid var(--office-border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '1px 4px',
                              borderRadius: 2,
                              background:
                                task.priority === 'urgent'
                                  ? 'rgba(224, 108, 117, 0.2)'
                                  : task.priority === 'high'
                                  ? 'rgba(229, 192, 123, 0.2)'
                                  : 'rgba(255, 255, 255, 0.05)',
                              color:
                                task.priority === 'urgent'
                                  ? 'var(--brand)'
                                  : task.priority === 'high'
                                  ? 'var(--accent-yellow)'
                                  : 'var(--text-muted)'
                            }}
                          >
                            {task.priority}
                          </span>

                          <button
                            onClick={() => deleteTask(task.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                            title="Delete Task"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>

                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {task.title}
                        </div>

                        {task.description && (
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                            {task.description}
                          </div>
                        )}

                        {task.resultSnippet && (
                          <div
                            style={{
                              fontSize: 9,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--status-success)',
                              background: 'rgba(152, 195, 121, 0.08)',
                              padding: '3px 5px',
                              borderRadius: 2
                            }}
                          >
                            ✓ {task.resultSnippet}
                          </div>
                        )}

                        {/* Assignee & Controls */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 3,
                            paddingTop: 4,
                            borderTop: '1px solid var(--office-border-subtle)',
                            fontSize: 10
                          }}
                        >
                          {assignedAgent ? (
                            <span style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
                              👤 {assignedAgent.name}
                            </span>
                          ) : (
                            <select
                              style={{
                                fontSize: 10,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer'
                              }}
                              onChange={(e) => assignTask(task.id, e.target.value)}
                              defaultValue=""
                            >
                              <option value="" disabled>Assign agent...</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          )}

                          <div style={{ display: 'flex', gap: 4 }}>
                            {task.status === 'backlog' && assignedAgent && (
                              <button
                                className="office-btn"
                                onClick={() => runTask(task.id, assignedAgent.id)}
                                style={{ height: 20, padding: '0 5px', fontSize: 9 }}
                              >
                                <Play size={8} /> Run
                              </button>
                            )}

                            {task.status === 'in_progress' && task.generationId && assignedAgent && (
                              <button
                                className="office-btn is-danger"
                                onClick={() => stopAgent(assignedAgent.id)}
                                style={{ height: 20, padding: '0 5px', fontSize: 9 }}
                              >
                                <Square size={8} /> Stop
                              </button>
                            )}

                            {task.status === 'in_progress' && !task.generationId && (
                              <button
                                className="office-btn"
                                onClick={() => updateTaskStatus(task.id, 'review')}
                                style={{ height: 20, padding: '0 5px', fontSize: 9 }}
                              >
                                Review <ArrowRight size={8} />
                              </button>
                            )}

                            {task.status === 'review' && (
                              <button
                                className="office-btn"
                                onClick={() => updateTaskStatus(task.id, 'completed', 'Approved and completed.')}
                                style={{ height: 20, padding: '0 5px', fontSize: 9, color: 'var(--status-success)' }}
                              >
                                Done ✓
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
