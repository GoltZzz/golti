import React, { useEffect, useState } from 'react'
import { Cpu, HardDrive, Circle } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { SystemInfo } from '../../../shared/types'

export const StatusBar: React.FC = () => {
  const { selectedModel, isGenerating } = useChatStore()
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    window.goltiAPI.getSystemInfo().then(setSysInfo).catch(console.error)
  }, [])

  return (
    <footer style={{
      height: 'var(--height-statusbar)',
      backgroundColor: 'var(--bg-titlebar)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--space-4)',
      fontSize: '11px',
      color: 'var(--text-muted)',
      userSelect: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Circle size={8} fill={isGenerating ? '#e5c07b' : '#98c379'} color="transparent" />
          <span>{isGenerating ? 'Generating response...' : 'Ready'}</span>
        </div>

        {selectedModel && (
          <div style={{ color: 'var(--text-secondary)' }}>
            Model: <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>{selectedModel.name}</span> ({selectedModel.providerType})
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {sysInfo && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Cpu size={12} />
              <span>{sysInfo.cpuModel.split(' ')[0]}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <HardDrive size={12} />
              <span>{sysInfo.freeRamGB} GB / {sysInfo.totalRamGB} GB RAM Free</span>
            </div>
          </>
        )}
      </div>
    </footer>
  )
}
