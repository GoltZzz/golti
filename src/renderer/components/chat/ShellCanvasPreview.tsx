import React, { useEffect, useRef, useState } from 'react'
import { Monitor, Smartphone, Tablet, RefreshCw, ZoomIn, ZoomOut, Maximize2, AlertCircle, Wrench } from 'lucide-react'
import mermaid from 'mermaid'
import { explainMermaidError, sanitizeMermaid } from '../../../shared/mermaid-sanitize'

interface ShellCanvasPreviewProps {
  content: string
  language?: string
  title?: string
  onApplyFixedContent?: (fixed: string) => void
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

interface MermaidFriendlyError {
  summary: string
  tip?: string
  offendingLine?: string
  raw: string
}

export const ShellCanvasPreview: React.FC<ShellCanvasPreviewProps> = ({
  content,
  language,
  title,
  onApplyFixedContent
}) => {
  const [viewport, setViewport] = useState<ViewportMode>('desktop')
  const [zoom, setZoom] = useState<number>(100)
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null)
  const [mermaidError, setMermaidError] = useState<MermaidFriendlyError | null>(null)
  const [autoFix, setAutoFix] = useState<{ content: string; fixes: string[] } | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [key, setKey] = useState<number>(0)
  const mermaidRef = useRef<HTMLDivElement>(null)

