import React, { useState, useRef, useEffect } from 'react'
import {
  Coffee,
  Square,
  Trash2,
  Undo2,
  Send,
  MessageSquare,
  Sparkles,
  ArrowDown,
  X,
  ChevronDown,
  CheckCircle2,
  Brain,
  Wrench,
  Award,
  Zap
} from 'lucide-react'
import { useOfficeStore, getResearchStepsForAgent, isAgentRunning } from '../../../stores/officeStore'
import { useSkillStore } from '../../../stores/skillStore'
import { useSidebarStore } from '../../../stores/sidebarStore'
import { useChatStore } from '../../../stores/chatStore'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { ACHIEVEMENTS } from '../../../../shared/office-achievements'
import { OfficeAgent, OfficeTask, Skill } from '../../../../shared/types'
import { CharacterSprite } from '../AgentAvatar'

type SubTabId = 'stream' | 'tasks' | 'log' | 'memory'

const SUBTABS: { id: SubTabId; label: string }[] = [
  { id: 'stream', label: 'Stream' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'log', label: 'Log' },
  { id: 'memory', label: 'Stats & XP' }
]

const QUICK_DIRECTIVES = [
  'Review latest changes and write unit tests.',
  'Research architectural memory optimization tradeoffs.',
  'Draft the next steps on open backlog tickets.'
]

