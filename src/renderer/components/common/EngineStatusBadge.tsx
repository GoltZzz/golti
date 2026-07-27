import React, { useState } from 'react'
import {
  Zap,
  ZapOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Square,
  Play,
  Terminal,
  Download,
  RotateCcw,
  X,
  Copy,
  Check
} from 'lucide-react'
import { EngineState } from '../../../shared/types'

interface EngineStatusBadgeProps {
  engineState: EngineState
  isInstallingBinary?: boolean
  onInstall?: () => void
  onReinstall?: () => void
  onStart?: () => void
  onStop?: () => void
  compact?: boolean
  showQuickActions?: boolean
  style?: React.CSSProperties
}

export const EngineStatusBadge: React.FC<EngineStatusBadgeProps> = ({
  engineState,
  isInstallingBinary = false,
  onInstall,
  onReinstall,
  onStart,
  onStop,
  compact = false,
  showQuickActions = true,
  style
}) => {
  const [showLogModal, setShowLogModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const status = engineState.status
  const activeModelName = engineState.loadedModel ? engineState.loadedModel.split(/[\/\\]/).pop() : null
  const errorText = engineState.error || engineState.lastLogs

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return '#98c379'
      case 'starting':
      case 'downloading':
        return '#61afef'
      case 'error':
        return '#e06c75'
      case 'stopped':
        return '#e5c07b'
      case 'not-installed':
      default:
        return 'var(--text-muted)'
    }
  }

  const getStatusBg = () => {
    switch (status) {
      case 'running':
        return 'rgba(152, 195, 121, 0.1)'
      case 'starting':
      case 'downloading':
        return 'rgba(97, 175, 239, 0.1)'
      case 'error':
        return 'rgba(224, 108, 117, 0.12)'
      case 'stopped':
        return 'rgba(229, 192, 123, 0.1)'
      case 'not-installed':
      default:
        return 'rgba(255, 255, 255, 0.05)'
    }
  }

  const getStatusBorder = () => {
    switch (status) {
      case 'running':
        return '1px solid rgba(152, 195, 121, 0.3)'
      case 'starting':
      case 'downloading':
        return '1px solid rgba(97, 175, 239, 0.3)'
      case 'error':
        return '1px solid rgba(224, 108, 117, 0.35)'
      case 'stopped':
        return '1px solid rgba(229, 192, 123, 0.3)'
      case 'not-installed':
      default:
        return '1px solid var(--border-subtle)'
    }
  }

  const handleCopyLogs = () => {
    if (!errorText) return
    navigator.clipboard.writeText(errorText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (compact) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          borderRadius: '12px',
          backgroundColor: getStatusBg(),
          border: getStatusBorder(),
          fontSize: '11px',
          color: getStatusColor(),
          fontWeight: 500,
          ...style
        }}
        title={`Golti Engine Status: ${status}${activeModelName ? ` (Model: ${activeModelName})` : ''}${engineState.error ? ` - ${engineState.error}` : ''}`}
      >
        {status === 'running' ? (
          <CheckCircle2 size={12} />
        ) : status === 'starting' || status === 'downloading' ? (
          <RefreshCw size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
        ) : status === 'error' ? (
          <AlertTriangle size={12} />
        ) : status === 'stopped' ? (
          <Zap size={12} />
        ) : (
          <ZapOff size={12} />
        )}
        <span style={{ textTransform: 'capitalize' }}>
          Engine: {status === 'not-installed' ? 'Not Installed' : status}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backgroundColor: getStatusBg(),
        border: getStatusBorder(),
        borderRadius: '8px',
        padding: '14px 16px',
        transition: 'all 0.2s ease',
        ...style
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: getStatusColor()
            }}
          >
            {status === 'running' ? (
              <Zap size={20} />
            ) : status === 'starting' || status === 'downloading' ? (
              <RefreshCw size={20} style={{ animation: 'spin 1.5s linear infinite' }} />
            ) : status === 'error' ? (
              <AlertTriangle size={20} />
            ) : status === 'stopped' ? (
              <Zap size={20} />
            ) : (
              <ZapOff size={20} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Golti Engine (Built-in Local AI)
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  color: getStatusColor(),
                  border: `1px solid ${getStatusColor()}`
                }}
              >
                {status === 'not-installed'
                  ? 'NOT INSTALLED'
                  : status === 'stopped'
                  ? 'STOPPED'
                  : status === 'starting' || status === 'downloading'
                  ? 'STARTING...'
                  : status === 'running'
                  ? 'RUNNING'
                  : 'ERROR'}
              </span>
            </div>

            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {status === 'running'
                ? `Port: ${engineState.port || 8391} ${engineState.pid ? `• PID: ${engineState.pid}` : ''} ${activeModelName ? `• Loaded: ${activeModelName}` : '• No model loaded'}`
                : status === 'not-installed'
                ? 'Runs local GGUF models directly on your hardware without terminal setup or external dependencies.'
                : status === 'stopped'
                ? 'Engine binary installed and ready. Start process or select a GGUF model in Chat.'
                : status === 'starting' || status === 'downloading'
                ? 'Initializing llama-server process...'
                : engineState.error || 'The engine process encountered an error.'}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        {showQuickActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {status === 'not-installed' && onInstall && (
              <button
                onClick={onInstall}
                disabled={isInstallingBinary}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#e5c07b',
                  color: '#1e1e1e',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: isInstallingBinary ? 'not-allowed' : 'pointer'
                }}
              >
                <Download size={14} />
                {isInstallingBinary ? 'Installing Engine...' : '1-Click Install Engine'}
              </button>
            )}

            {status === 'stopped' && (
              <>
                {onStart && (
                  <button
                    onClick={onStart}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Play size={14} /> Start Engine
                  </button>
                )}
                {onReinstall && (
                  <button
                    onClick={onReinstall}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={12} /> Reinstall
                  </button>
                )}
              </>
            )}

            {status === 'running' && onStop && (
              <button
                onClick={onStop}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(224, 108, 117, 0.15)',
                  color: '#e06c75',
                  border: '1px solid rgba(224, 108, 117, 0.3)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <Square size={14} /> Stop Engine
              </button>
            )}

            {status === 'error' && (
              <>
                {errorText && (
                  <button
                    onClick={() => setShowLogModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontWeight: 500,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Terminal size={14} /> View Error Logs
                  </button>
                )}
                {onStart && (
                  <button
                    onClick={onStart}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={14} /> Restart Engine
                  </button>
                )}
                {onReinstall && (
                  <button
                    onClick={onReinstall}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(229, 192, 123, 0.15)',
                      color: '#e5c07b',
                      border: '1px solid rgba(229, 192, 123, 0.3)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontWeight: 500,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={14} /> Reinstall Binary
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* GPU acceleration pill if running */}
      {status === 'running' && (engineState.gpuDevice || engineState.gpuLayers !== undefined) && (
        <div
          style={{
            fontSize: '11px',
            color: engineState.gpuLayers === 0 ? 'var(--text-muted)' : '#98c379',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          <span>
            {engineState.gpuLayers === 0
              ? 'CPU Mode (No GPU offloading)'
              : `GPU Acceleration · ${engineState.gpuDevice || engineState.backend || 'Discrete GPU'}`}
          </span>
          {engineState.gpuLayers && engineState.gpuLayers > 0 && <span>• {engineState.gpuLayers} layers offloaded</span>}
          {engineState.fellBackToCpu && <span style={{ color: '#e5c07b' }}>• Fell back to CPU to fit VRAM</span>}
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setShowLogModal(false)}
        >
          <div
            style={{
              width: '640px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={16} style={{ color: '#e06c75' }} />
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Golti Engine Diagnostic Log</h3>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                padding: '16px',
                flex: 1,
                overflowY: 'auto',
                backgroundColor: '#16181d',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '12px',
                lineHeight: 1.5,
                color: '#abb2bf',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {errorText || 'No diagnostic log lines captured.'}
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
              }}
            >
              <button
                onClick={handleCopyLogs}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {copied ? <Check size={14} style={{ color: '#98c379' }} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy Logs'}
              </button>
              <button
                onClick={() => setShowLogModal(false)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
