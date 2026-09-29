import type { McpServerConfig, McpToolInfo } from './types'

/**
 * A tool call the model wrote into its reply. Models call tools the same way
 * they request web searches: by emitting a fenced block the runtime intercepts,
 * which works on every provider without native function calling.
 */
export interface ToolCallRequest {
  server?: string
  tool: string
  arguments: Record<string, unknown>
  /** The block exactly as the model wrote it, so it can be replayed in history. */
  raw: string
  fenceStart: number
  fenceEnd: number
}

// The canonical form is a ```tool fence. Qwen and Hermes style models are
// trained on <tool_call> tags and fall back to them, so those count too. The
// closing marker is optional because a model may stop right after the JSON.
const TOOL_FENCE = /```tool(?:[-_]?call)?\b[^\S\n]*\n?([\s\S]*?)(?:```|$)/gi
const TOOL_CALL_TAG = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi

function repairJson(body: string): string {
  return body.replace(/[“”]/g, '"').replace(/,(\s*[}\]])/g, '$1')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeToolCall(parsed: unknown): Pick<ToolCallRequest, 'server' | 'tool' | 'arguments'> | null {
  if (!isPlainObject(parsed)) return null
  const tool = nonEmptyString(parsed.tool) || nonEmptyString(parsed.name)
  if (!tool) return null
  let args: unknown = parsed.arguments ?? parsed.args ?? parsed.input ?? parsed.parameters ?? {}
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return null
    }
  }
  if (!isPlainObject(args)) return null
  const server = nonEmptyString(parsed.server)
  return { server: server || undefined, tool, arguments: args }
}

function parseToolBody(raw: string): Pick<ToolCallRequest, 'server' | 'tool' | 'arguments'> | null {
  const body = raw.trim().replace(/^json\s*\n/i, '').trim()
  if (!body.startsWith('{')) return null
  for (const candidate of [body, repairJson(body)]) {
    try {
      return normalizeToolCall(JSON.parse(candidate))
    } catch {
      continue
    }
  }
  return null
}

function matchAll(content: string, pattern: RegExp): RegExpExecArray[] {
  const re = new RegExp(pattern.source, 'gi')
  const found: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    found.push(match)
    if (match[0].length === 0) re.lastIndex++
  }
  return found
}

function findToolBlocks(content: string): RegExpExecArray[] {
  if (!content || (!content.includes('```tool') && !content.includes('<tool_call>'))) return []
  return [...matchAll(content, TOOL_FENCE), ...matchAll(content, TOOL_CALL_TAG)].sort(
    (a, b) => a.index - b.index
  )
}

export function extractToolCalls(content: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = []
  for (const match of findToolBlocks(content)) {
    const parsed = parseToolBody(match[1] || '')
    if (parsed) {
      calls.push({
        ...parsed,
        raw: match[0],
        fenceStart: match.index,
        fenceEnd: match.index + match[0].length
      })
    }
  }
  return calls
}

/**
 * The first tool call in the reply. Only the first one is honoured: anything
 * after it was written without seeing its result.
 */
export function extractToolCall(content: string): ToolCallRequest | null {
  return extractToolCalls(content)[0] ?? null
}

/** Remove tool-call blocks, including a half-streamed one, so raw JSON never renders. */
export function stripToolCalls(content: string): string {
  const blocks = findToolBlocks(content)
  if (!blocks.length) return content
  let out = content
  for (let i = blocks.length - 1; i >= 0; i--) {
    out = out.slice(0, blocks[i].index) + out.slice(blocks[i].index + blocks[i][0].length)
  }
  return out.trim()
}

export function mcpServerSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function serverMatches(tool: McpToolInfo, server: string): boolean {
  return (
    tool.serverId === server ||
    tool.serverName.trim().toLowerCase() === server.trim().toLowerCase() ||
    mcpServerSlug(tool.serverName) === mcpServerSlug(server)
  )
}

function findByName(tools: McpToolInfo[], name: string): McpToolInfo[] {
  const exact = tools.filter((t) => t.name === name)
  if (exact.length) return exact
  const lower = name.toLowerCase()
  return tools.filter((t) => t.name.toLowerCase() === lower)
}