interface AgentPanelProps {
  agent: OfficeAgent | undefined
  agents: OfficeAgent[]
  tasks: OfficeTask[]
  onSelectAgent: (id: string | null) => void
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  agent,
  agents,
  tasks,
  onSelectAgent
}) => {
  const updateAgent = useOfficeStore((s) => s.updateAgent)
  const sendAgentToCoffee = useOfficeStore((s) => s.sendAgentToCoffee)
  const returnAgentToDesk = useOfficeStore((s) => s.returnAgentToDesk)
  const sendDirectMessageToAgent = useOfficeStore((s) => s.sendDirectMessageToAgent)
  const dismissAgent = useOfficeStore((s) => s.dismissAgent)
  const stopAgent = useOfficeStore((s) => s.stopAgent)
  const runTask = useOfficeStore((s) => s.runTask)

  const { skills } = useSkillStore()
  const setAppTab = useSidebarStore((s) => s.setActiveTab)
  const selectConversation = useChatStore((s) => s.selectConversation)

  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('stream')
  const [promptInput, setPromptInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const directiveInputRef = useRef<HTMLInputElement>(null)
  const reducedMotion = useReducedMotion()

  if (!agent) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          No Agent Selected
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          Click any agent on the isometric floor or in the Roster tab to inspect their stream, directives, and progression.
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agents.map((a) => (
            <button
              key={a.id}
              className="office-btn"
              onClick={() => onSelectAgent(a.id)}
              style={{ justifyContent: 'flex-start' }}
            >
              <span className="agent-level-tag">L{a.level}</span>
              <span>{a.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {a.roleTitle}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const running = isAgentRunning(agent.id)
  const researchSteps = getResearchStepsForAgent(agent.id)

  const openAgentThread = async (conversationId: string) => {
    setAppTab('chat')
    await selectConversation(conversationId)
  }

  const handleSendDirective = async () => {
    if (!promptInput.trim() || isSending) return
    setIsSending(true)
    const text = promptInput.trim()
    setPromptInput('')
    await sendDirectMessageToAgent(agent.id, text)
    setIsSending(false)
  }

  const xpPct = agent.xpToNextLevel > 0 ? (agent.xp / agent.xpToNextLevel) * 100 : 0
  const energyPct =
    agent.tokenBudget > 0 ? Math.max(0, 100 - (agent.tokensUsed / agent.tokenBudget) * 100) : 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* 1. Header with Identity & Actions */}
      <div className="office-agent-panel-header">
        <div style={{ width: 38, height: 48, flexShrink: 0 }}>
          <CharacterSprite agent={agent} reducedMotion={reducedMotion} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="agent-level-tag">L{agent.level}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {agent.name}
              </span>
            </div>
            <button
              onClick={() => onSelectAgent(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
              aria-label="Close inspector"
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.roleTitle}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {agent.model} &middot; {agent.providerId}
          </div>
        </div>
      </div>

      {/* 2. Control Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {agent.status === 'break' ? (
          <button className="office-btn" onClick={() => returnAgentToDesk(agent.id)}>
            <Undo2 size={11} /> Return to Desk
          </button>
        ) : (
          <button className="office-btn" onClick={() => sendAgentToCoffee(agent.id)}>
            <Coffee size={11} /> Coffee Break
          </button>
        )}

        {running && (
          <button className="office-btn is-danger" onClick={() => stopAgent(agent.id)}>
            <Square size={11} /> Stop Run
          </button>
        )}

        <button
          className="office-btn"
          onClick={() => {
            setActiveSubTab('stream')
            requestAnimationFrame(() => directiveInputRef.current?.focus())
          }}
        >
          <MessageSquare size={11} /> Directive
        </button>

        <button
          className="office-btn is-danger icon-only"
          onClick={() => {
            if (confirm(`Dismiss ${agent.name} from the office roster?`)) dismissAgent(agent.id)
          }}
          title={`Dismiss ${agent.name}`}
          aria-label={`Dismiss ${agent.name}`}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 3. Subtabs Bar */}
      <div className="office-agent-subtabs" role="tablist">
        {SUBTABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeSubTab === tab.id}
            className={`office-agent-subtab-btn ${activeSubTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Subtab Panels */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {activeSubTab === 'stream' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
            {/* Research plan steps */}
            {researchSteps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {researchSteps.map((step) => (
                  <div
                    key={step.stepIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      padding: '3px 6px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--office-border-subtle)'
                    }}
                  >
                    <span>{step.stepIndex}/{step.totalSteps}: {step.query}</span>
                    <span style={{ color: step.status === 'done' ? 'var(--status-success)' : 'var(--accent-yellow)' }}>
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Stream Logs */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agent.logs.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>
                  No live stream output yet. Send a directive below to start work.
                </div>
              ) : (
                [...agent.logs].reverse().map((log) => (
                  <div
                    key={log.id}
                    style={{
                      fontSize: 11,
                      padding: '6px 8px',
                      background: 'var(--office-bg-card)',
                      borderRadius: 'var(--radius-xs)',
                      borderLeft: `2px solid ${
                        log.type === 'thought'
                          ? 'var(--accent-yellow)'
                          : log.type === 'tool_call'
                          ? 'var(--accent-blue)'
                          : log.type === 'success'
                          ? 'var(--status-success)'
                          : log.type === 'error'
                          ? 'var(--status-error)'
                          : 'var(--text-muted)'
                      }`
                    }}
                  >
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
                      {new Date(log.timestamp).toLocaleTimeString()} &middot; {log.type.toUpperCase()}
                    </div>
                    <div style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{log.content}</div>
                  </div>
                ))
              )}
            </div>

            {/* Directives Footer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
              {agent.conversationId && (
                <button
                  className="office-btn"
                  onClick={() => openAgentThread(agent.conversationId!)}
                  style={{ justifyContent: 'center' }}
                >
                  <MessageSquare size={12} /> Open thread in Chat
                </button>
              )}

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {QUICK_DIRECTIVES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="office-btn"
                    style={{ fontSize: 10, padding: '2px 6px', height: 22 }}
                    onClick={() => setPromptInput(d)}
                  >
                    <Sparkles size={9} color="var(--accent-yellow)" /> {d.slice(0, 30)}…
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={directiveInputRef}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendDirective()
                    }
                  }}
                  placeholder={`Instruct ${agent.name}...`}
                  style={{
                    flex: 1,
                    background: 'var(--office-bg-input)',
                    border: '1px solid var(--office-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-primary)',
                    padding: '0 8px',
                    fontSize: 11,
                    height: 28
                  }}
                />
                <button
                  className="office-btn primary"
                  onClick={handleSendDirective}
                  disabled={isSending || !promptInput.trim()}
                >
                  <Send size={11} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks
              .filter((t) => t.assignedAgentId === agent.id)
              .map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: 8,
                    background: 'var(--office-bg-card)',
                    border: '1px solid var(--office-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--accent-blue)' }}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{task.priority}</span>
                  </div>
                  {task.status === 'backlog' && (
                    <button className="office-btn" onClick={() => runTask(task.id, agent.id)}>
                      Run Task
                    </button>
                  )}
                  {task.status === 'in_progress' && task.generationId && (
                    <button className="office-btn is-danger" onClick={() => stopAgent(agent.id)}>
                      Stop Run
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}

        {activeSubTab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {agent.logs.map((log) => (
              <div
                key={log.id}
                style={{
                  fontSize: 10,
                  padding: '5px 8px',
                  background: 'var(--office-bg-card)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
                <div>{log.content}</div>
              </div>
            ))}
          </div>
        )}

        {activeSubTab === 'memory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* XP & Level Progress */}
            <div style={{ padding: 10, background: 'var(--office-bg-card)', borderRadius: 'var(--radius-xs)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-yellow)' }}>Level {agent.level} Progression</span>
                <span style={{ color: 'var(--text-muted)' }}>{agent.xp} / {agent.xpToNextLevel} XP</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, xpPct)}%`, background: 'var(--accent-yellow)' }} />
              </div>
            </div>

            {/* Token Budget Gauge */}
            <div style={{ padding: 10, background: 'var(--office-bg-card)', borderRadius: 'var(--radius-xs)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>Token Budget</span>
                <span style={{ color: 'var(--text-muted)' }}>{Math.round(energyPct)}% Remaining</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${energyPct}%`,
                    background: energyPct < 20 ? 'var(--status-error)' : 'var(--accent-green)'
                  }}
                />
              </div>
            </div>

            {/* Stats Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              <div style={{ padding: 8, background: 'var(--office-bg-card)', borderRadius: 'var(--radius-xs)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Tasks Done</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--status-success)' }}>{agent.stats.tasksCompleted}</div>
              </div>
              <div style={{ padding: 8, background: 'var(--office-bg-card)', borderRadius: 'var(--radius-xs)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Messages</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-blue)' }}>{agent.stats.messagesSent}</div>
              </div>
              <div style={{ padding: 8, background: 'var(--office-bg-card)', borderRadius: 'var(--radius-xs)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Tool Calls</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-purple)' }}>{agent.stats.toolCallsCount}</div>
              </div>
              <div style={{ padding: 8, background: 'var(--office-bg-card)', borderRadius: 'var(--radius-xs)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coffee Breaks</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-yellow)' }}>{agent.stats.coffeeBreaksCount}</div>
              </div>
            </div>

            {/* Achievements Grid */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Achievements ({agent.unlockedAchievements.length}/{ACHIEVEMENTS.length})
              </div>
              <div className="office-achievement-grid">
                {ACHIEVEMENTS.map((ach) => {
                  const unlocked = agent.unlockedAchievements.includes(ach.key)
                  return (
                    <div
                      key={ach.key}
                      className={`office-achievement-card ${unlocked ? '' : 'is-locked'}`}
                      title={ach.description}
                    >
                      <span style={{ fontSize: 16 }}>{ach.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ach.name}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ach.description}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Skills & Configuration */}
            <details style={{ fontSize: 11 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Persona & Skill Config
              </summary>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Model</label>
                <input
                  value={agent.model}
                  onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                  style={{
                    background: 'var(--office-bg-input)',
                    border: '1px solid var(--office-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-primary)',
                    padding: '4px 8px',
                    fontSize: 11
                  }}
                />

                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>System Persona</label>
                <textarea
                  value={agent.systemPrompt}
                  onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
                  rows={4}
                  style={{
                    background: 'var(--office-bg-input)',
                    border: '1px solid var(--office-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-primary)',
                    padding: '4px 8px',
                    fontSize: 11,
                    resize: 'vertical'
                  }}
                />
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
