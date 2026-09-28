import os from 'os'
import path from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import type { McpServerConfig, McpServerState, McpToolInfo } from '../../shared/types'
import type { McpCallResult } from '../../shared/mcp-tools'

/** First runs of `npx` servers download the package, so the handshake gets generous time. */
const CONNECT_TIMEOUT_MS = 90_000
const LIST_TOOLS_TIMEOUT_MS = 30_000
/** Per-call ceiling; progress notifications from the server reset it. */
const CALL_TIMEOUT_MS = 120_000
const MAX_LOG_LINES = 40
const MAX_TOOLS_PER_SERVER = 500

interface Connection {
  config: McpServerConfig
  client: Client
  state: McpServerState
  /** Recent stderr lines of a stdio server. */
  logs: string[]
  /** Settles once the connect attempt finishes, whatever the outcome. */
  ready: Promise<void>
  /** Set when this connection was stopped or replaced; late results are dropped. */
  closed: boolean
}

const connections = new Map<string, Connection>()
const listeners = new Set<(states: McpServerState[]) => void>()

function clientVersion(): string {
  try {
    // Lazy require so tests can run without Electron.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('electron') as typeof import('electron')).app.getVersion()
  } catch {
    return '0.0.0'
  }
}

function isLive(conn: Connection): boolean {
  return !conn.closed && connections.get(conn.config.id) === conn
}

function emit(): void {
  const states = getMcpServerStates()
  for (const listener of listeners) listener(states)
}

function setState(conn: Connection, patch: Partial<McpServerState>): void {
  conn.state = { ...conn.state, ...patch }
  emit()
}

export function onMcpStatusChange(listener: (states: McpServerState[]) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** States of every enabled server. A server with no entry is disabled. */
export function getMcpServerStates(): McpServerState[] {
  return [...connections.values()].map((c) => ({ ...c.state }))
}

/** Tools of every connected server, in server order. */
export function listMcpTools(): McpToolInfo[] {
  return [...connections.values()]
    .filter((c) => c.state.status === 'connected')
    .flatMap((c) => c.state.tools)
}

function expandHome(p: string): string {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(1))
  return p
}

/** Fields that change how Golti reaches the server. Toggling auto-approve must not restart it. */
function connectionKey(config: McpServerConfig): string {
  const { autoApprove: _autoApprove, enabled: _enabled, ...rest } = config
  return JSON.stringify(rest)
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function createClient(serverId: string): Client {
  const client = new Client({ name: 'golti', version: clientVersion() })
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    const conn = connections.get(serverId)
    if (!conn || conn.client !== client || conn.state.status !== 'connected') return
    try {
      const tools = await fetchTools(conn)
      if (isLive(conn)) setState(conn, { tools })
    } catch (err) {
      console.warn(`[MCP] Refreshing tools of ${conn.config.name} failed:`, err)
    }
  })
  return client
}

function stdioTransport(conn: Connection): StdioClientTransport {
  const { command, args, env, cwd } = conn.config
  const transport = new StdioClientTransport({
    command: expandHome((command || '').trim()),
    args: (args || []).map(expandHome),
    env,
    cwd: cwd?.trim() ? expandHome(cwd.trim()) : undefined,
    stderr: 'pipe'
  })
  transport.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.trim())
    conn.logs.push(...lines)
    if (conn.logs.length > MAX_LOG_LINES) conn.logs.splice(0, conn.logs.length - MAX_LOG_LINES)
  })
  return transport
}

async function connectHttp(conn: Connection): Promise<void> {
  const url = new URL(conn.config.url || '')
  const requestInit: RequestInit = { headers: conn.config.headers || {} }
  try {
    await conn.client.connect(new StreamableHTTPClientTransport(url, { requestInit }), {
      timeout: CONNECT_TIMEOUT_MS
    })
  } catch (err) {
    if (!isLive(conn)) throw err
    // Servers built before Streamable HTTP only speak the older SSE transport.
    await conn.client.close().catch(() => undefined)
    conn.client = createClient(conn.config.id)
    try {
      await conn.client.connect(new SSEClientTransport(url, { requestInit }), { timeout: CONNECT_TIMEOUT_MS })
    } catch {
      throw err
    }
  }
}

async function fetchTools(conn: Connection): Promise<McpToolInfo[]> {
  // A server may offer only prompts or resources; asking it for tools would fail.
  if (!conn.client.getServerCapabilities()?.tools) return []
  const tools: McpToolInfo[] = []
  let cursor: string | undefined
  do {
    const page = await conn.client.listTools(cursor ? { cursor } : undefined, {
      timeout: LIST_TOOLS_TIMEOUT_MS
    })
    for (const tool of page.tools) {
      tools.push({
        serverId: conn.config.id,
        serverName: conn.config.name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>
      })
    }
    cursor = page.nextCursor
  } while (cursor && tools.length < MAX_TOOLS_PER_SERVER)
  return tools
}

