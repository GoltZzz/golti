import React, { useState } from 'react'
import { SystemInfoFull, OllamaRuntimeInfo, VramReading } from '../../../shared/types'
import { useCookbookStore } from '../../stores/cookbookStore'
import { RamBreakdownModal } from './RamBreakdownModal'
import {
  Cpu,
  Layers,
  HardDrive,
  Thermometer,
  RefreshCw,
  Gauge,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle
} from 'lucide-react'

interface HardwareCardProps {
  systemInfo: SystemInfoFull | null
  /** Driver-level VRAM reading: the whole card, every consumer. Null when unknown. */
  vramReading?: VramReading | null
  /** Per-model attribution from Ollama's /api/ps; null when unknown. */
  ollamaRuntime?: OllamaRuntimeInfo | null
  loading: boolean
  scanError: string | null
  onRescan: () => void
}

const getOSName = (plat: string) => {
  switch (plat) {
    case 'darwin':
      return 'macOS'
    case 'win32':
      return 'Windows'
    case 'linux':
      return 'Linux'
    default:
      return plat
  }
}

const getRamBarColor = (pct: number) => {
  if (pct < 60) return 'var(--accent-green)'
  if (pct < 85) return 'var(--accent-yellow)'
  return 'var(--accent-primary)'
}

export const HardwareCard: React.FC<HardwareCardProps> = ({
  systemInfo,
  vramReading,
  ollamaRuntime,
  loading,
  scanError,
  onRescan
}) => {
  const { isHardwareCardCollapsed, toggleHardwareCardCollapsed } = useCookbookStore()
  const [isRamModalOpen, setIsRamModalOpen] = useState(false)

  const showSkeleton = !systemInfo && loading
  const showErrorOnly = !systemInfo && !!scanError && !loading

  if (showSkeleton) {
    return (
      <div className="hardware-card hardware-card-skeleton is-collapsed" aria-busy="true">
        <div className="hardware-card-header">
          <div className="header-info">
            <div className="title-with-meta">
              <span className="skeleton-block skeleton-icon" />
              <span className="skeleton-block skeleton-title" />
            </div>
            <div className="hardware-meta-line">
              <span className="skeleton-block skeleton-meta" />
              <span className="skeleton-block skeleton-meta short" />
              <span className="skeleton-block skeleton-meta short" />
            </div>
          </div>
          <div className="hardware-header-actions">
            <span className="skeleton-block skeleton-btn" />
            <span className="skeleton-block skeleton-icon-btn" />
          </div>
        </div>
      </div>
    )
  }

  if (showErrorOnly) {
    return (
      <div className="hardware-card hardware-card-error is-collapsed">
        <div className="hardware-card-header">
          <div className="header-info hardware-error-info">
            <AlertCircle size={16} className="hardware-error-icon" aria-hidden />
            <div className="hardware-error-copy">
              <h2>System Hardware Fingerprint</h2>
              <p className="hardware-error-message">{scanError}</p>
            </div>
          </div>
          <div className="hardware-header-actions">
            <button
              type="button"
              onClick={onRescan}
              className="rescan-btn"
              title="Retry hardware scan"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!systemInfo) {
    return null
  }

  const { cpu, ram, gpu, disk, thermals, platform, arch } = systemInfo
  const ramUsedGB = (ram.totalGB * (ram.usedPercent / 100)).toFixed(1)

  // The driver reading covers the whole card; Ollama's own figure only covers
  // what it loaded, so it is a fallback. null means "could not read it", which
  // renders as no bar at all rather than a misleading 0 GB.
  const vramTotalGB = vramReading ? vramReading.totalMiB / 1024 : gpu.vramGB
  const vramUsedGB = vramReading
    ? vramReading.usedMiB / 1024
    : ollamaRuntime
      ? ollamaRuntime.totalVramBytes / 1024 ** 3
      : null
  const vramUsedPercent =
    vramUsedGB !== null && vramTotalGB ? Math.min(100, Math.round((vramUsedGB / vramTotalGB) * 100)) : 0
  const loadedOnGpu = (ollamaRuntime?.loaded || []).filter((m) => m.vramBytes > 0)

  const shortCpuModel = cpu.model
    ? cpu.model.replace(/\(R\)|\(TM\)|Processor|CPU/gi, '').trim()
    : 'System Processor'

  return (
    <div
      className={`hardware-card animate-fade-in ${isHardwareCardCollapsed ? 'is-collapsed' : 'is-expanded'}`}
    >
      <div className="hardware-card-header">
        <div className="header-info">
          <div className="title-with-meta">
            <Cpu className="header-title-icon" size={16} aria-hidden />
            <h2>System Hardware Fingerprint</h2>
          </div>
          <div
            className={`hardware-meta-line ${loading ? 'is-rescanning' : ''}`}
            aria-live="polite"
          >
            <span className="meta-os">
              {getOSName(platform)} ({arch})
            </span>
            <span className="meta-sep" aria-hidden>
              ·
            </span>
            <span className="meta-spec">{shortCpuModel}</span>
            <span className="meta-sep" aria-hidden>
              ·
            </span>
            <span className="meta-spec">{ram.totalGB} GB RAM</span>
          </div>
          {scanError && (
            <p className="hardware-inline-error" role="alert">
              <AlertCircle size={12} aria-hidden />
              {scanError}
            </p>
          )}
        </div>
        <div className="hardware-header-actions">
          <button
            type="button"
            onClick={onRescan}
            disabled={loading}
            className="rescan-btn"
            title="Rescan hardware"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} aria-hidden />
            {loading ? 'Scanning…' : 'Rescan'}
          </button>
          <button
            type="button"
            onClick={toggleHardwareCardCollapsed}
            className="collapse-toggle-btn"
            title={isHardwareCardCollapsed ? 'Expand hardware details' : 'Collapse hardware details'}
            aria-label={isHardwareCardCollapsed ? 'Expand hardware details' : 'Collapse hardware details'}
            aria-expanded={!isHardwareCardCollapsed}
          >
            {isHardwareCardCollapsed ? (
              <ChevronDown size={16} aria-hidden />
            ) : (
              <ChevronUp size={16} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="hardware-collapsible-wrapper">
        <div className="hardware-grid">
          <div className="hardware-item">
            <div className="item-header">
              <Cpu size={16} className="item-icon cpu-icon" aria-hidden />
              <h3>Processor (CPU)</h3>
            </div>
            <div className="item-body">
              <p className="primary-text">{cpu.model}</p>
              <div className="sub-specs">
                <span>
                  <span className="spec-num">{cpu.cores}</span> Physical Cores
                </span>
                <span className="spec-dot">•</span>
                <span>
                  <span className="spec-num">{cpu.threads}</span> Threads
                </span>
                {cpu.speedGHz > 0 && (
                  <>
                    <span className="spec-dot">•</span>
                    <span className="spec-num">{cpu.speedGHz} GHz</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="hardware-item">
            <div className="item-header">
              <Gauge size={16} className="item-icon gpu-icon" aria-hidden />
              <h3>Graphics (GPU)</h3>
            </div>
            <div className="item-body">
              <p className="primary-text">{gpu.name}</p>
              <div className="sub-specs">
                {gpu.isAppleSilicon ? (
                  <span className="apple-silicon-tag">Apple Silicon (Unified Memory)</span>
                ) : gpu.vramGB !== null ? (
                  <span>
                    <span className="spec-num">{gpu.vramGB} GB</span> Dedicated VRAM
                  </span>
                ) : (
                  <span>System Shared Memory</span>
                )}
              </div>

              {/* Measured VRAM occupancy from Ollama, not an estimate. */}
              {vramUsedGB !== null && vramTotalGB ? (
                <>
                  <div className="progress-bar-bg ram-bar" style={{ marginTop: '8px' }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${vramUsedPercent}%`,
                        backgroundColor: getRamBarColor(vramUsedPercent)
                      }}
                    />
                  </div>
                  <div className="sub-specs" style={{ marginTop: '6px', fontSize: '11px' }}>
                    <span>
                      In use: <span className="spec-num">{vramUsedGB.toFixed(1)} GB</span>
                    </span>
                    <span className="spec-dot">•</span>
                    <span>
                      Free: <span className="spec-num">{Math.max(0, vramTotalGB - vramUsedGB).toFixed(1)} GB</span>
                    </span>
                  </div>
                  {loadedOnGpu.length > 0 && (
                    <div className="sub-specs" style={{ marginTop: '4px', fontSize: '11px' }}>
                      <span title={loadedOnGpu.map((m) => `${m.name} — ${m.gpuPercent}% on GPU`).join('\n')}>
                        {loadedOnGpu.length} Ollama model{loadedOnGpu.length > 1 ? 's' : ''} resident
                        {loadedOnGpu.some((m) => m.placement === 'partial') ? ' (partly on CPU)' : ''}
                      </span>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>

          <div
            className="hardware-item ram-item clickable-ram-item"
            onClick={() => setIsRamModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setIsRamModalOpen(true)
              }
            }}
            title="Click to view detailed Memory (RAM) breakdown"
          >
            <div className="item-header">
              <div className="header-title-with-badge">
                <Layers size={16} className="item-icon ram-icon" aria-hidden />
                <h3>Memory (RAM)</h3>
              </div>
              <button
                type="button"
                className="ram-info-icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsRamModalOpen(true)
                }}
                title="Why is RAM high? Click for breakdown"
                aria-label="View Memory Breakdown"
              >
                <HelpCircle size={14} />
              </button>
            </div>
            <div className="item-body">
              <div className="ram-details">
                <span className="primary-text">
                  <span className="spec-num">{ram.totalGB} GB</span> Total
                </span>
                <span className="ram-usage-text">
                  <span className="spec-num">{ramUsedGB} GB</span> Used (
                  <span className="spec-num">{ram.usedPercent}%</span>)
                </span>
              </div>
              <div className="progress-bar-bg ram-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${ram.usedPercent}%`,
                    backgroundColor: getRamBarColor(ram.usedPercent)
                  }}
                />
              </div>
              <div className="sub-specs" style={{ marginTop: '8px', fontSize: '11px' }}>
                <span>
                  Free: <span className="spec-num">{Math.max(0, ram.totalGB - parseFloat(ramUsedGB)).toFixed(1)} GB</span>
                </span>
                <span className="spec-dot">•</span>
                <span>
                  Max LLM Cap: <span className="spec-num">{(gpu.isAppleSilicon ? ram.totalGB * 0.75 : (gpu.vramGB || ram.totalGB * 0.70)).toFixed(1)} GB</span>
                </span>
              </div>
              {ram.usedPercent > 85 ? (
                <div className="hardware-inline-error" style={{ marginTop: '6px', fontSize: '11px', color: '#e5c07b' }}>
                  <AlertCircle size={12} aria-hidden /> High RAM pressure ({ram.usedPercent}% used).{' '}
                  <button
                    type="button"
                    className="ram-inline-breakdown-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsRamModalOpen(true)
                    }}
                  >
                    Why is RAM high?
                  </button>
                </div>
              ) : (
                <div className="ram-click-hint">
                  <HelpCircle size={11} /> Click card for detailed RAM breakdown
                </div>
              )}
            </div>
          </div>

          <div className="hardware-item">
            <div className="item-header">
              <HardDrive size={16} className="item-icon disk-icon" aria-hidden />
              <h3>Storage Disk Speed</h3>
            </div>
            <div className="item-body">
              <div className="disk-details">
                {disk.readMBps && disk.writeMBps ? (
                  <>
                    <div className="disk-speed-row">
                      <span className="speed-label">Read</span>
                      <span className="speed-val">{disk.readMBps} MB/s</span>
                    </div>
                    <div className="disk-speed-row">
                      <span className="speed-label">Write</span>
                      <span className="speed-val">{disk.writeMBps} MB/s</span>
                    </div>
                  </>
                ) : (
                  <span className="text-muted">Estimating speed…</span>
                )}
              </div>
            </div>
          </div>

          <div className="hardware-item">
            <div className="item-header">
              <Thermometer size={16} className="item-icon thermal-icon" aria-hidden />
              <h3>Thermals & Status</h3>
            </div>
            <div className="item-body">
              <div className="thermal-details">
                {thermals.cpuTempC !== null ? (
                  <span className="primary-text">
                    <span className="spec-num">{thermals.cpuTempC}°C</span> (CPU Temp)
                  </span>
                ) : (
                  <span className="primary-text">Normal / Cool</span>
                )}
                <span className="thermal-sub">No thermal throttling detected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RamBreakdownModal
        open={isRamModalOpen}
        systemInfo={systemInfo}
        onClose={() => setIsRamModalOpen(false)}
        onRescan={onRescan}
      />
    </div>
  )
}
