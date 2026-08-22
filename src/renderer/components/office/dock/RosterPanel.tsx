import React from 'react'
import { Crown, Code2, Search, ShieldCheck, Terminal, Bot, Zap, Coffee, Brain, AlertTriangle } from 'lucide-react'
import { OfficeAgent, OfficeTask, AgentRole } from '../../../../shared/types'
import { CharacterSprite } from '../AgentAvatar'

interface RosterPanelProps {
  agents: OfficeAgent[]
  tasks: OfficeTask[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
}

const ROLE_ICON_MAP: Record<AgentRole, React.ElementType> = {
  orchestrator: Crown,
  coder: Code2,
  researcher: Search,
  reviewer: ShieldCheck,
  devops: Terminal,
  custom: Bot
}

const ZONE_LABELS: Record<string, string> = {
  bullpen: 'Engineering & QA Bullpen',
  research: 'Deep Research Lab',
  server: 'DevOps & Engine Room',
  lounge: 'Espresso Lounge',
  war_room: 'War Room'
}

export const RosterPanel: React.FC<RosterPanelProps> = ({
  agents,
  tasks,
  selectedAgentId,
  onSelectAgent
}) => {
  const orchestrator = agents.find((a) => a.role === 'orchestrator')
  const otherAgents = agents.filter((a) => a.role !== 'orchestrator')

  // Group non-orchestrator agents by zone or role
  const groupsByZone = otherAgents.reduce<Record<string, OfficeAgent[]>>((acc, agent) => {
    let zoneKey = 'bullpen'
    if (agent.role === 'researcher') zoneKey = 'research'
    else if (agent.role === 'devops') zoneKey = 'server'
    else if (agent.role === 'reviewer' || agent.role === 'coder') zoneKey = 'bullpen'
    else zoneKey = 'bullpen'

    if (!acc[zoneKey]) acc[zoneKey] = []
    acc[zoneKey].push(agent)
    return acc
  }, {})

  return (
    <div className="office-org-chart" role="list" aria-label="Studio agent roster org chart">
      {/* 1. Studio Orchestrator at Top */}
      {orchestrator && (
        <div
          role="listitem"
          className={`office-org-leader-card ${selectedAgentId === orchestrator.id ? 'is-selected' : ''}`}
          onClick={() => onSelectAgent(orchestrator.id)}
        >
          <div style={{ width: 36, height: 44, flexShrink: 0 }}>
            <CharacterSprite agent={orchestrator} reducedMotion />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="agent-level-tag">L{orchestrator.level}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {orchestrator.name}
              </span>
              <Crown size={12} color="var(--accent-yellow)" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {orchestrator.roleTitle}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span className={`office-telemetry-pill`} style={{ height: 18, fontSize: 10, padding: '0 6px' }}>
                <span className={`status-dot-${orchestrator.status}`} style={{ width: 6, height: 6, borderRadius: '50%' }} />
                <span style={{ textTransform: 'capitalize' }}>{orchestrator.status}</span>
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {orchestrator.model}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Zone Groups */}
      {Object.entries(groupsByZone).map(([zoneKey, zoneAgents]) => (
        <div key={zoneKey} className="office-org-zone-group">
          <div className="office-org-zone-header">
            <span>{ZONE_LABELS[zoneKey] || 'Specialist Pod'}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({zoneAgents.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {zoneAgents.map((agent) => {
              const RoleIcon = ROLE_ICON_MAP[agent.role] || Bot
              const isSelected = selectedAgentId === agent.id
              const currentTask = tasks.find((t) => t.id === agent.currentTaskId)
              const usedPct = agent.tokenBudget > 0 ? (agent.tokensUsed / agent.tokenBudget) * 100 : 0

              return (
                <div
                  key={agent.id}
                  role="listitem"
                  className={`office-org-agent-row ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onSelectAgent(agent.id)}
                >
                  <div style={{ width: 28, height: 36, flexShrink: 0, overflow: 'hidden' }}>
                    <CharacterSprite agent={agent} reducedMotion />
                  </div>

                  <div className="office-org-agent-info">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="agent-level-tag">L{agent.level}</span>
                        <span className="office-org-agent-name">{agent.name}</span>
                      </div>
                      <span className={`status-dot-${agent.status}`} style={{ width: 6, height: 6, borderRadius: '50%' }} />
                    </div>

                    <div className="office-org-agent-role">
                      <RoleIcon size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} />
                      {agent.roleTitle}
                    </div>

                    {currentTask ? (
                      <div style={{ fontSize: 10, color: 'var(--accent-blue)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ⚡ {currentTask.title}
                      </div>
                    ) : null}

                    {/* Token Budget Gauge */}
                    <div style={{ height: 2, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, usedPct)}%`,
                          background: usedPct > 80 ? 'var(--status-error)' : 'var(--accent-green)'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
