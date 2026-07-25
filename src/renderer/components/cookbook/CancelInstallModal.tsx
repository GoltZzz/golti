import React, { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface CancelInstallModalProps {
  open: boolean
  onConfirm: () => void
  onKeepInstalling: () => void
}

export const CancelInstallModal: React.FC<CancelInstallModalProps> = ({
  open,
  onConfirm,
  onKeepInstalling
}) => {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onKeepInstalling()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onKeepInstalling])

  if (!open) return null

  return (
    <div
      className="delete-model-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onKeepInstalling()
      }}
    >
      <div
        className="delete-model-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-install-title"
        aria-describedby="cancel-install-desc"
        ref={modalRef}
        style={{ maxWidth: '420px' }}
      >
        <div className="delete-model-header">
          <div className="delete-model-title-row">
            <AlertTriangle size={18} style={{ color: '#e06c75' }} />
            <h3 id="cancel-install-title" style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
              Cancel Ollama Installation?
            </h3>
          </div>
          <button
            type="button"
            className="delete-model-close"
            onClick={onKeepInstalling}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p id="cancel-install-desc" className="delete-model-desc" style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-secondary)', margin: '12px 0 20px 0' }}>
          Are you sure? This will stop the download and remove any temporary files.
        </p>

        <div className="delete-model-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="delete-cancel-btn"
            onClick={onKeepInstalling}
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Continue Downloading
          </button>
          <button
            type="button"
            className="delete-confirm-btn"
            onClick={onConfirm}
            style={{
              backgroundColor: '#e06c75',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Stop & Remove
          </button>
        </div>
      </div>
    </div>
  )
}
