import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layers, X, RefreshCw, AlertCircle, Info, ZapOff, Cpu } from 'lucide-react'
import { SystemInfoFull, EngineState } from '../../../shared/types'

interface RamBreakdownModalProps {
  open: boolean
  systemInfo: SystemInfoFull | null
  onClose: () => void
  onRescan: () => void
}

export const RamBreakdownModal: React.FC<RamBreakdownModalProps> = ({
  open,
  systemInfo,
  onClose,
  onRescan
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [engineState, setEngineState] = useState<EngineState | null>(null)
  const [isUnloading, setIsUnloading] = useState(false)
  const [unloadSuccess, setUnloadSuccess] = useState(false)

  useEffect(() => {
    if (!open) return

    closeRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    // Check engine status to see if a model is currently loaded
    if (window.goltiAPI?.getEngineStatus) {
      window.goltiAPI.getEngineStatus().then((state: EngineState) => {
        setEngineState(state)
      }).catch(console.warn)
    }

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !systemInfo) return null

  const { ram, gpu, platform } = systemInfo
  const totalGB = ram.totalGB
  const usedPercent = Math.min(100, Math.max(0, ram.usedPercent))
  const usedGBVal = (totalGB * (usedPercent / 100))
  const usedGB = usedGBVal.toFixed(1)
  const freeGBVal = Math.max(0, totalGB - usedGBVal)
  const freeGB = freeGBVal.toFixed(1)

  const maxCapGB = (
    gpu.isAppleSilicon ? totalGB * 0.75 : (gpu.vramGB || totalGB * 0.70)
  ).toFixed(1)

  const loadedModelPath = engineState?.loadedModel
  const loadedModelName = loadedModelPath ? loadedModelPath.split(/[\/\\]/).pop() : null

  // Model size estimation for visual breakdown segment if loaded
  const modelEstimateGB = loadedModelName ? 3.0 : 0
  const modelPct = Math.min(usedPercent, (modelEstimateGB / totalGB) * 100)

  // OS / Cache segment estimate (~30% of memory on modern OS when high)
  const osCachePct = Math.min(usedPercent - modelPct, Math.max(15, usedPercent * 0.35))
  // Active apps segment
  const appsPct = Math.max(0, usedPercent - osCachePct - modelPct)
  // Free memory segment
  const freePct = Math.max(0, 100 - usedPercent)

  const handleUnloadModel = async () => {
    if (!window.goltiAPI?.stopEngine) return
    setIsUnloading(true)
    try {
      await window.goltiAPI.stopEngine()
      setUnloadSuccess(true)
      const newState = await window.goltiAPI.getEngineStatus()
      setEngineState(newState)
      onRescan()
    } catch (err) {
      console.error('Failed to unload model:', err)
    } finally {
      setIsUnloading(false)
    }
  }

  const getPressureBadgeClass = (pct: number) => {
    if (pct < 60) return 'pressure-badge-low'
    if (pct < 85) return 'pressure-badge-medium'
    return 'pressure-badge-high'
  }

  // Rendered into document.body: .hardware-card sets backdrop-filter and
  // container-type, either of which would make it the containing block for
  // this fixed overlay and clip the dialog inside the card.
  return createPortal(
    <div
      className="ram-breakdown-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="ram-breakdown-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ram-breakdown-title"
        ref={dialogRef}
      >
        <div className="ram-breakdown-header">
          <div className="ram-breakdown-title-row">
            <Layers size={20} className="ram-modal-icon" />
            <h3 id="ram-breakdown-title">Memory (RAM) Usage Breakdown</h3>
            <div className={`pressure-badge ${getPressureBadgeClass(ram.usedPercent)}`}>
              {ram.usedPercent > 85 ? 'High Pressure' : ram.usedPercent > 60 ? 'Moderate' : 'Optimal'}
            </div>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="ram-breakdown-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="ram-breakdown-body">
          {/* Main Stats Header Card */}
          <div className="ram-summary-card">
            <div className="ram-summary-stat">
              <span className="stat-label">Total Installed</span>
              <span className="stat-value">{totalGB} GB</span>
            </div>
            <div className="ram-summary-stat">
              <span className="stat-label">Currently Used</span>
              <span className="stat-value highlight">
                {usedGB} GB ({ram.usedPercent}%)
              </span>
            </div>
            <div className="ram-summary-stat">
              <span className="stat-label">Free RAM</span>
              <span className="stat-value">{freeGB} GB</span>
            </div>
            <div className="ram-summary-stat">
              <span className="stat-label">Max LLM Cap</span>
              <span className="stat-value cap">{maxCapGB} GB</span>
            </div>
          </div>

          {/* Segmented RAM Visual Bar */}
          <div className="ram-segmented-section">
            <div className="segmented-section-title">
              <span>Estimated Memory Allocation</span>
              <span className="segmented-total-text">{usedPercent}% occupied</span>
            </div>
            <div className="ram-segmented-bar" aria-label="RAM allocation breakdown bar">
              <div
                className="segment segment-os"
                style={{ width: `${osCachePct}%` }}
                title={`OS & System Cache: ~${((totalGB * osCachePct) / 100).toFixed(1)} GB`}
              />
              <div
                className="segment segment-apps"
                style={{ width: `${appsPct}%` }}
                title={`Active Applications & User Apps: ~${((totalGB * appsPct) / 100).toFixed(1)} GB`}
              />
              {modelPct > 0 && (
                <div
                  className="segment segment-llm"
                  style={{ width: `${modelPct}%` }}
                  title={`Loaded LLM Model (${loadedModelName}): ~${((totalGB * modelPct) / 100).toFixed(1)} GB`}
                />
              )}
              <div
                className="segment segment-free"
                style={{ width: `${freePct}%` }}
                title={`Free Memory: ${freeGB} GB`}
              />
            </div>
            <div className="ram-legend-grid">
              <div className="legend-item">
                <span className="legend-dot dot-os" />
                <span className="legend-name">OS & System Cache</span>
                <span className="legend-val">~{((totalGB * osCachePct) / 100).toFixed(1)} GB</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot dot-apps" />
                <span className="legend-name">Active Applications</span>
                <span className="legend-val">~{((totalGB * appsPct) / 100).toFixed(1)} GB</span>
              </div>
              {loadedModelName && (
                <div className="legend-item">
                  <span className="legend-dot dot-llm" />
                  <span className="legend-name">Loaded LLM Model</span>
                  <span className="legend-val">~{((totalGB * modelPct) / 100).toFixed(1)} GB</span>
                </div>
              )}
              <div className="legend-item">
                <span className="legend-dot dot-free" />
                <span className="legend-name">Free Memory</span>
                <span className="legend-val">{freeGB} GB</span>
              </div>
            </div>
          </div>

          {/* Explanation Callouts */}
          <div className="ram-explanations">
            <h4>
              <Info size={15} /> Why does RAM usage appear high?
            </h4>
            <ul className="explanation-list">
              <li>
                <strong>Aggressive OS File Caching:</strong> Modern operating systems ({platform === 'darwin' ? 'macOS Unified Memory' : platform === 'win32' ? 'Windows SuperFetch' : 'Linux Kernel'}) proactively fill unused RAM with file cache to keep your device fast. Golti calculates available memory by accounting for reclaimable OS cache so models have accurate headroom.
              </li>
              <li>
                <strong>Max LLM Memory Cap ({maxCapGB} GB):</strong> To prevent crashes or severe system slowdowns, Golti caps local model loading to <strong>{gpu.isAppleSilicon ? '75%' : '70%'}</strong> of system RAM.
              </li>
              {loadedModelName && (
                <li className="highlight-model-li">
                  <Cpu size={14} /> <strong>Active Model Loaded:</strong> Model <code>{loadedModelName}</code> is currently residing in RAM/VRAM.
                </li>
              )}
            </ul>
          </div>

          {/* Practical Tips */}
          {ram.usedPercent > 85 && (
            <div className="ram-tips-box">
              <AlertCircle size={15} className="tips-icon" />
              <div>
                <strong>Tips to ensure smooth LLM execution:</strong>
                <ul>
                  <li>Close browser tabs (Chrome/Brave), Electron apps, or heavy background editors.</li>
                  {loadedModelName && <li>Unload unused LLMs when not actively generating responses.</li>}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="ram-breakdown-actions">
          {loadedModelName && (
            <button
              type="button"
              className="ram-action-btn unload-btn"
              onClick={handleUnloadModel}
              disabled={isUnloading}
            >
              <ZapOff size={14} />
              {isUnloading ? 'Unloading model…' : unloadSuccess ? 'Model Unloaded' : 'Unload Active Model'}
            </button>
          )}
          <button
            type="button"
            className="ram-action-btn rescan-btn"
            onClick={onRescan}
          >
            <RefreshCw size={14} />
            Rescan Hardware
          </button>
          <button
            type="button"
            className="ram-action-btn close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
