import React, { useEffect, useState } from 'react'
import eggLogo from '../../assets/golti-egg.svg'
import type { StartupState, StartupStepStatus } from '../../../shared/types'

/** How long startup may run before the user is offered to continue without it. */
export const STARTUP_SKIP_DELAY_MS = 8000
const LEAVE_ANIMATION_MS = 320

const STATUS_ICONS: Record<StartupStepStatus, string> = {
  pending: '○',
  running: '●',
  done: '✓',
  skipped: '–',
  error: '✕'
}

/**
 * Welcome screen shown while the main process finishes its startup sequence
 * (database, engine, model servers, …). It picks up from the static splash in
 * index.html, lists each step as it runs, and fades out once startup is done.
 * The app renders underneath, so skipping just reveals it early.
 */
export const StartupOverlay: React.FC = () => {
  const [startup, setStartup] = useState<StartupState | null>(null)
  const [phase, setPhase] = useState<'showing' | 'leaving' | 'gone'>('showing')
  const [canSkip, setCanSkip] = useState(false)

  useEffect(() => {
    let alive = true
    const unsubscribe = window.goltiAPI.onStartupProgress((next: StartupState) => {
      if (alive) setStartup(next)
    })
    window.goltiAPI
      .getStartupState()
      .then((initial: StartupState | undefined) => {
        if (!alive) return
        // A renderer reload after startup finished shouldn't replay the welcome screen.
        if (!initial || initial.done) setPhase('gone')
        else setStartup((current) => current ?? initial)
      })
      .catch(() => {
        if (alive) setPhase('gone')
      })
    const skipTimer = setTimeout(() => {
      if (alive) setCanSkip(true)
    }, STARTUP_SKIP_DELAY_MS)
    return () => {
      alive = false
      unsubscribe?.()
      clearTimeout(skipTimer)
    }
  }, [])

  useEffect(() => {
    if (startup?.done && phase === 'showing') setPhase('leaving')
  }, [startup?.done, phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = setTimeout(() => setPhase('gone'), LEAVE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null

  const steps = startup?.steps.filter((s) => s.status !== 'skipped') ?? []
  const settled = startup?.steps.filter((s) => s.status !== 'pending' && s.status !== 'running').length ?? 0
  const total = startup?.steps.length ?? 0
  const current = startup?.steps.find((s) => s.status === 'running')
  const statusText = startup?.done ? 'Ready' : current ? `${current.label}…` : 'Starting…'

  return (
    <div
      className={`startup-screen is-overlay${phase === 'leaving' ? ' is-leaving' : ''}`}
      role="status"
      aria-label="Starting Golti"
      aria-busy={phase === 'showing'}
    >
      <img className="startup-logo" src={eggLogo} alt="" />
      <div className="startup-title">Welcome to Golti</div>
      <div className="startup-status">{statusText}</div>
      <div className={`startup-bar${total ? '' : ' is-indeterminate'}`}>
        <span style={total ? { width: `${Math.round((settled / total) * 100)}%` } : undefined} />
      </div>
      {steps.length > 0 && (
        <ul className="startup-steps">
          {steps.map((step) => (
            <li key={step.id} data-status={step.status} title={step.error}>
              <span className="startup-step-icon" aria-hidden>
                {STATUS_ICONS[step.status]}
              </span>
              <span>
                {step.label}
                {step.status === 'error' && ' — failed'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canSkip && phase === 'showing' && (
        <button className="startup-skip" onClick={() => setPhase('leaving')}>
          Continue while loading
        </button>
      )}
    </div>
  )
}
