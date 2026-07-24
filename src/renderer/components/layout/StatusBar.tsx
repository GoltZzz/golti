import React, { useEffect, useState } from 'react'
import { Cpu, HardDrive, Circle, Zap, Globe } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useEngineStore } from '../../stores/engineStore'
import { useSearchRuntimeStore } from '../../stores/searchRuntimeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { EngineStatusBadge } from '../common/EngineStatusBadge'
import { SystemInfo } from '../../../shared/types'

export const StatusBar: React.FC = () => {
  const { selectedModel, isGenerating, tokenBudget, webSearchEnabled } = useChatStore()
  const { engineState, setupListeners: setupEngineListeners, fetchStatus: fetchEngineStatus } = useEngineStore()
  const { runtimeState, progress, setupListeners } = useSearchRuntimeStore()
  const { settings, fetchSettings } = useSettingsStore()
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    fetchSettings()
    fetchEngineStatus()
    window.goltiAPI.getSystemInfo().then(setSysInfo).catch(console.error)
  }, [])

  useEffect(() => setupListeners(), [setupListeners])
  useEffect(() => setupEngineListeners(), [setupEngineListeners])

  const showSearchStatus =
    webSearchEnabled &&
    (runtimeState.status === 'downloading' ||
      runtimeState.status === 'starting' ||
      runtimeState.status === 'error' ||
      (progress && progress.percent < 100))

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

        {tokenBudget && (
          <div style={{ fontFamily: 'var(--font-mono)', color: tokenBudget.overflow ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
            Tokens: {tokenBudget.usedTokens}/{tokenBudget.contextWindow}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {settings?.engineEnabled !== false && (
          <EngineStatusBadge engineState={engineState} compact />
        )}

        {showSearchStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: runtimeState.status === 'error' ? 'var(--accent-primary)' : '#61afef'
            }}
          >
            <Globe size={12} />
            <span>
              Web Search:{' '}
              {runtimeState.status === 'downloading'
                ? `setup ${progress?.percent ?? 0}%`
                : runtimeState.status === 'starting'
                  ? 'starting'
                  : runtimeState.status === 'error'
                    ? 'needs attention'
                    : runtimeState.status}
            </span>
          </div>
        )}

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

