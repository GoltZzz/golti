import React from 'react'
import { Brain, Wrench, MessageSquare, Info, AlertTriangle, CheckCircle2, ListPlus } from 'lucide-react'
import { OfficeAgent, OfficeTask, AgentLogEntry } from '../../../../shared/types'

type FeedKind = AgentLogEntry['type'] | 'task_created' | 'task_completed'

export interface FeedEntry {
  id: string
  timestamp: number
  agentId?: string
  agentName: string
  kind: FeedKind
  content: string
}

const KIND_META: Record<FeedKind, { icon: React.ElementType; color: string; label: string }> = {
  thought: { icon: Brain, color: 'var(--accent-yellow)', label: 'Thought' },
  tool_call: { icon: Wrench, color: 'var(--accent-blue)', label: 'Tool call' },
  message: { icon: MessageSquare, color: 'var(--accent-purple)', label: 'Message' },
  system: { icon: Info, color: 'var(--text-muted)', label: 'System' },
  error: { icon: AlertTriangle, color: 'var(--status-error)', label: 'Error' },
  success: { icon: CheckCircle2, color: 'var(--status-success)', label: 'Success' },
  task_created: { icon: ListPlus, color: 'var(--accent-blue)', label: 'Task created' },
  task_completed: { icon: CheckCircle2, color: 'var(--status-success)', label: 'Task completed' }
}

export function buildActivityFeed(agents: OfficeAgent[], tasks: OfficeTask[]): FeedEntry[] {
  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? 'Blackboard'

  const logEntries: FeedEntry[] = agents.flatMap((agent) =>
    agent.logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      agentId: agent.id,
      agentName: agent.name,
      kind: log.type,
      content: log.content
    }))
  )

  const taskEntries: FeedEntry[] = tasks.flatMap((task) => {
    const entries: FeedEntry[] = [
      {
        id: `task-created-${task.id}`,
        timestamp: task.createdAt,
        agentId: task.assignedAgentId,
        agentName: agentName(task.assignedAgentId),
        kind: 'task_created',
        content: `Task queued: "${task.title}"`
      }
    ]
    if (task.completedAt) {
      entries.push({
        id: `task-completed-${task.id}`,
        timestamp: task.completedAt,
        agentId: task.assignedAgentId,
        agentName: agentName(task.assignedAgentId),
        kind: 'task_completed',
        content: `Task completed: "${task.title}"`
      })
    }
    return entries
  })

  return [...logEntries, ...taskEntries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 150)
}

interface FeedPanelProps {
  agents: OfficeAgent[]
  tasks: OfficeTask[]
  onSelectAgent: (id: string) => void
}

export const FeedPanel: React.FC<FeedPanelProps> = ({
  agents,
  tasks,
  onSelectAgent
}) => {
  const entries = buildActivityFeed(agents, tasks)

  if (entries.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
        Nothing has happened yet. Directives and task progress will log here in real-time.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }} role="list">
      {entries.map((entry) => {
        const meta = KIND_META[entry.kind]
        const Icon = meta.icon
        const time = new Date(entry.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })

        return (
          <div
            key={entry.id}
            role="listitem"
            style={{
              padding: '6px 8px',
              background: 'var(--office-bg-card)',
              border: '1px solid var(--office-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              cursor: entry.agentId ? 'pointer' : 'default'
            }}
            onClick={() => {
              if (entry.agentId) onSelectAgent(entry.agentId)
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9 }}>
              <span style={{ color: 'var(--text-muted)' }}>{time}</span>
              <span style={{ color: meta.color, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Icon size={10} />
                <span>{meta.label}</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                {entry.agentName}:
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-word', flex: 1 }}>
                {entry.content}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
