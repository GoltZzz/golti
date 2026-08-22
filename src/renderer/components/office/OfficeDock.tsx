import React, { useEffect, useState } from 'react'
import { Users, User, CheckSquare, Activity } from 'lucide-react'
import { useOfficeStore } from '../../stores/officeStore'
import { RosterPanel } from './dock/RosterPanel'
import { AgentPanel } from './dock/AgentPanel'
import { TasksPanel } from './dock/TasksPanel'
import { FeedPanel } from './dock/FeedPanel'

export type DockTabId = 'roster' | 'agent' | 'tasks' | 'feed'

interface DockTabDef {
  id: DockTabId
  label: string
  icon: React.ElementType
}

const DOCK_TABS: DockTabDef[] = [
  { id: 'roster', label: 'Roster', icon: Users },
  { id: 'agent', label: 'Agent', icon: User },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'feed', label: 'Feed', icon: Activity }
]

export const OfficeDock: React.FC = () => {
  const agents = useOfficeStore((s) => s.agents)
  const tasks = useOfficeStore((s) => s.tasks)
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId)
  const setSelectedAgentId = useOfficeStore((s) => s.setSelectedAgentId)

  const [activeTab, setActiveTab] = useState<DockTabId>('roster')

  // When an agent is selected from the floor or elsewhere, automatically switch to Agent tab
  useEffect(() => {
    if (selectedAgentId) {
      setActiveTab('agent')
    }
  }, [selectedAgentId])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  const handleSelectFromRoster = (agentId: string) => {
    setSelectedAgentId(agentId)
    setActiveTab('agent')
  }

  return (
    <aside className="office-dock" aria-label="Office Studio Dock">
      {/* 1. Dock Persistent Navigation Tabs */}
      <div className="office-dock-tabs" role="tablist" aria-label="Studio Dock Tabs">
        {DOCK_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              role="tab"
              id={`office-dock-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`office-dock-panel-${tab.id}`}
              className={`office-dock-tab-btn ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
              {tab.id === 'tasks' && tasks.length > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '0 4px',
                    borderRadius: 6,
                    marginLeft: -2
                  }}
                >
                  {tasks.filter((t) => t.status === 'in_progress').length || tasks.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 2. Dock Panels Content */}
      <div
        id={`office-dock-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`office-dock-tab-${activeTab}`}
        className="office-dock-panel"
      >
        {activeTab === 'roster' && (
          <RosterPanel
            agents={agents}
            tasks={tasks}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectFromRoster}
          />
        )}

        {activeTab === 'agent' && (
          <AgentPanel
            agent={selectedAgent}
            agents={agents}
            tasks={tasks}
            onSelectAgent={setSelectedAgentId}
          />
        )}

        {activeTab === 'tasks' && <TasksPanel />}

        {activeTab === 'feed' && (
          <FeedPanel
            agents={agents}
            tasks={tasks}
            onSelectAgent={handleSelectFromRoster}
          />
        )}
      </div>
    </aside>
  )
}
