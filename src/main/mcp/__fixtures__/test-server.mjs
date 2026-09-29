// Minimal stdio MCP server used by mcp-manager.test.ts.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

if (process.env.FIXTURE_CRASH) {
  process.stderr.write(`${process.env.FIXTURE_CRASH}\n`)
  process.exit(1)
}

process.stderr.write('fixture server starting\n')

const server = new Server({ name: 'fixture', version: '1.2.3' }, { capabilities: { tools: { listChanged: true } } })

const tools = [
  {
    name: 'echo',
    description: 'Echo the text back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
  },
  { name: 'fail', description: 'Always reports an error', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'slow',
    description: 'Wait before answering',
    inputSchema: { type: 'object', properties: { ms: { type: 'number' } } }
  },
  { name: 'env', description: 'Read FIXTURE_VALUE', inputSchema: { type: 'object', properties: {} } }
]

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {}
  switch (request.params.name) {
    case 'echo':
      return { content: [{ type: 'text', text: `echo: ${args.text}` }] }
    case 'fail':
      return { isError: true, content: [{ type: 'text', text: 'it broke' }] }
    case 'slow':
      await new Promise((resolve) => setTimeout(resolve, Number(args.ms) || 5000))
      return { content: [{ type: 'text', text: 'done' }] }
    case 'env':
      return { content: [{ type: 'text', text: process.env.FIXTURE_VALUE ?? '(unset)' }] }
    default:
      throw new Error(`unknown tool ${request.params.name}`)
  }
})

await server.connect(new StdioServerTransport())
