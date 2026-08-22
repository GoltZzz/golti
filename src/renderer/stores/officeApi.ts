import type {
  Conversation,
  SendMessagePayload,
  StreamChunkPayload,
  OfficeAgent,
  OfficeTask
} from '../../shared/types'

/**
 * Typed view of the office slice of `window.goltiAPI`.
 *
 * The global is declared as `any` for legacy reasons, so every call the office
 * makes goes through here to get real signature checking at the call site.
 */
export interface OfficeApi {
  createConversation: (conv: Conversation) => Promise<void>
  sendMessage: (
    payload: SendMessagePayload
  ) => Promise<{ userMsgId?: string; assistantMsgId: string; generationId: string }>
  cancelGeneration: (generationId: string) => Promise<boolean>
  onStreamChunk: (cb: (chunk: StreamChunkPayload) => void) => () => void

  listOfficeAgents: () => Promise<OfficeAgent[]>
  upsertOfficeAgent: (agent: OfficeAgent) => Promise<void>
  deleteOfficeAgent: (id: string) => Promise<void>
  listOfficeTasks: () => Promise<OfficeTask[]>
  upsertOfficeTask: (task: OfficeTask) => Promise<void>
  deleteOfficeTask: (id: string) => Promise<void>
}

type MaybeApi = Partial<OfficeApi> | undefined

function api(): MaybeApi {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { goltiAPI?: Partial<OfficeApi> }).goltiAPI
}

/** True when the preload bridge exposes real inference. False under jsdom. */
export function hasInferenceBridge(): boolean {
  const a = api()
  return Boolean(a?.sendMessage && a?.createConversation && a?.onStreamChunk)
}

export function hasPersistenceBridge(): boolean {
  const a = api()
  return Boolean(a?.listOfficeAgents && a?.upsertOfficeAgent)
}

export const officeApi = {
  createConversation: (conv: Conversation) => api()?.createConversation?.(conv),

  sendMessage: (payload: SendMessagePayload) => {
    const fn = api()?.sendMessage
    if (!fn) throw new Error('Inference bridge unavailable')
    return fn(payload)
  },

  cancelGeneration: (generationId: string) =>
    api()?.cancelGeneration?.(generationId) ?? Promise.resolve(false),

  onStreamChunk: (cb: (chunk: StreamChunkPayload) => void): (() => void) =>
    api()?.onStreamChunk?.(cb) ?? (() => {}),

  listAgents: () => api()?.listOfficeAgents?.() ?? Promise.resolve([] as OfficeAgent[]),
  upsertAgent: (agent: OfficeAgent) => api()?.upsertOfficeAgent?.(agent),
  deleteAgent: (id: string) => api()?.deleteOfficeAgent?.(id),
  listTasks: () => api()?.listOfficeTasks?.() ?? Promise.resolve([] as OfficeTask[]),
  upsertTask: (task: OfficeTask) => api()?.upsertOfficeTask?.(task),
  deleteTask: (id: string) => api()?.deleteOfficeTask?.(id)
}
