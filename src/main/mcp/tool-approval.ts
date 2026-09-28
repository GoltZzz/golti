import type { ToolApprovalDecision } from '../../shared/types'

const pending = new Map<string, (decision: ToolApprovalDecision) => void>()

/**
 * Park a tool call until the user allows or denies it in the chat. Stopping the
 * generation counts as a denial, so an unanswered prompt never hangs a turn.
 */
export function waitForToolApproval(
  toolCallId: string,
  signal: AbortSignal
): Promise<ToolApprovalDecision> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve('deny')
    const settle = (decision: ToolApprovalDecision) => {
      pending.delete(toolCallId)
      signal.removeEventListener('abort', onAbort)
      resolve(decision)
    }
    const onAbort = () => settle('deny')
    pending.set(toolCallId, settle)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Returns false when the call is no longer waiting (already answered or stopped). */
export function resolveToolApproval(toolCallId: string, decision: ToolApprovalDecision): boolean {
  const settle = pending.get(toolCallId)
  if (!settle) return false
  settle(decision)
  return true
}