  const lang = (language || '').toLowerCase()
  const isSvg = lang === 'svg' || (content.trim().startsWith('<svg') && content.trim().endsWith('</svg>'))
  const isMermaid =
    lang === 'mermaid' ||
    /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)/i.test(
      content.trim()
    )

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)'
    })
  }, [])

  useEffect(() => {
    if (!isMermaid) return
    let isCancelled = false

    const renderDiagram = async () => {
      setMermaidError(null)
      setAutoFix(null)
      setBannerDismissed(false)
      setMermaidSvg(null)

      const tryRender = async (source: string) => {
        const id = `mermaid-canvas-${Math.random().toString(36).slice(2, 9)}`
        return mermaid.render(id, source)
      }

      try {
        const { svg } = await tryRender(content)
        if (!isCancelled) {
          setMermaidSvg(svg)
        }
        return
      } catch (err: any) {
        const rawMessage = err?.message || 'Failed to render Mermaid diagram'
        const sanitized = sanitizeMermaid(content)

        if (sanitized.content !== content && sanitized.fixes.length > 0) {
          try {
            const { svg } = await tryRender(sanitized.content)
            if (!isCancelled) {
              setMermaidSvg(svg)
              setAutoFix({ content: sanitized.content, fixes: sanitized.fixes })
              setMermaidError(null)
            }
            return
          } catch {
            // fall through to friendly error from the original failure
          }
        }

        if (!isCancelled) {
          const explained = explainMermaidError(rawMessage, content)
          setMermaidError({
            summary: explained.summary,
            tip: explained.tip,
            offendingLine: explained.offendingLine,
            raw: rawMessage
          })
          setMermaidSvg(null)
        }
      }
    }

    renderDiagram()
    return () => {
      isCancelled = true
    }
  }, [content, isMermaid, key])

  const refreshCanvas = () => {
    setKey((prev) => prev + 1)
  }

  const getViewportWidth = () => {
    if (viewport === 'mobile') return '375px'
    if (viewport === 'tablet') return '768px'
    return '100%'
  }

  const getIframeSrcDoc = () => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    :root {
      color-scheme: dark;
      --bg-color: #12141a;
      --text-color: #e2e8f0;
      --accent-color: #6366f1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
    }
    a { color: var(--accent-color); }
    img, svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`
  }

  return (
    <div className="shell-canvas-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <div
        className="shell-canvas-controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'var(--bg-card, #1a1d24)',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid var(--border-subtle, #2d3342)',
          fontSize: 12
        }}
      >
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className={`chat-ghost-btn ${viewport === 'desktop' ? 'is-active' : ''}`}
            onClick={() => setViewport('desktop')}
            title="Desktop View (100%)"
            style={{ padding: 4 }}
          >
            <Monitor size={14} />
          </button>
          <button
            className={`chat-ghost-btn ${viewport === 'tablet' ? 'is-active' : ''}`}
            onClick={() => setViewport('tablet')}
            title="Tablet View (768px)"
            style={{ padding: 4 }}
          >
            <Tablet size={14} />
          </button>
          <button
            className={`chat-ghost-btn ${viewport === 'mobile' ? 'is-active' : ''}`}
            onClick={() => setViewport('mobile')}
            title="Mobile View (375px)"
            style={{ padding: 4 }}
          >
            <Smartphone size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className="chat-ghost-btn"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            title="Zoom out"
            style={{ padding: 4 }}
          >
            <ZoomOut size={14} />
          </button>
          <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
            {zoom}%
          </span>
          <button
            className="chat-ghost-btn"
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            title="Zoom in"
            style={{ padding: 4 }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            className="chat-ghost-btn"
            onClick={() => setZoom(100)}
            title="Reset Zoom"
            style={{ padding: 4 }}
          >
            <Maximize2 size={14} />
          </button>

          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

          <button className="chat-ghost-btn" onClick={refreshCanvas} title="Refresh Canvas" style={{ padding: 4 }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div
        className="shell-canvas-viewport-wrapper"
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          overflow: 'auto',
          background: 'var(--bg-main, #0f1117)',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid var(--border-subtle, #2d3342)',
          padding: 12
        }}
      >
        <div
          style={{
            width: getViewportWidth(),
            height: '100%',
            transition: 'width 0.2s ease, transform 0.15s ease',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {isMermaid ? (
            <>
              {autoFix && !bannerDismissed && (
                <div className="shell-mermaid-banner" role="status">
                  <div className="shell-mermaid-banner-body">
                    <Wrench size={14} aria-hidden />
                    <div>
                      <div className="shell-mermaid-banner-title">Auto-fixed Mermaid syntax</div>
                      <ul className="shell-mermaid-banner-fixes">
                        {autoFix.fixes.map((fix) => (
                          <li key={fix}>{fix}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="shell-mermaid-banner-actions">
                    {onApplyFixedContent && (
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          onApplyFixedContent(autoFix.content)
                          setBannerDismissed(true)
                        }}
                      >
                        Apply to editor
                      </button>
                    )}
                    <button type="button" className="chat-ghost-btn" onClick={() => setBannerDismissed(true)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {mermaidError ? (
                <div className="shell-mermaid-error" role="alert">
                  <div className="shell-mermaid-error-header">
                    <AlertCircle size={16} aria-hidden />
                    <span>{mermaidError.summary}</span>
                  </div>
                  {mermaidError.offendingLine !== undefined && (
                    <pre className="shell-mermaid-error-line">{mermaidError.offendingLine}</pre>
                  )}
                  {mermaidError.tip && <p className="shell-mermaid-error-tip">{mermaidError.tip}</p>}
                  <p className="shell-mermaid-error-hint">Switch to the Code tab to edit the diagram source.</p>
                  <details className="shell-mermaid-error-raw">
                    <summary>Parser details</summary>
                    <pre>{mermaidError.raw}</pre>
                  </details>
                </div>
              ) : (
                <div
                  ref={mermaidRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'auto',
                    padding: 16
                  }}
                  dangerouslySetInnerHTML={{ __html: mermaidSvg || '<p>Rendering diagram...</p>' }}
                />
              )}
            </>
          ) : isSvg ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / 16px 16px',
                padding: 16
              }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <iframe
              key={key}
              title={title || 'Shell Canvas Live Preview'}
              srcDoc={getIframeSrcDoc()}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 320,
                border: 'none',
                borderRadius: 'var(--radius-sm, 4px)',
                background: '#12141a'
              }}
              sandbox="allow-scripts"
            />
          )}
        </div>
      </div>
    </div>
  )
}
