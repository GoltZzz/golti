import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServerConfig, McpToolInfo, Message, StreamChunkPayload } from '../../shared/types'

// Scripted model replies, recorded prompts, and an in-memory message table.
const h = vi.hoisted(() => ({
  replies: [] as string[],
  prompts: [] as Array<{ system?: string; history: Array<{ role: string; content: string }> }>,
  messages: new Map<string, any>(),
  server: undefined as McpServerConfig | undefined,
  tools: [] as McpToolInfo[],
  callMcpTool: vi.fn(),
  upsertServer: vi.fn()
}))

vi.mock('../db/database', () => ({
  dbSettings: {
    get: () => ({ systemPrompt: 'You are Golti.', memoryEnabled: false, reservedOutputTokens: 1024 })
  },
  dbConversations: { get: () => ({ id: 'c1', activeLeafId: null }), update: () => undefined },
  dbMessages: {
    listForConversation: () => [...h.messages.values()],
    get: (id: string) => h.messages.get(id),
    create: (m: Message) => h.messages.set(m.id, { ...m }),
    update: (id: string, u: Partial<Message>) => h.messages.set(id, { ...h.messages.get(id), ...u }),
    createVersion: () => undefined
  },
  dbContext: { list: () => [] },
  dbAttachments: { bindToMessage: () => undefined },
  dbArtifacts: { create: () => undefined },
  dbCitations: { create: () => undefined },
  dbSkills: { upsert: () => undefined },
  dbMcpServers: { get: () => h.server, upsert: h.upsertServer }
}))

vi.mock('./provider-manager', () => ({
  streamChatResponse: async function* (_p: string, _m: string, history: Message[], system?: string) {
    h.prompts.push({ system, history: history.map((m) => ({ role: m.role, content: m.content })) })
    yield { type: 'text', text: h.replies.shift() ?? 'Done.' }
    yield { type: 'done', finishReason: 'stop' }
  }
}))

vi.mock('../mcp/mcp-manager', () => ({
  listMcpTools: () => h.tools,
  waitForMcpServers: async () => undefined,
  callMcpTool: h.callMcpTool
}))
vi.mock('./context-window', () => ({ resolveContextWindow: async () => 8192 }))
vi.mock('./memory-recall', () => ({ buildMemoryRecallBlock: async () => '' }))
vi.mock('./memory-extractor', () => ({ extractAndStoreMemories: async () => [] }))
vi.mock('./attachment-loader', () => ({ loadAttachments: () => ({ byMessage: new Map() }) }))
vi.mock('./model-capabilities', () => ({ resolveModelCapabilities: async () => ({ image: false, pdf: false }) }))
vi.mock('../services/web-search', () => ({
  ensureLocalSearchReady: async () => undefined,
  runWebSearch: async () => []
}))
vi.mock('./deep-research', () => ({ startDeepResearch: () => undefined }))

import { startChatGeneration } from './chat-runtime'
import { resolveToolApproval } from '../mcp/tool-approval'

const READ_CALL = '```tool\n{ "server": "Files", "tool": "read_file", "arguments": { "path": "/a.txt" } }\n```'

function fakeWindow(chunks: StreamChunkPayload[]) {
  return {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (_channel: string, chunk: StreamChunkPayload) => chunks.push(chunk) }
  } as any
}

