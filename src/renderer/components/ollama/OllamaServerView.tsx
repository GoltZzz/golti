import React, { useEffect, useState } from 'react'
import {
  Server,
  Terminal,
  Play,
  Square,
  RefreshCw,
  Copy,
  Check,
  HardDrive,
  Cpu,
  Trash2,
  Download,
  Activity,
  Layers,
  ExternalLink,
  Code
} from 'lucide-react'
import { useOllamaProcessStore } from '../../stores/ollamaProcessStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { InstalledLocalModelInfo, OllamaRuntimeInfo } from '../../../shared/types'

export const OllamaServerView: React.FC = () => {
  const {
    processState,
    logs,
    setupListeners,
    fetchState,
    fetchLogs,
    startOllama,
    stopOllama
  } = useOllamaProcessStore()

  const [models, setModels] = useState<InstalledLocalModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [pullTag, setPullTag] = useState('')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<{ status: string; percent: number } | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'checking' | 'unreachable'>('checking')
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'models' | 'api' | 'logs'>('overview')
  const [autoScrollLogs, setAutoScrollLogs] = useState(true)
  const [gpuDevices, setGpuDevices] = useState<{ id: string; name: string; totalMiB: number | null }[]>([])
  const [runtime, setRuntime] = useState<OllamaRuntimeInfo | null>(null)

  const { settings, fetchSettings, updateSettings } = useSettingsStore()

  useEffect(() => {
    fetchSettings()
    window.goltiAPI
      .listOllamaGpuDevices()
      .then(setGpuDevices)
      .catch(() => setGpuDevices([]))
  }, [fetchSettings])

  // The device choice is applied as environment variables when we spawn
  // `ollama serve`, so a running daemon has to be restarted to pick it up.
  const applyOllamaDevice = async (device: string) => {
    await updateSettings({ ollamaDevice: device })
    if (processState.status === 'running' && !processState.isSystemProcess) {
      await stopOllama()
      await startOllama()
    }
  }

  // Poll what Ollama actually has resident while the server is up.
  useEffect(() => {
    if (processState.status !== 'running') {
      setRuntime(null)
      return
    }
    const read = () => window.goltiAPI.getOllamaRuntime().then(setRuntime).catch(() => {})
    read()
    const timer = setInterval(read, 5000)
    return () => clearInterval(timer)
  }, [processState.status])

  useEffect(() => {
    const cleanup = setupListeners()
    return () => cleanup()
  }, [setupListeners])

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      const list = await window.goltiAPI.getDetailedInstalledModels()
      setModels(list.filter((m: InstalledLocalModelInfo) => m.isOllama || m.providerType === 'ollama'))
    } catch (e) {
      console.warn('Failed to load Ollama models:', e)
    } finally {
      setLoadingModels(false)
    }
  }

  const checkHealth = async () => {
    setHealthStatus('checking')
    const port = processState.port || 11434
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/version`, {
        signal: AbortSignal.timeout(2000)
      })
      if (res.ok) {
        setHealthStatus('healthy')
      } else {
        setHealthStatus('unreachable')
      }
    } catch {
      setHealthStatus('unreachable')
    }
  }

  useEffect(() => {
    loadModels()
    checkHealth()
  }, [processState.status, processState.port])

  useEffect(() => {
    const unsub = window.goltiAPI.onPullProgress((data: any) => {
      if (data.status === 'success') {
        setIsPulling(false)
        setPullProgress(null)
        setPullTag('')
        loadModels()
      } else if (data.status === 'error') {
        setIsPulling(false)
        setPullProgress(null)
        alert(`Failed to pull model: ${data.error || 'Unknown error'}`)
      } else {
        setIsPulling(true)
        setPullProgress({
          status: data.status || 'Downloading...',
          percent: data.percent || 0
        })
      }
    })
    return () => unsub()
  }, [])

  const handlePullModel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pullTag.trim() || isPulling) return
    setIsPulling(true)
    setPullProgress({ status: 'Starting download...', percent: 0 })
    try {
      await window.goltiAPI.pullOllamaModel(pullTag.trim())
    } catch (err: any) {
      setIsPulling(false)
      setPullProgress(null)
      alert(`Error pulling model: ${err.message || String(err)}`)
    }
  }

  const handleDeleteModel = async (tag: string) => {
    if (!confirm(`Are you sure you want to delete Ollama model "${tag}"?`)) return
    const res = await window.goltiAPI.deleteOllamaModel(tag)
    if (res.success) {
      loadModels()
    } else {
      alert(res.error || 'Failed to delete model')
    }
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const hostUrl = processState.host || `http://127.0.0.1:${processState.port || 11434}`
  const portNumber = processState.port || 11434
  const binaryLocation = processState.binaryPath || 'Not Found'

  const apiSnippets = [
    {
      title: 'Generate Completion',
      desc: 'Send a prompt to an installed Ollama model via REST API',
      code: `curl ${hostUrl}/api/generate -d '{\n  "model": "${models[0]?.tag || 'llama3.2'}",\n  "prompt": "Why is the sky blue?"\n}'`
    },
    {
      title: 'Chat Completion',
      desc: 'Multi-turn chat completion request format',
      code: `curl ${hostUrl}/api/chat -d '{\n  "model": "${models[0]?.tag || 'llama3.2'}",\n  "messages": [\n    { "role": "user", "content": "Hello!" }\n  ]\n}'`
    },
    {
      title: 'List Local Models',
      desc: 'Retrieve JSON array of all models pulled locally',
      code: `curl ${hostUrl}/api/tags`
    },
    {
      title: 'Server Version Check',
      desc: 'Ping server health and installed Ollama build version',
      code: `curl ${hostUrl}/api/version`
    }
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        overflowY: 'auto'
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          padding: 'var(--space-6)',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--accent-primary-alpha)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Server size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Ollama Local Server</h1>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor:
                    processState.status === 'running'
                      ? 'rgba(152, 195, 121, 0.15)'
                      : processState.status === 'starting'
                      ? 'rgba(229, 192, 123, 0.15)'
                      : 'rgba(224, 108, 117, 0.15)',
                  color:
                    processState.status === 'running'
                      ? '#98c379'
                      : processState.status === 'starting'
                      ? '#e5c07b'
                      : '#e06c75'
                }}
              >
                ● {processState.status.toUpperCase()}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Connected via <strong style={{ color: 'var(--text-primary)' }}>{hostUrl}</strong> (Port {portNumber})
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            onClick={() => {
              fetchState()
              checkHealth()
              loadModels()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} /> Refresh
          </button>

          {processState.status === 'running' ? (
            <button
              onClick={() => stopOllama()}
              disabled={processState.needsPrivilegedStop}
              title={
                processState.needsPrivilegedStop
                  ? `Ollama runs as the system service ${processState.serviceUnit}. Stop it with: sudo systemctl stop ${processState.serviceUnit}`
                  : undefined
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: 'rgba(224, 108, 117, 0.2)',
                color: '#e06c75',
                fontSize: '13px',
                fontWeight: 600,
                cursor: processState.needsPrivilegedStop ? 'not-allowed' : 'pointer',
                opacity: processState.needsPrivilegedStop ? 0.5 : 1
              }}
            >
              <Square size={15} /> Stop Server
            </button>
          ) : (
            <button
              onClick={() => startOllama()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Play size={15} /> Start Server
            </button>
          )}
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-card)',
          padding: '0 var(--space-6)'
        }}
      >
        {[
          { id: 'overview', label: 'Server Overview', icon: <Activity size={16} /> },
          { id: 'models', label: `Installed Models (${models.length})`, icon: <Layers size={16} /> },
          { id: 'api', label: 'Developer API Tools', icon: <Code size={16} /> },
          { id: 'logs', label: `Live Server Logs (${logs.length})`, icon: <Terminal size={16} /> }
        ].map((tab) => {
          const active = activeSubTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                border: 'none',
                borderBottom: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Body Contents */}
      <div style={{ padding: 'var(--space-6)', flex: 1 }}>
        {/* OVERVIEW TAB */}
        {activeSubTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            {/* Card 1: Network & Port */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-5)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Server size={20} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Port & Endpoint</h3>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Server Host:</span>{' '}
                  <code style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>127.0.0.1</code>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Active Port:</span>{' '}
                  <code style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>{portNumber}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Base REST URL:</span>{' '}
                  <a href={hostUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                    {hostUrl} <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>

            {/* Card 2: Binary Location */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-5)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <HardDrive size={20} color="#61afef" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Executable Location</h3>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Binary Path:</span>{' '}
                  <code style={{ fontSize: '12px', backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                    {binaryLocation}
                  </code>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Process ID (PID):</span>{' '}
                  <strong>{processState.pid || 'N/A (External / Stopped)'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Execution Type:</span>{' '}
                  <span>
                    {processState.serviceUnit
                      ? `systemd unit (${processState.serviceUnit})`
                      : processState.isSystemProcess
                        ? 'System Daemon / External Service'
                        : 'Golti Managed Process'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: API Health Check */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-5)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Activity size={20} color="#98c379" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>API Health & Version</h3>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Status:</span>{' '}
                  <span style={{ color: healthStatus === 'healthy' ? '#98c379' : '#e06c75', fontWeight: 600 }}>
                    {healthStatus === 'healthy' ? '✓ Online & Responding' : '✖ Unreachable'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Ollama Version:</span>{' '}
                  <strong>{processState.version || 'Unknown'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>CORS Setting:</span>{' '}
                  <code style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>OLLAMA_ORIGINS=*</code>
                </div>
              </div>
            </div>

            {/* Card 4: GPU Acceleration */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-5)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Cpu size={20} color="#c678dd" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>GPU Acceleration</h3>
              </div>
              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ color: 'var(--text-secondary)' }}>Run on</label>
                  <select
                    value={settings?.ollamaDevice || 'auto'}
                    onChange={(e) => applyOllamaDevice(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: '180px',
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <option value="auto">Auto (let Ollama choose)</option>
                    {gpuDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.totalMiB ? ` · ${(d.totalMiB / 1024).toFixed(1)} GB` : ''}
                      </option>
                    ))}
                    <option value="cpu">CPU only</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ color: 'var(--text-secondary)' }}>GPU layers</label>
                  <select
                    value={String(settings?.ollamaGpuLayers ?? -1)}
                    onChange={(e) => updateSettings({ ollamaGpuLayers: Number(e.target.value) })}
                    style={{
                      flex: 1,
                      minWidth: '180px',
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <option value="-1">Auto (Ollama sizes the offload)</option>
                    <option value="0">0 — none (CPU inference)</option>
                    {[8, 16, 24, 32, 48, 64, 999].map((n) => (
                      <option key={n} value={n}>
                        {n === 999 ? '999 — all layers' : `${n} layers`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Measured placement, straight from /api/ps. */}
                {runtime && runtime.loaded.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                    {runtime.loaded.map((m) => (
                      <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.name}
                        </span>
                        <strong
                          style={{
                            color:
                              m.placement === 'gpu' ? '#98c379' : m.placement === 'partial' ? '#e5c07b' : '#e06c75',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {m.placement === 'cpu' ? 'CPU' : `${m.gpuPercent}% GPU`}
                          {m.vramBytes > 0 ? ` · ${(m.vramBytes / 1024 ** 3).toFixed(1)} GB VRAM` : ''}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                  {processState.gpuSettingIgnored
                    ? 'Ollama is running outside Golti, so the device setting is not applied. Stop it there and start it here to use it. GPU layers still apply — they travel with each request.'
                    : 'Device applies when Golti starts the server; GPU layers apply per request and take effect on the next reload of a model.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODELS TAB */}
        {activeSubTab === 'models' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Pull Model Bar */}
            <form
              onSubmit={handlePullModel}
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                backgroundColor: 'var(--bg-card)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <input
                type="text"
                placeholder="Enter model tag to pull (e.g. llama3.2, mistral, deepseek-r1:8b)..."
                value={pullTag}
                onChange={(e) => setPullTag(e.target.value)}
                disabled={isPulling}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
              <button
                type="submit"
                disabled={isPulling || !pullTag.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isPulling ? 'not-allowed' : 'pointer'
                }}
              >
                <Download size={16} /> {isPulling ? 'Pulling...' : 'Pull Model'}
              </button>
            </form>

            {/* Progress Bar */}
            {isPulling && pullProgress && (
              <div
                style={{
                  backgroundColor: 'var(--bg-card)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>{pullProgress.status}</span>
                  <span>{pullProgress.percent}%</span>
                </div>
                <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${pullProgress.percent}%`,
                      backgroundColor: 'var(--accent-primary)',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Models Table */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden'
              }}
            >
              {loadingModels ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading installed Ollama models...</div>
              ) : models.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No Ollama models found locally. Type a model tag above (e.g., <code>llama3.2</code>) to pull one!
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '12px 16px' }}>Model Tag</th>
                      <th style={{ padding: '12px 16px' }}>Size</th>
                      <th style={{ padding: '12px 16px' }}>Parameters</th>
                      <th style={{ padding: '12px 16px' }}>Quantization</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          {m.tag}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{m.sizeFormatted || 'N/A'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{m.parameterSize || 'N/A'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{m.quantizationLevel || 'N/A'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteModel(m.tag)}
                            title="Delete Model"
                            style={{
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid rgba(224, 108, 117, 0.3)',
                              backgroundColor: 'transparent',
                              color: '#e06c75',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* DEVELOPER API TAB */}
        {activeSubTab === 'api' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {apiSnippets.map((snippet, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-5)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{snippet.title}</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>{snippet.desc}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(snippet.code, idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {copiedIndex === idx ? <Check size={14} color="#98c379" /> : <Copy size={14} />}
                    {copiedIndex === idx ? 'Copied!' : 'Copy cURL'}
                  </button>
                </div>
                <pre
                  style={{
                    backgroundColor: '#1e1e1e',
                    color: '#dcdcdc',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    overflowX: 'auto',
                    margin: 0
                  }}
                >
                  {snippet.code}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* LOGS TAB */}
        {activeSubTab === 'logs' && (
          <div
            style={{
              backgroundColor: '#1e1e1e',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              height: '450px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', color: '#abb2bf', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={16} />
                <span>Standard Output & Error Log Stream</span>
              </div>
              <button
                onClick={() => fetchLogs()}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #3e4451',
                  backgroundColor: 'transparent',
                  color: '#abb2bf',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Refresh Logs
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: '#abb2bf',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: '#5c6370', fontStyle: 'italic' }}>No log messages recorded yet. Start Ollama to see output.</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
