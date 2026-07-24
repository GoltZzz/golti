import React, { useEffect, useState } from 'react'
import { Minus, Square, X, Monitor } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { EggLogo } from '../brand/EggLogo'

export const TitleBar: React.FC = () => {
  const [detectedPlatform, setDetectedPlatform] = useState<'darwin' | 'win32' | 'linux'>('darwin')
  const { settings, fetchSettings, updateSettings } = useSettingsStore()

  useEffect(() => {
    fetchSettings()
    if (window.goltiAPI?.getPlatform) {
      window.goltiAPI.getPlatform().then((p: 'darwin' | 'win32' | 'linux') => {
        if (p) setDetectedPlatform(p)
      }).catch(() => {})
    }
  }, [])

  const effectiveOS = (settings?.osPlatformOverride && settings.osPlatformOverride !== 'auto')
    ? settings.osPlatformOverride
    : detectedPlatform

  const isMac = effectiveOS === 'darwin'
  const isWin = effectiveOS === 'win32'
  const isLinux = effectiveOS === 'linux'

  const handleControl = (action: 'minimize' | 'maximize' | 'close') => {
    window.goltiAPI.windowControl(action)
  }

  const cycleOSOverride = () => {
    const modes: Array<'auto' | 'darwin' | 'win32' | 'linux'> = ['auto', 'darwin', 'win32', 'linux']
    const currentIndex = modes.indexOf(settings?.osPlatformOverride || 'auto')
    const nextMode = modes[(currentIndex + 1) % modes.length]
    updateSettings({ osPlatformOverride: nextMode })
  }

  const osLabel = effectiveOS === 'darwin' ? 'macOS' : effectiveOS === 'win32' ? 'Windows' : 'Linux'

  return (
    <div
      style={{
        height: 'var(--height-titlebar)',
        backgroundColor: 'var(--bg-titlebar)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: isMac ? '76px' : 'var(--space-4)',
        paddingRight: isMac ? 'var(--space-4)' : 'var(--space-2)',
        zIndex: 1000,
        userSelect: 'none'
      }}
      className="drag-region"
    >
      {/* Title & Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-primary)' }}>
        <EggLogo size={14} title="Golti" />
        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
          GOLTI
        </span>

        {/* OS Platform Badge & Dev Toggle */}
        <button
          onClick={cycleOSOverride}
          title={`Active OS layout: ${osLabel} (${settings?.osPlatformOverride && settings.osPlatformOverride !== 'auto' ? 'Override active' : 'Auto detected'}). Click to cycle preview.`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-subtle)',
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
          className="no-drag"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <Monitor size={10} />
          <span>{osLabel}</span>
          {settings?.osPlatformOverride && settings.osPlatformOverride !== 'auto' && (
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>• dev</span>
          )}
        </button>
      </div>

      {/* OS-Dependent Window Controls */}
      {!isMac && (
        <div style={{ display: 'flex', alignItems: 'center', gap: isLinux ? '6px' : '2px' }} className="no-drag">
          {isWin && (
            <>
              <button
                onClick={() => handleControl('minimize')}
                title="Minimize"
                style={{
                  width: '32px',
                  height: '26px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '2px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Minus size={13} />
              </button>
              <button
                onClick={() => handleControl('maximize')}
                title="Maximize / Restore"
                style={{
                  width: '32px',
                  height: '26px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '2px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Square size={11} />
              </button>
              <button
                onClick={() => handleControl('close')}
                title="Close"
                style={{
                  width: '36px',
                  height: '26px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '2px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e81123'
                  e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                <X size={14} />
              </button>
            </>
          )}

          {isLinux && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
              <button
                onClick={() => handleControl('minimize')}
                title="Minimize"
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
              >
                <Minus size={11} />
              </button>
              <button
                onClick={() => handleControl('maximize')}
                title="Maximize"
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
              >
                <Square size={9} />
              </button>
              <button
                onClick={() => handleControl('close')}
                title="Close"
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(239, 68, 68, 0.4)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444'
                  e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'
                  e.currentTarget.style.color = '#ef4444'
                }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