export function toolLabel(tool: { serverName: string; name?: string; tool?: string }): string {
  return `${tool.serverName}/${tool.name ?? tool.tool}`
}

export type ToolResolution = { ok: true; tool: McpToolInfo } | { ok: false; error: string }

/**
 * Match a model's call to a connected tool. Forgiving on purpose: small models
 * misspell server names, change case, or fold the server into the tool name
 * ("github/search_issues"), and a near miss should still run the right tool.
 */
export function resolveToolCall(
  call: Pick<ToolCallRequest, 'server' | 'tool'>,
  tools: McpToolInfo[]
): ToolResolution {
  const pool = call.server ? tools.filter((t) => serverMatches(t, call.server!)) : tools
  let matches = findByName(pool, call.tool)

  if (!matches.length) {
    const separator = /__|[./:]/g
    let sep: RegExpExecArray | null
    while (!matches.length && (sep = separator.exec(call.tool)) !== null) {
      const server = call.tool.slice(0, sep.index)
      const name = call.tool.slice(sep.index + sep[0].length)
      matches = findByName(
        tools.filter((t) => serverMatches(t, server)),
        name
      )
    }
  }

  // A wrong server name with a tool name that is unique across servers.
  if (!matches.length && call.server) matches = findByName(tools, call.tool)

  if (matches.length === 1) return { ok: true, tool: matches[0] }
  if (matches.length > 1) {
    const servers = matches.map((t) => `"${t.serverName}"`).join(', ')
    return {
      ok: false,
      error: `Several servers have a tool named "${call.tool}" (${servers}). Call it again with "server" set to one of them.`
    }
  }
  const available = tools.slice(0, 40).map(toolLabel).join(', ')
  return {
    ok: false,
    error: `There is no tool named "${call.tool}"${call.server ? ` on server "${call.server}"` : ''}. Available tools: ${available || 'none'}.`
  }
}

function describeType(schema: unknown, depth: number): string {
  if (!isPlainObject(schema)) return 'any'
  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.length <= 8) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  }
  const type = Array.isArray(schema.type)
    ? (schema.type as unknown[]).find((t) => t !== 'null')
    : schema.type
  if (type === 'array') {
    const item = describeType(schema.items, depth)
    return item.includes(' ') ? `(${item})[]` : `${item}[]`
  }
  if (type === 'object' || isPlainObject(schema.properties)) {
    return depth < 2 && isPlainObject(schema.properties)
      ? `{ ${describeParams(schema, depth + 1)} }`
      : 'object'
  }
  if (typeof type === 'string') return type
  const variants = (schema.anyOf ?? schema.oneOf) as unknown
  if (Array.isArray(variants) && variants.length) {
    return variants.map((v) => describeType(v, depth)).join(' | ')
  }
  return 'any'
}

/** Compact parameter list, e.g. `path: string, limit?: number`, to keep the catalog small. */
export function describeParams(schema?: Record<string, unknown>, depth = 0): string {
  if (!schema || !isPlainObject(schema.properties)) return ''
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : [])
  return Object.entries(schema.properties)
    .map(([key, value]) => `${key}${required.has(key) ? '' : '?'}: ${describeType(value, depth)}`)
    .join(', ')
}

function shortDescription(text: string | undefined, max = 200): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** System-prompt section that teaches the model the tool protocol and lists every tool. */
export function buildToolCatalogPrompt(tools: McpToolInfo[], maxCalls: number): string {
  const lines = [
    'Tools: you can take real actions through the tools below, which come from MCP servers the user connected.',
    'To call a tool, emit a fenced block exactly like this and write nothing after it:',
    '```tool',
    '{ "server": "server name", "tool": "tool_name", "arguments": { "param": "value" } }',
    '```',
    'The reply pauses there. The tool runs (the user may be asked to approve it first) and its result is handed back to you so you can continue.',
    `Rules: one tool call per message, at the very end. At most ${maxCalls} tool calls per turn. Only call tools listed here, with arguments that match their parameters. Never invent or predict a tool's result - wait for the real one. If a call fails or is declined, adapt: try another approach or tell the user what is blocking you. When the task is done, answer normally without a tool block.`,
    '',
    'Available tools:'
  ]

  const servers = new Map<string, McpToolInfo[]>()
  for (const tool of tools) {
    const list = servers.get(tool.serverName) ?? []
    list.push(tool)
    servers.set(tool.serverName, list)
  }
  for (const [serverName, serverTools] of servers) {
    lines.push(`Server "${serverName}":`)
    for (const tool of serverTools) {
      const description = shortDescription(tool.description)
      lines.push(`- ${tool.name}(${describeParams(tool.inputSchema)})${description ? ` - ${description}` : ''}`)
    }
  }
  return lines.join('\n')
}

