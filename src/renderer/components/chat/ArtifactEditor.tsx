import React, { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Download, Save, RotateCcw } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

interface ArtifactEditorProps {
  artifactId: string
  onBack: () => void
}

export const ArtifactEditor: React.FC<ArtifactEditorProps> = ({ artifactId, onBack }) => {
  const { artifacts, updateArtifactContent, restoreArtifactVersion } = useChatStore()
  const artifact = artifacts.find((a) => a.id === artifactId)
  const [content, setContent] = useState(artifact?.content || '')
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: number }>>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setContent(artifact?.content || '')
    setDirty(false)
  }, [artifact?.id, artifact?.content, artifact?.version])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await window.goltiAPI.listArtifactVersions(artifactId)
      if (!cancelled) {
        setVersions(list.map((v: any) => ({ version: v.version, createdAt: v.createdAt })))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [artifactId, artifact?.version])

  if (!artifact) {
    return (
      <div>
        <button className="chat-ghost-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <p className="inspector-empty">Artifact not found.</p>
      </div>
    )
  }

  return (
    <div className="artifact-editor">
      <div className="inspector-item-row">
        <button className="chat-ghost-btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <span className="inspector-item-meta">v{artifact.version}</span>
      </div>

      <div>
        <div className="inspector-item-name" style={{ marginBottom: 4 }}>
          {artifact.title}
        </div>
        <div className="inspector-item-meta">{artifact.language || artifact.type}</div>
      </div>

      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          setDirty(true)
        }}
        aria-label="Artifact content"
        spellCheck={artifact.type === 'markdown'}
      />

      <div className="artifact-actions">
        <button
          className="primary-btn"
          disabled={!dirty}
          onClick={async () => {
            await updateArtifactContent(artifact.id, content)
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
            a.download = `${artifact.title.replace(/\s+/g, '-').toLowerCase()}.${
              artifact.language || (artifact.type === 'markdown' ? 'md' : 'txt')
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
                    disabled={v.version === artifact.version}
                    onClick={() => restoreArtifactVersion(artifact.id, v.version)}
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
