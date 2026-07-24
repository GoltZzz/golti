import React, { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Copy,
  Download,
  Save,
  RotateCcw,
  Eye,
  Code2,
  FileDiff,
  FileCheck,
  FolderPlus,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { ShellCanvasPreview } from './ShellCanvasPreview'
import { ShellDiffView } from './ShellDiffView'

interface ShellEditorProps {
  shellId: string
  onBack: () => void
}

type Mode = 'preview' | 'code' | 'diff'

export const ShellEditor: React.FC<ShellEditorProps> = ({ shellId, onBack }) => {
  const { artifacts, updateArtifactContent, restoreArtifactVersion } = useChatStore()
  const shell = artifacts.find((a) => a.id === shellId)
  const [content, setContent] = useState(shell?.content || '')
  const [originalContent, setOriginalContent] = useState(shell?.content || '')
  const [mode, setMode] = useState<Mode>('preview')
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: number }>>([])
  const [dirty, setDirty] = useState(false)
  const [targetPath, setTargetPath] = useState('')
  const [showApplyBox, setShowApplyBox] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setContent(shell?.content || '')
    setOriginalContent(shell?.content || '')
    setDirty(false)
    if (shell?.title) {
      setTargetPath(shell.title)
    }
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
      <div style={{ padding: 12 }}>
        <button className="chat-ghost-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <p className="inspector-empty" style={{ marginTop: 12 }}>
          Shell document not found.
        </p>
      </div>
    )
  }

  const handleSaveToFile = async (specificPath?: string) => {
    const ext = shell.language || (shell.type === 'markdown' ? 'md' : 'txt')
    const defaultFilename = `${shell.title.replace(/\s+/g, '-').toLowerCase()}.${ext}`

    try {
      const res = await window.goltiAPI.saveShellToFile({
        content,
        filePath: specificPath,
        defaultFilename
      })
      if (res.success) {
        setStatusMsg({ type: 'success', text: `Saved to ${res.filePath}` })
        setShowApplyBox(false)
      } else if (!res.cancelled) {
        setStatusMsg({ type: 'error', text: res.error || 'Save failed' })
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Failed to save file' })
    }

    setTimeout(() => {
      setStatusMsg(null)
    }, 4000)
  }

  return (
    <div
      className="artifact-editor shell-editor"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, padding: '8px 12px' }}
    >
      {/* Top Header Navigation */}
      <div className="inspector-item-row" style={{ alignItems: 'center' }}>
        <button className="chat-ghost-btn" onClick={onBack} aria-label="Back to Shells list">
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="inspector-item-meta" style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>
            v{shell.version}
          </span>
          <span className="inspector-item-meta" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
            {shell.language || shell.type}
          </span>
        </div>
      </div>

      {/* Shell Title Header */}
      <div>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{shell.title}</h4>
      </div>

      {/* Sub-navbar Mode Tabs */}
      <div
        className="shell-editor-tabs"
        style={{
          display: 'flex',
          gap: 4,
          background: 'var(--bg-input, #13161c)',
          padding: 3,
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid var(--border-subtle, #2d3342)'
        }}
      >
        <button
          className={`chat-ghost-btn ${mode === 'preview' ? 'is-active' : ''}`}
          onClick={() => setMode('preview')}
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '4px 8px' }}
        >
          <Eye size={14} /> Preview
        </button>
        <button
          className={`chat-ghost-btn ${mode === 'code' ? 'is-active' : ''}`}
          onClick={() => setMode('code')}
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '4px 8px' }}
        >
          <Code2 size={14} /> Code
        </button>
        <button
          className={`chat-ghost-btn ${mode === 'diff' ? 'is-active' : ''}`}
          onClick={() => setMode('diff')}
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '4px 8px' }}
        >
          <FileDiff size={14} /> Diff {dirty && '•'}
        </button>
      </div>

      {/* Main Mode View */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {mode === 'preview' && (
          <ShellCanvasPreview
            content={content}
            language={shell.language}
            title={shell.title}
            onApplyFixedContent={(fixed) => {
              setContent(fixed)
              setDirty(true)
            }}
          />
        )}

        {mode === 'code' && (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
            aria-label="Shell content editor"
            spellCheck={shell.type === 'markdown'}
            style={{
              width: '100%',
              height: '100%',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12,
              lineHeight: 1.5,
              background: 'var(--bg-main, #0f1117)',
              color: 'var(--text-primary, #e2e8f0)',
              border: '1px solid var(--border-subtle, #2d3342)',
              borderRadius: 'var(--radius-md, 6px)',
              padding: 10,
              resize: 'none'
            }}
          />
        )}

        {mode === 'diff' && <ShellDiffView originalContent={originalContent} editedContent={content} />}
      </div>

      {/* Inline Apply / Save to Workspace Box */}
      {showApplyBox && (
        <div
          style={{
            padding: 8,
            background: 'var(--bg-card, #1a1d24)',
            borderRadius: 'var(--radius-md, 6px)',
            border: '1px solid var(--accent-primary, #6366f1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Target File Path (Relative or Absolute):</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="e.g. src/components/MyWidget.tsx"
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                padding: '4px 8px',
                fontSize: 12
              }}
            />
            <button
              className="primary-btn"
              onClick={() => handleSaveToFile(targetPath)}
              style={{ fontSize: 11, padding: '4px 8px' }}
            >
              <FileCheck size={12} /> Write
            </button>
            <button
              className="chat-ghost-btn"
              onClick={() => handleSaveToFile()}
              title="Open File Dialog..."
              style={{ fontSize: 11, padding: '4px 8px' }}
            >
              <FolderPlus size={12} /> Browse
            </button>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {statusMsg && (
        <div
          style={{
            fontSize: 11,
            padding: '6px 10px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: statusMsg.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: statusMsg.type === 'success' ? '#4ade80' : '#f87171'
          }}
        >
          {statusMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="artifact-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button
          className="primary-btn"
          disabled={!dirty}
          onClick={async () => {
            await updateArtifactContent(shell.id, content)
            setOriginalContent(content)
            setDirty(false)
            setStatusMsg({ type: 'success', text: 'Saved new shell version' })
            setTimeout(() => setStatusMsg(null), 3000)
          }}
          style={{ fontSize: 12 }}
        >
          <Save size={14} /> Save version
        </button>

        <button
          className="chat-ghost-btn"
          onClick={() => setShowApplyBox((prev) => !prev)}
          style={{ fontSize: 12, color: 'var(--accent-primary, #6366f1)' }}
        >
          <FolderPlus size={14} /> Apply to File
        </button>

        <button
          className="chat-ghost-btn"
          onClick={() => {
            navigator.clipboard.writeText(content)
            setStatusMsg({ type: 'success', text: 'Copied code to clipboard' })
            setTimeout(() => setStatusMsg(null), 2500)
          }}
          style={{ fontSize: 12 }}
        >
          <Copy size={14} /> Copy
        </button>

        <button className="chat-ghost-btn" onClick={() => handleSaveToFile()} style={{ fontSize: 12 }}>
          <Download size={14} /> Download
        </button>
      </div>

      {/* Version History */}
      {versions.length > 1 && (
        <div style={{ marginTop: 4 }}>
          <div className="inspector-section-title" style={{ fontSize: 11, marginBottom: 4 }}>
            Version History
          </div>
          <div className="inspector-list" style={{ maxHeight: 90, overflowY: 'auto' }}>
            {versions.map((v) => (
              <div key={v.version} className="inspector-item" style={{ padding: '4px 6px' }}>
                <div className="inspector-item-row">
                  <span className="inspector-item-name" style={{ fontSize: 11 }}>
                    Version {v.version}
                  </span>
                  <button
                    className="chat-ghost-btn"
                    disabled={v.version === shell.version}
                    onClick={async () => {
                      await restoreArtifactVersion(shell.id, v.version)
                    }}
                    style={{ fontSize: 10, padding: '2px 4px' }}
                  >
                    <RotateCcw size={10} /> Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const ArtifactEditor = ShellEditor
