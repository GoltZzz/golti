import React from 'react'
import {
  Briefcase,
  Users,
  Kanban,
  Flame,
  UserPlus,
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  BatteryCharging
} from 'lucide-react'
import { useOfficeStore } from '../../stores/officeStore'
import { totalOfficeXP, nextDecorUnlock } from '../../../shared/office-achievements'

export const OfficeTopBar: React.FC = () => {
  const agents = useOfficeStore((s) => s.agents)
  const tasks = useOfficeStore((s) => s.tasks)
  const studioMomentum = useOfficeStore((s) => s.studioMomentum)
  const lightingMode = useOfficeStore((s) => s.lightingMode)
  const toggleLightingMode = useOfficeStore((s) => s.toggleLightingMode)
  const setIsHireModalOpen = useOfficeStore((s) => s.setIsHireModalOpen)
  const triggerTeamMeeting = useOfficeStore((s) => s.triggerTeamMeeting)
  const resetShift = useOfficeStore((s) => s.resetShift)

  const isNight = lightingMode === 'night'
  const workingCount = agents.filter(
    (a) => a.status === 'working' || a.status === 'thinking'
  ).length
  const runningTasksCount = tasks.filter((t) => t.status === 'in_progress').length
  const officeXP = totalOfficeXP(agents)
  const nextUnlock = nextDecorUnlock(officeXP)

  return (
    <header className="office-topbar" role="banner">
      <div className="office-topbar-left">
        {/* Brand */}
        <div className="office-brand-badge">
          <div className="office-brand-icon">
            <Briefcase size={14} />
          </div>
          <span>Golti AI Studio</span>
        </div>

        {/* Live Telemetry Pill */}
        <div className="office-telemetry-pill" title="Active agents generating on the floor">
          <Users size={11} color="var(--accent-blue)" />
          <span>
            <strong>{workingCount}</strong>/{agents.length} Active
          </span>
        </div>

        <div className="office-telemetry-pill" title="In-flight work items">
          <Kanban size={11} color="var(--accent-green)" />
          <span>
            <strong>{runningTasksCount}</strong> Running
          </span>
        </div>

        {/* Momentum Thin Progress Bar */}
        <div className="office-momentum-pill" title="Studio Momentum">
          <div className="office-momentum-label">
            <Flame size={11} />
            <span>Momentum</span>
          </div>
          <div
            className="office-momentum-bar"
            role="progressbar"
            aria-valuenow={studioMomentum}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Studio momentum"
          >
            <div className="office-momentum-fill" style={{ width: `${studioMomentum}%` }} />
          </div>
          <span className="office-momentum-text">{studioMomentum}%</span>
        </div>

        {/* Unlock Progression */}
        {nextUnlock && (
          <div
            className="office-telemetry-pill"
            style={{ fontSize: 10 }}
            title={`Studio XP: ${officeXP.toLocaleString()} - ${nextUnlock.remaining.toLocaleString()} XP to ${nextUnlock.name}`}
          >
            <Sparkles size={10} color="var(--accent-purple)" />
            <span>{nextUnlock.name} in {nextUnlock.remaining} XP</span>
          </div>
        )}
      </div>

      <div className="office-topbar-right">
        {/* Day / Night Toggle */}
        <button
          className="office-btn icon-only"
          onClick={toggleLightingMode}
          title={isNight ? 'Switch to daylight mode' : 'Switch to neon night mode'}
          aria-label={isNight ? 'Switch to daylight mode' : 'Switch to neon night mode'}
        >
          {isNight ? (
            <Moon size={13} color="var(--accent-cyan)" />
          ) : (
            <Sun size={13} color="var(--accent-yellow)" />
          )}
        </button>

        {/* Team Meeting Sync */}
        <button
          className="office-btn"
          onClick={triggerTeamMeeting}
          title="Gather all agents in holographic war room"
        >
          <Sparkles size={12} color="var(--accent-purple)" />
          <span>War Room Sync</span>
        </button>

        {/* Shift Reset */}
        <button
          className="office-btn"
          onClick={resetShift}
          title="Refill token allowances and clear forced coffee breaks"
        >
          <BatteryCharging size={12} color="var(--accent-green)" />
          <span>Shift Reset</span>
        </button>

        {/* Deploy / Hire Agent */}
        <button
          className="office-btn primary"
          onClick={() => setIsHireModalOpen(true)}
          title="Deploy a new specialist AI agent"
        >
          <UserPlus size={12} />
          <span>Hire Agent</span>
        </button>
      </div>
    </header>
  )
}
