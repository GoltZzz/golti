import React, { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Download, Save, RotateCcw } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

interface ShellEditorProps {
  shellId: string
  onBack: () => void
}

export const ShellEditor: React.FC<ShellEditorProps> = ({ shellId, onBack }) => {
  const { artifacts, updateArtifactContent, restoreArtifactVersion } = useChatStore()
  const shell = artifacts.find((a) => a.id === shellId)
  const [content, setContent] = useState(shell?.content || '')
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: number }>>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setContent(shell?.content || '')
    setDirty(false)
  }, [shell?.id, shell?.content, shell?.version])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await window.goltiAPI.listArtifactVersions(shellId)
      if (!cancelled) {
        setVersions(list.map((v: any) => ({ version: v.version, createdAt: v.createdAt })))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shellId, shell?.version])

  if (!shell) {
    return (
      <div>
        <button className="chat-ghost-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <p className="inspector-empty">Shell document not found.</p>
      </div>
    )
  }

  return (
    <div className="artifact-editor shell-editor">
      <div className="inspector-item-row">
        <button className="chat-ghost-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <span className="inspector-item-meta">v{shell.version}</span>
      </div>

      <div>
        <div className="inspector-item-name" style={{ marginBottom: 4 }}>
          {shell.title}
        </div>
        <div className="inspector-item-meta">{shell.language || shell.type}</div>
      </div>

      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setDirty(true)
        }}
        aria-label="Shell content"
        spellCheck={shell.type === 'markdown'}
      />

      <div className="artifact-actions">
        <button
          className="primary-btn"
          disabled={!dirty}
          onClick={async () => {
            await updateArtifactContent(shell.id, content)
            setDirty(false)
          }}
        >
          <Save size={14} /> Save version
        </button>
        <button
          className="chat-ghost-btn"
          onClick={() => navigator.clipboard.writeText(content)}
        >
          <Copy size={14} /> Copy
        </button>
        <button
          className="chat-ghost-btn"
          onClick={() => {
            const blob = new Blob([content], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${shell.title.replace(/\s+/g, '-').toLowerCase()}.${
              shell.language || (shell.type === 'markdown' ? 'md' : 'txt')
            }`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <Download size={14} /> Download
        </button>
      </div>

      {versions.length > 1 && (
        <>
          <div className="inspector-section-title" style={{ marginTop: 8 }}>
            Versions
          </div>
          <div className="inspector-list">
            {versions.map((v) => (
              <div key={v.version} className="inspector-item">
                <div className="inspector-item-row">
                  <span className="inspector-item-name">Version {v.version}</span>
                  <button
                    className="chat-ghost-btn"
                    disabled={v.version === shell.version}
                    onClick={() => restoreArtifactVersion(shell.id, v.version)}
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export const ArtifactEditor = ShellEditor