/** The subset of an MCP CallToolResult that Golti reads. */
export interface McpCallResult {
  content?: unknown
  structuredContent?: unknown
  isError?: boolean
}

/** Flatten a tool result into text the model can read, capped at `maxChars`. */
export function formatToolResult(result: McpCallResult, maxChars: number): string {
  const parts: string[] = []
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (!isPlainObject(item)) continue
    if (item.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text)
    } else if (item.type === 'image' || item.type === 'audio') {
      parts.push(`[${item.type}: ${item.mimeType || 'unknown type'}]`)
    } else if (item.type === 'resource' && isPlainObject(item.resource)) {
      const resource = item.resource
      parts.push(typeof resource.text === 'string' ? resource.text : `[resource: ${resource.uri || 'unknown'}]`)
    } else if (item.type === 'resource_link') {
      parts.push(`[resource link: ${item.name ? `${item.name} ` : ''}${item.uri}]`)
    }
  }
  if (!parts.length && result.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent, null, 2))
  }
  const text = parts.join('\n\n').trim() || '(the tool returned no content)'
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n… [${text.length - maxChars} more characters cut]`
}

/** Split a command line into argv, honouring quotes, so users can paste a whole command. */
export function parseCommandLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inToken = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && (line[i + 1] === '"' || line[i + 1] === '\\')) current += line[++i]
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      inToken = true
    } else if (/\s/.test(ch)) {
      if (inToken) out.push(current)
      current = ''
      inToken = false
    } else if (ch === '\\' && i + 1 < line.length && /[\s"'\\]/.test(line[i + 1])) {
      current += line[++i]
      inToken = true
    } else {
      current += ch
      inToken = true
    }
  }
  if (inToken) out.push(current)
  return out
}

function quoteArg(arg: string): string {
  if (arg && !/[\s"'\\]/.test(arg)) return arg
  if (!arg.includes("'")) return `'${arg}'`
  return `"${arg.replace(/(["\\])/g, '\\$1')}"`
}

/** Inverse of parseCommandLine, for showing a saved command back in the editor. */
export function formatCommandLine(command: string | undefined, args: string[] | undefined): string {
  return [command || '', ...(args || [])].filter((part, i) => i > 0 || part).map(quoteArg).join(' ')
}

/** Parse `KEY=value` (env) or `Name: value` (headers) lines. Blank lines and `#` comments are skipped. */
export function parseKeyValueLines(text: string, separator: '=' | ':'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(separator)
    if (idx <= 0) continue
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

export function formatKeyValueLines(
  map: Record<string, string> | undefined,
  separator: '=' | ':'
): string {
  const joiner = separator === ':' ? ': ' : '='
  return Object.entries(map || {})
    .map(([key, value]) => `${key}${joiner}${value}`)
    .join('\n')
}

/** Returns a user-facing problem with the config, or null when it can be connected. */
export function validateMcpServerConfig(config: Partial<McpServerConfig>): string | null {
  if (!config.name?.trim()) return 'Give the server a name.'
  if (config.transport === 'http') {
    try {
      const url = new URL(config.url || '')
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'The URL must start with http:// or https://.'
    } catch {
      return 'Enter the server URL, e.g. https://example.com/mcp.'
    }
    return null
  }
  if (config.transport !== 'stdio') return 'Choose how to connect to the server.'
  if (!config.command?.trim()) return 'Enter the command that starts the server, e.g. npx -y @modelcontextprotocol/server-filesystem ~/Documents.'
  return null
}
