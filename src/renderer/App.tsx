import React from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { StatusBar } from './components/layout/StatusBar'
import { ChatView } from './components/chat/ChatView'
import { SettingsView } from './components/settings/SettingsView'
import { PlaceholderView } from './components/modules/PlaceholderView'
import { CookbookView } from './components/cookbook/CookbookView'
import { useSidebarStore } from './stores/sidebarStore'

export const App: React.FC = () => {
  const { activeTab } = useSidebarStore()

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatView />
      case 'settings':
        return <SettingsView />
      case 'cookbook':
        return <CookbookView />
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
