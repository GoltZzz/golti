import { describe, expect, it } from 'vitest'
import {
  buildToolCatalogPrompt,
  describeParams,
  extractToolCall,
  extractToolCalls,
  formatCommandLine,
  formatKeyValueLines,
  formatToolResult,
  parseCommandLine,
  parseKeyValueLines,
  resolveToolCall,
  stripToolCalls,
  validateMcpServerConfig
} from './mcp-tools'
import type { McpToolInfo } from './types'

const tools: McpToolInfo[] = [
  {
    serverId: 'mcp_fs',
    serverName: 'Filesystem',
    name: 'read_file',
    description: 'Read a file',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  { serverId: 'mcp_fs', serverName: 'Filesystem', name: 'search', description: 'Search files' },
  { serverId: 'mcp_gh', serverName: 'GitHub Tools', name: 'search', description: 'Search issues' },
  { serverId: 'mcp_gh', serverName: 'GitHub Tools', name: 'create_issue' }
]

describe('extractToolCall', () => {
  it('parses a ```tool fence and records where it sits', () => {
    const content = 'Let me check.\n```tool\n{ "server": "Filesystem", "tool": "read_file", "arguments": { "path": "/a.txt" } }\n```'
    const call = extractToolCall(content)
    expect(call).toMatchObject({ server: 'Filesystem', tool: 'read_file', arguments: { path: '/a.txt' } })
    expect(content.slice(0, call!.fenceStart)).toBe('Let me check.\n')
    expect(call!.fenceEnd).toBe(content.length)
    expect(call!.raw.startsWith('```tool')).toBe(true)
  })

  it('accepts <tool_call> tags with "name" and stringified arguments', () => {
    const call = extractToolCall('<tool_call>{"name": "search", "arguments": "{\\"q\\": \\"x\\"}"}</tool_call>')
    expect(call).toMatchObject({ tool: 'search', arguments: { q: 'x' }, server: undefined })
  })

  it('tolerates an unclosed fence, smart quotes and trailing commas', () => {
    const call = extractToolCall('```tool_call\n{ “tool”: “search”, "arguments": { "q": "a", }, }')
    expect(call).toMatchObject({ tool: 'search', arguments: { q: 'a' } })
  })

  it('returns the earliest call when several are present', () => {
    const content =
      '```tool\n{"tool": "a"}\n```\ntext\n<tool_call>{"tool": "b"}</tool_call>\n```tool\n{"tool": "c"}\n```'
    expect(extractToolCalls(content).map((c) => c.tool)).toEqual(['a', 'b', 'c'])
    expect(extractToolCall(content)!.tool).toBe('a')
  })

  it('ignores ordinary code blocks, other fence names and malformed bodies', () => {
    expect(extractToolCall('```json\n{"tool": "a"}\n```')).toBeNull()
    expect(extractToolCall('```tools\n{"tool": "a"}\n```')).toBeNull()
    expect(extractToolCall('```tool\nnot json\n```')).toBeNull()
    expect(extractToolCall('```tool\n{"arguments": {}}\n```')).toBeNull()
    expect(extractToolCall('```tool\n{"tool": "a", "arguments": [1]}\n```')).toBeNull()
  })
})

describe('stripToolCalls', () => {
  it('removes finished and half-streamed blocks', () => {
    expect(stripToolCalls('Checking.\n```tool\n{"tool": "a"}\n```')).toBe('Checking.')
    expect(stripToolCalls('Checking.\n```tool\n{"server": "Fi')).toBe('Checking.')
    expect(stripToolCalls('Hi <tool_call>{"name": "a"')).toBe('Hi')
  })

  it('leaves content without tool blocks untouched', () => {
    const text = 'Plain  reply\n```js\nx()\n```\n'
    expect(stripToolCalls(text)).toBe(text)
  })
})

describe('resolveToolCall', () => {
  it('matches server and tool, forgiving case and slug differences', () => {
    expect(resolveToolCall({ server: 'filesystem', tool: 'READ_FILE' }, tools)).toMatchObject({
      ok: true,
      tool: { serverId: 'mcp_fs', name: 'read_file' }
    })
    expect(resolveToolCall({ server: 'github-tools', tool: 'search' }, tools)).toMatchObject({
      ok: true,
      tool: { serverId: 'mcp_gh' }
    })
  })

  it('finds a tool that is unique across servers without a server name', () => {
    expect(resolveToolCall({ tool: 'create_issue' }, tools)).toMatchObject({ ok: true, tool: { serverId: 'mcp_gh' } })
    expect(resolveToolCall({ server: 'Wrong', tool: 'read_file' }, tools)).toMatchObject({ ok: true })
  })

  it('splits a server folded into the tool name', () => {
    expect(resolveToolCall({ tool: 'GitHub Tools/search' }, tools)).toMatchObject({ ok: true, tool: { serverId: 'mcp_gh' } })
    expect(resolveToolCall({ tool: 'filesystem.search' }, tools)).toMatchObject({ ok: true, tool: { serverId: 'mcp_fs' } })
    expect(resolveToolCall({ tool: 'filesystem__search' }, tools)).toMatchObject({ ok: true, tool: { serverId: 'mcp_fs' } })
  })

  it('explains ambiguous and unknown tools', () => {
    const ambiguous = resolveToolCall({ tool: 'search' }, tools)
    expect(ambiguous.ok).toBe(false)
    if (!ambiguous.ok) expect(ambiguous.error).toMatch(/Several servers.*"Filesystem".*"GitHub Tools"/)

    const unknown = resolveToolCall({ tool: 'delete_everything' }, tools)
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error).toContain('Filesystem/read_file')
  })
})

