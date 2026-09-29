import React, { useState } from 'react'
import { AlertCircle, Ban, Check, ChevronRight, Loader2, ShieldCheck, Wrench, X } from 'lucide-react'
import type { ToolApprovalDecision, ToolCallRecord, ToolCallStatus } from '../../../shared/types'

const STATUS_LABEL: Record<ToolCallStatus, string> = {
  'awaiting-approval': 'Waiting for approval',
  running: 'Running…',
  success: 'Done',
  error: 'Failed',
  denied: 'Declined',
  cancelled: 'Stopped'
}

function StatusIcon({ status }: { status: ToolCallStatus }) {
  if (status === 'running') return <Loader2 size={13} className="spin" />
  if (status === 'success') return <Check size={13} />
  if (status === 'error') return <AlertCircle size={13} />
  if (status === 'denied' || status === 'cancelled') return <Ban size={13} />
  return <Wrench size={13} />
}

function formatArgs(args: Record<string, unknown>): string | null {
  const text = JSON.stringify(args ?? {}, null, 2)
  return text === '{}' ? null : text
}

const ApprovalCard: React.FC<{ call: ToolCallRecord }> = ({ call }) => {
  const [responding, setResponding] = useState(false)
  const args = formatArgs(call.arguments)

  const respond = async (decision: ToolApprovalDecision) => {
    setResponding(true)
    try {
      await window.goltiAPI.respondToolApproval(call.id, decision)
    } catch {
      setResponding(false)
    }
  }

  return (
    <div className="tool-call is-awaiting-approval" role="group" aria-label={`Approve ${call.tool}`}>
      <div className="tool-call__head">
        <Wrench size={13} />
        <span className="tool-call__name">
          Run <strong>{call.tool}</strong> <span className="tool-call__server">from {call.serverName}</span>?
        </span>
      </div>
      {args && <pre className="tool-call__code">{args}</pre>}
      <div className="tool-call__actions">
        <button className="tool-call__btn is-primary" disabled={responding} onClick={() => respond('allow')}>
          <Check size={13} /> Allow
        </button>
        <button
          className="tool-call__btn"
          disabled={responding}
          onClick={() => respond('always')}
          title={`Run ${call.serverName} tools without asking from now on`}
        >
          <ShieldCheck size={13} /> Always allow {call.serverName}
        </button>
        <button className="tool-call__btn is-danger" disabled={responding} onClick={() => respond('deny')}>
          <X size={13} /> Deny
        </button>
      </div>
    </div>
  )
}

const ToolCallRow: React.FC<{ call: ToolCallRecord; status: ToolCallStatus }> = ({ call, status }) => {
  const args = formatArgs(call.arguments)
  return (
    <details className={`tool-call is-${status}`}>
      <summary className="tool-call__head">
        <StatusIcon status={status} />
        <span className="tool-call__name">
          <strong>{call.tool}</strong> <span className="tool-call__server">{call.serverName}</span>
        </span>
        <span className="tool-call__status">{STATUS_LABEL[status]}</span>
        <ChevronRight size={12} className="tool-call__chevron" />
      </summary>
      {args && (
        <>
          <div className="tool-call__label">Arguments</div>
          <pre className="tool-call__code">{args}</pre>
        </>
      )}
      {call.result && (
        <>
          <div className="tool-call__label">{status === 'success' ? 'Result' : 'Details'}</div>
          <pre className="tool-call__code">{call.result}</pre>
        </>
      )}
    </details>
  )
}

/** MCP tool calls the assistant made in one reply, with approval prompts for pending ones. */
export const ToolCallList: React.FC<{ calls: ToolCallRecord[]; live: boolean }> = ({ calls, live }) => (
  <div className="tool-calls">
    {calls.map((call) => {
      // A call still pending after its reply stopped streaming was interrupted (e.g. the app quit).
      const pending = call.status === 'awaiting-approval' || call.status === 'running'
      const status: ToolCallStatus = !live && pending ? 'cancelled' : call.status
      return status === 'awaiting-approval' ? (
        <ApprovalCard key={call.id} call={call} />
      ) : (
        <ToolCallRow key={call.id} call={call} status={status} />
      )
    })}
  </div>
)