async function until<T>(read: () => T | undefined, what: string): Promise<T> {
  for (let i = 0; i < 500; i++) {
    const value = read()
    if (value) return value
    await new Promise((r) => setTimeout(r, 2))
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function run(composerMode: 'agent' | 'chat', onApproval?: (toolCallId: string) => void) {
  const chunks: StreamChunkPayload[] = []
  const { assistantMsgId } = await startChatGeneration(fakeWindow(chunks), {
    conversationId: 'c1',
    content: 'What is in /a.txt?',
    model: 'test-model',
    providerId: 'test',
    composerMode
  })
  const answered = new Set<string>()
  await until(() => {
    for (const c of chunks) {
      if (c.toolCall?.status === 'awaiting-approval' && !answered.has(c.toolCall.id)) {
        answered.add(c.toolCall.id)
        onApproval?.(c.toolCall.id)
      }
    }
    return chunks.find((c) => c.done)
  }, 'the reply to finish')
  return { chunks, stored: h.messages.get(assistantMsgId) as Message }
}

beforeEach(() => {
  h.replies = []
  h.prompts = []
  h.messages.clear()
  h.server = { id: 'mcp_fs', name: 'Files', enabled: true, transport: 'stdio', command: 'x' }
  h.tools = [
    {
      serverId: 'mcp_fs',
      serverName: 'Files',
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  ]
  h.callMcpTool.mockReset()
  h.callMcpTool.mockResolvedValue({ content: [{ type: 'text', text: 'hello world' }] })
  h.upsertServer.mockReset()
})

describe('agent-mode MCP tool calls', () => {
  it('asks for approval, runs the tool, and resumes with its result', async () => {
    h.replies = [`Let me look.\n${READ_CALL}\nIt probably says hi.`, 'It says hello world.']

    const { chunks, stored } = await run('agent', (id) => resolveToolApproval(id, 'allow'))

    expect(h.prompts[0].system).toContain('Server "Files":\n- read_file(path: string) - Read a file')
    expect(h.callMcpTool).toHaveBeenCalledWith('mcp_fs', 'read_file', { path: '/a.txt' }, expect.any(AbortSignal))

    // The second pass sees its own call, then the real result.
    const resumed = h.prompts[1].history.slice(-2)
    expect(resumed[0]).toEqual({ role: 'assistant', content: `Let me look.\n${READ_CALL}` })
    expect(resumed[1].role).toBe('system')
    expect(resumed[1].content).toContain('Result of Files/read_file:\nhello world')

    // Text written after the call, without its result, never reaches the user.
    expect(stored.content).toBe('Let me look.\n\nIt says hello world.')
    expect(stored.toolCalls).toHaveLength(1)
    expect(stored.toolCalls![0]).toMatchObject({ tool: 'read_file', status: 'success', result: 'hello world' })
    expect(chunks.filter((c) => c.toolCall).map((c) => c.toolCall!.status)).toEqual([
      'awaiting-approval',
      'running',
      'success'
    ])
  })

  it('tells the model when the user declines, without running the tool', async () => {
    h.replies = [READ_CALL, 'Okay, I will not read it.']

    const { stored } = await run('agent', (id) => resolveToolApproval(id, 'deny'))

    expect(h.callMcpTool).not.toHaveBeenCalled()
    expect(h.prompts[1].history.at(-1)!.content).toContain('The user declined to run Files/read_file')
    expect(stored.toolCalls![0].status).toBe('denied')
    expect(stored.content).toBe('Okay, I will not read it.')
  })

  it('remembers "always allow" and skips approval for trusted servers', async () => {
    h.replies = [READ_CALL, 'Done.']
    await run('agent', (id) => resolveToolApproval(id, 'always'))
    expect(h.upsertServer).toHaveBeenCalledWith(expect.objectContaining({ id: 'mcp_fs', autoApprove: true }))

    h.server = { ...h.server!, autoApprove: true }
    h.replies = [READ_CALL, 'Done again.']
    const { chunks } = await run('agent')
    expect(chunks.some((c) => c.toolCall?.status === 'awaiting-approval')).toBe(false)
    expect(h.callMcpTool).toHaveBeenCalledTimes(2)
  })

  it('reports tool errors and unknown tools back to the model', async () => {
    h.server = { ...h.server!, autoApprove: true }
    h.callMcpTool.mockRejectedValueOnce(new Error('disk on fire'))
    h.replies = [READ_CALL, '```tool\n{ "tool": "delete_all" }\n```', 'Giving up.']

    const { stored } = await run('agent')

    expect(h.prompts[1].history.at(-1)!.content).toContain('Files/read_file failed: disk on fire')
    expect(h.prompts[2].history.at(-1)!.content).toContain('There is no tool named "delete_all"')
    expect(stored.toolCalls!.map((c) => c.status)).toEqual(['error'])
    expect(stored.content).toBe('Giving up.')
  })

  it('stops a model that keeps calling tools past the limit', async () => {
    h.server = { ...h.server!, autoApprove: true }
    h.replies = Array(12).fill(READ_CALL)

    await run('agent')

    expect(h.callMcpTool).toHaveBeenCalledTimes(6)
    expect(h.prompts).toHaveLength(8)
    expect(h.prompts[7].history.at(-1)!.content).toContain('tool-call limit for this turn is reached')
  })

  it('offers no tools in chat mode', async () => {
    h.replies = [READ_CALL]

    await run('chat')

    expect(h.prompts[0].system).not.toContain('Available tools')
    expect(h.prompts).toHaveLength(1)
    expect(h.callMcpTool).not.toHaveBeenCalled()
  })

  it('keeps the no-tools note in agent mode when nothing is connected', async () => {
    h.tools = []
    await run('agent')
    expect(h.prompts[0].system).toContain('no tools are connected right now')
  })
})
