import React, { useEffect, useState } from 'react'
import { AlertTriangle, HardDrive, BookOpen, RefreshCw } from 'lucide-react'
import { EngineMemoryErrorDetails } from '../../../shared/chat-utils'
import { SystemInfo } from '../../../shared/types'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useChatStore } from '../../stores/chatStore'

interface EngineMemoryErrorCardProps {
  details: EngineMemoryErrorDetails
  onRetry?: () => void
}

export const EngineMemoryErrorCard: React.FC<EngineMemoryErrorCardProps> = ({ details, onRetry }) => {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const setActiveTab = useSidebarStore((s) => s.setActiveTab)
  const { regenerate, messages } = useChatStore()

  useEffect(() => {
    window.goltiAPI.getSystemInfo().then(setSysInfo).catch(console.warn)
  }, [])

  const freeRamStr = sysInfo ? `${sysInfo.freeRamGB.toFixed(1)} GB` : '0.0 GB'
  const totalRamStr = sysInfo ? `${sysInfo.totalRamGB.toFixed(1)} GB` : '8.0 GB'

  return (
    <div className="engine-memory-error-card">
      <div className="engine-memory-error-header">
        <AlertTriangle size={18} />
        <span>Insufficient Memory to Load Model</span>
      </div>

      <div className="engine-memory-error-desc">
        Golti Engine could not start <strong>{details.modelName}</strong> because your machine ran out of available memory during model initialization.
      </div>

      <div className="engine-memory-error-stats">
        <div className="engine-memory-stat-item">
          <span className="engine-memory-stat-label">Model Required RAM</span>
          <span className="engine-memory-stat-val is-warning">~{details.ramRequiredGB} GB</span>
        </div>
        <div className="engine-memory-stat-item">
          <span className="engine-memory-stat-label">System Free RAM</span>
          <span className="engine-memory-stat-val is-danger">{freeRamStr}</span>
        </div>
        <div className="engine-memory-stat-item">
          <span className="engine-memory-stat-label">Total Hardware RAM</span>
          <span className="engine-memory-stat-val">{totalRamStr}</span>
        </div>
      </div>

      <div className="engine-memory-error-advice">
        <strong>What you can do:</strong>
        <ul>
          <li>Close heavy background applications (browsers, IDEs, video editing software) to free up RAM.</li>
          <li>
            Or switch to a lighter model optimized for your hardware setup, such as{' '}
            <strong>Llama 3.2 3B</strong> (~2.8 GB RAM) or <strong>DeepSeek R1 1.5B</strong> (~1.8 GB RAM).
          </li>
        </ul>
      </div>

      <div className="engine-memory-error-actions">
        {onRetry && (
          <button className="engine-memory-btn engine-memory-btn-primary" onClick={onRetry}>
            <RefreshCw size={14} />
            <span>Retry Loading</span>
          </button>
        )}
        <button
          className="engine-memory-btn engine-memory-btn-secondary"
          onClick={() => setActiveTab('cookbook')}
        >
          <BookOpen size={14} />
          <span>Open Hardware Cookbook</span>
        </button>
      </div>
    </div>
  )
}
