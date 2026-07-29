import React from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { StatusBar } from './components/layout/StatusBar'
import { ChatView } from './components/chat/ChatView'
import { SettingsView } from './components/settings/SettingsView'
import { PlaceholderView } from './components/modules/PlaceholderView'
import { CookbookView } from './components/cookbook/CookbookView'
import { MemorySettings } from './components/settings/MemorySettings'
import { useSidebarStore } from './stores/sidebarStore'
import { useMemoryStore } from './stores/memoryStore'
import { useSkillStore } from './stores/skillStore'
import type { Memory, Skill } from '../shared/types'

export const App: React.FC = () => {
  const { activeTab } = useSidebarStore()
  const addSavedMemories = useMemoryStore((s) => s.addSavedMemories)
  const upsertSkill = useSkillStore((s) => s.upsertSkill)

  React.useEffect(() => {
    return window.goltiAPI.onMemorySaved((memories: Memory[]) => addSavedMemories(memories))
  }, [addSavedMemories])

  React.useEffect(() => {
    return window.goltiAPI.onSkillSaved((skill: Skill) => upsertSkill(skill))
  }, [upsertSkill])

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatView />
      case 'settings':
        return <SettingsView />
      case 'cookbook':
        return <CookbookView />
      case 'memory':
        return (
          <div
            style={{
              height: '100%',
              overflowY: 'auto',
              backgroundColor: 'var(--bg-app)',
              padding: 'var(--space-6)'
            }}
          >
            <MemorySettings />
          </div>
        )
      default:
        return <PlaceholderView tab={activeTab} />
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: 'var(--bg-app)'
    }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
          {renderContent()}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