describe('describeParams', () => {
  it('lists parameters compactly with optional markers, enums, arrays and nesting', () => {
    expect(
      describeParams({
        type: 'object',
        properties: {
          path: { type: 'string' },
          limit: { type: 'integer' },
          mode: { enum: ['fast', 'full'] },
          tags: { type: 'array', items: { type: 'string' } },
          kinds: { type: 'array', items: { enum: ['a', 'b'] } },
          opts: { type: 'object', properties: { deep: { type: 'boolean' } }, required: ['deep'] },
          value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          nullable: { type: ['string', 'null'] }
        },
        required: ['path']
      })
    ).toBe(
      'path: string, limit?: integer, mode?: "fast" | "full", tags?: string[], kinds?: ("a" | "b")[], opts?: { deep: boolean }, value?: string | number, nullable?: string'
    )
  })

  it('returns an empty list for tools without parameters', () => {
    expect(describeParams(undefined)).toBe('')
    expect(describeParams({ type: 'object' })).toBe('')
  })
})

describe('buildToolCatalogPrompt', () => {
  it('teaches the fence protocol and groups tools by server', () => {
    const prompt = buildToolCatalogPrompt(tools, 5)
    expect(prompt).toContain('```tool')
    expect(prompt).toContain('At most 5 tool calls per turn')
    expect(prompt).toContain('Server "Filesystem":\n- read_file(path: string) - Read a file\n- search() - Search files')
    expect(prompt).toContain('Server "GitHub Tools":')
    expect(prompt).toContain('- create_issue()')
  })

  it('shortens long descriptions', () => {
    const prompt = buildToolCatalogPrompt(
      [{ serverId: 's', serverName: 'S', name: 't', description: 'word '.repeat(100) }],
      3
    )
    const line = prompt.split('\n').find((l) => l.startsWith('- t('))!
    expect(line.length).toBeLessThan(220)
    expect(line.endsWith('…')).toBe(true)
  })
})

describe('formatToolResult', () => {
  it('joins text and describes non-text content', () => {
    const text = formatToolResult(
      {
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image', data: 'AAAA', mimeType: 'image/png' },
          { type: 'resource', resource: { uri: 'file:///a', text: 'file body' } },
          { type: 'resource', resource: { uri: 'file:///b', blob: 'AAAA' } },
          { type: 'resource_link', uri: 'file:///c', name: 'c' }
        ]
      },
      1000
    )
    expect(text).toBe('hello\n\n[image: image/png]\n\nfile body\n\n[resource: file:///b]\n\n[resource link: c file:///c]')
  })

  it('falls back to structured content, then to a placeholder', () => {
    expect(formatToolResult({ content: [], structuredContent: { n: 1 } }, 1000)).toBe('{\n  "n": 1\n}')
    expect(formatToolResult({}, 1000)).toBe('(the tool returned no content)')
  })

  it('caps long output', () => {
    const text = formatToolResult({ content: [{ type: 'text', text: 'x'.repeat(50) }] }, 10)
    expect(text).toBe(`${'x'.repeat(10)}\n… [40 more characters cut]`)
  })
})

describe('command line helpers', () => {
  it('splits on whitespace and honours quotes and escapes', () => {
    expect(parseCommandLine('npx -y @scope/server  ~/Documents')).toEqual(['npx', '-y', '@scope/server', '~/Documents'])
    expect(parseCommandLine(`node "my server.js" 'it''s' a\\ b ""`)).toEqual(['node', 'my server.js', 'its', 'a b', ''])
    expect(parseCommandLine('cmd C:\\Users\\me')).toEqual(['cmd', 'C:\\Users\\me'])
    expect(parseCommandLine('   ')).toEqual([])
  })

  it('round-trips through formatCommandLine', () => {
    const args = ['--root', 'C:\\Program Files\\x', "it's", 'say "hi"', '', 'plain']
    const line = formatCommandLine('node', args)
    expect(parseCommandLine(line)).toEqual(['node', ...args])
  })
})

describe('key/value helpers', () => {
  it('parses env and header lines, skipping blanks and comments', () => {
    expect(parseKeyValueLines('A=1\n\n# note\nB = two=2\nbad line', '=')).toEqual({ A: '1', B: 'two=2' })
    expect(parseKeyValueLines('Authorization: Bearer abc:def', ':')).toEqual({ Authorization: 'Bearer abc:def' })
  })

  it('formats back to editable text', () => {
    expect(formatKeyValueLines({ A: '1', B: '2' }, '=')).toBe('A=1\nB=2')
    expect(formatKeyValueLines({ Authorization: 'Bearer x' }, ':')).toBe('Authorization: Bearer x')
    expect(formatKeyValueLines(undefined, '=')).toBe('')
  })
})

describe('validateMcpServerConfig', () => {
  it('requires a name and the fields for the chosen transport', () => {
    expect(validateMcpServerConfig({ transport: 'stdio', command: 'npx' })).toMatch(/name/)
    expect(validateMcpServerConfig({ name: 'a', transport: 'stdio', command: ' ' })).toMatch(/command/)
    expect(validateMcpServerConfig({ name: 'a', transport: 'http', url: 'ftp://x' })).toMatch(/http/)
    expect(validateMcpServerConfig({ name: 'a', transport: 'http', url: 'nope' })).toMatch(/URL/)
    expect(validateMcpServerConfig({ name: 'a', transport: 'stdio', command: 'npx' })).toBeNull()
    expect(validateMcpServerConfig({ name: 'a', transport: 'http', url: 'https://x.dev/mcp' })).toBeNull()
  })
})