function describeError(err: unknown, conn: Connection): string {
  const error = err as NodeJS.ErrnoException | undefined
  if (error?.code === 'ENOENT' && conn.config.transport === 'stdio') {
    return `Couldn't start "${conn.config.command}". Check that it is installed and on your PATH.`
  }
  const message = error?.message || String(err)
  const lastLog = conn.logs[conn.logs.length - 1]
  // A process that exits during the handshake only reports "Connection closed"; its stderr says why.
  if (/connection closed/i.test(message) && lastLog) return `The server exited: ${lastLog}`
  return message
}

async function open(conn: Connection): Promise<void> {
  try {
    const connecting =
      conn.config.transport === 'http'
        ? connectHttp(conn)
        : conn.client.connect(stdioTransport(conn), { timeout: CONNECT_TIMEOUT_MS })
    await withTimeout(connecting, CONNECT_TIMEOUT_MS + 5_000, 'Timed out waiting for the server to respond.')
    if (!isLive(conn)) return

    const tools = await fetchTools(conn)
    if (!isLive(conn)) return

    const client = conn.client
    client.onclose = () => {
      if (!isLive(conn) || conn.client !== client) return
      setState(conn, {
        status: 'error',
        tools: [],
        error: 'The server stopped. Reconnect it to use its tools again.',
        lastLogs: conn.logs.join('\n') || undefined
      })
    }
    const info = client.getServerVersion()
    setState(conn, {
      status: 'connected',
      tools,
      error: undefined,
      serverInfo: info ? `${info.name} ${info.version}` : undefined,
      lastLogs: undefined
    })
  } catch (err) {
    if (!isLive(conn)) return
    conn.closed = true
    await conn.client.close().catch(() => undefined)
    setState(conn, {
      status: 'error',
      tools: [],
      error: describeError(err, conn),
      lastLogs: conn.logs.join('\n') || undefined
    })
  }
}

function connect(config: McpServerConfig): Connection {
  const conn: Connection = {
    config,
    client: createClient(config.id),
    state: { id: config.id, status: 'connecting', tools: [] },
    logs: [],
    ready: Promise.resolve(),
    closed: false
  }
  connections.set(config.id, conn)
  conn.ready = open(conn)
  emit()
  return conn
}

async function disconnect(id: string): Promise<void> {
  const conn = connections.get(id)
  if (!conn) return
  connections.delete(id)
  conn.closed = true
  await conn.client.close().catch(() => undefined)
}

/**
 * Bring live connections in line with the saved configs: start newly enabled
 * servers, stop removed or disabled ones, and restart any whose connection
 * settings changed.
 */
export function syncMcpServers(configs: McpServerConfig[]): void {
  const wanted = new Map(configs.filter((c) => c.enabled).map((c) => [c.id, c]))
  let removed = false
  for (const [id, conn] of [...connections]) {
    const next = wanted.get(id)
    if (!next) {
      void disconnect(id)
      removed = true
    } else if (connectionKey(next) !== connectionKey(conn.config)) {
      void disconnect(id)
      connect(next)
    } else {
      conn.config = next
    }
  }
  for (const [id, config] of wanted) {
    if (!connections.has(id)) connect(config)
  }
  if (removed) emit()
}

/** Restart one server, e.g. after it crashed, and wait for the outcome. */
export async function reconnectMcpServer(config: McpServerConfig): Promise<void> {
  await disconnect(config.id)
  if (!config.enabled) {
    emit()
    return
  }
  await connect(config).ready
}

/** Wait up to `timeoutMs` for servers that are still connecting, so a turn sees their tools. */
export async function waitForMcpServers(timeoutMs: number): Promise<void> {
  const pending = [...connections.values()]
    .filter((c) => c.state.status === 'connecting')
    .map((c) => c.ready)
  if (!pending.length) return
  await withTimeout(Promise.allSettled(pending), timeoutMs, 'timeout').catch(() => undefined)
}

export async function callMcpTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<McpCallResult> {
  const conn = connections.get(serverId)
  if (!conn || conn.state.status !== 'connected') {
    throw new Error(`${conn?.config.name ?? 'That MCP server'} is not connected`)
  }
  return (await conn.client.callTool({ name, arguments: args }, undefined, {
    signal,
    timeout: CALL_TIMEOUT_MS,
    resetTimeoutOnProgress: true,
    onprogress: () => undefined
  })) as McpCallResult
}

/** Close every connection; stdio servers are terminated. Used on quit. */
export async function stopAllMcpServers(): Promise<void> {
  await Promise.all([...connections.keys()].map(disconnect))
  emit()
}
