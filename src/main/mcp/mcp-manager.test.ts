import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'url'
import {
  callMcpTool,
  getMcpServerStates,
  listMcpTools,
  onMcpStatusChange,
  reconnectMcpServer,
  stopAllMcpServers,
  syncMcpServers,
  waitForMcpServers
} from './mcp-manager'
import type { McpServerConfig } from '../../shared/types'

const FIXTURE = fileURLToPath(new URL('./__fixtures__/test-server.mjs', import.meta.url))

function fixture(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'fixture',
    name: 'Fixture',
    enabled: true,
    transport: 'stdio',
    command: process.execPath,
    args: [FIXTURE],
    ...overrides
  }
}

function stateOf(id = 'fixture') {
  return getMcpServerStates().find((s) => s.id === id)
}

async function connected(config: McpServerConfig) {
  syncMcpServers([config])
  await waitForMcpServers(15_000)
  return stateOf(config.id)
}

afterEach(async () => {
  await stopAllMcpServers()
})

describe('mcp-manager over stdio', () => {
  it('connects, lists tools and reports the server identity', async () => {
    const state = await connected(fixture())
    expect(state).toMatchObject({ status: 'connected', serverInfo: 'fixture 1.2.3' })
    expect(state!.tools.map((t) => t.name)).toEqual(['echo', 'fail', 'slow', 'env'])
    expect(listMcpTools()[0]).toMatchObject({
      serverId: 'fixture',
      serverName: 'Fixture',
      name: 'echo',
      inputSchema: { required: ['text'] }
    })
  })

  it('calls tools and passes the configured environment', async () => {
    await connected(fixture({ env: { FIXTURE_VALUE: 'from-config' } }))

    const echo = await callMcpTool('fixture', 'echo', { text: 'hi' })
    expect(echo.content).toEqual([{ type: 'text', text: 'echo: hi' }])

    const failed = await callMcpTool('fixture', 'fail', {})
    expect(failed.isError).toBe(true)

    const env = await callMcpTool('fixture', 'env', {})
    expect(env.content).toEqual([{ type: 'text', text: 'from-config' }])
  })

  it('aborts an in-flight call', async () => {
    await connected(fixture())
    const controller = new AbortController()
    const call = callMcpTool('fixture', 'slow', { ms: 10_000 }, controller.signal)
    setTimeout(() => controller.abort(), 50)
    await expect(call).rejects.toThrow()
  })

  it('surfaces the stderr line of a server that exits during startup', async () => {
    const state = await connected(fixture({ env: { FIXTURE_CRASH: 'boom: API key missing' } }))
    expect(state).toMatchObject({ status: 'error', tools: [] })
    expect(state!.error).toBe('The server exited: boom: API key missing')
    expect(state!.lastLogs).toContain('boom: API key missing')
    await expect(callMcpTool('fixture', 'echo', { text: 'x' })).rejects.toThrow(/not connected/)
  })

  it('explains a command that does not exist', async () => {
    const state = await connected(fixture({ command: 'golti-no-such-command', args: [] }))
    expect(state?.status).toBe('error')
    expect(state?.error).toMatch(/Couldn't start "golti-no-such-command"/)
  })

  it('keeps the connection when only auto-approve changes, restarts on real changes', async () => {
    await connected(fixture())

    syncMcpServers([fixture({ autoApprove: true })])
    expect(stateOf()?.status).toBe('connected')

    syncMcpServers([fixture({ env: { FIXTURE_VALUE: 'second' } })])
    expect(stateOf()?.status).toBe('connecting')
    await waitForMcpServers(15_000)
    expect((await callMcpTool('fixture', 'env', {})).content).toEqual([{ type: 'text', text: 'second' }])

    syncMcpServers([fixture({ enabled: false })])
    expect(stateOf()).toBeUndefined()
    expect(listMcpTools()).toEqual([])
  })

  it('reconnects a server on request and notifies listeners', async () => {
    const seen: string[] = []
    const off = onMcpStatusChange((states) => seen.push(states.map((s) => s.status).join(',')))
    await connected(fixture())
    await reconnectMcpServer(fixture())
    off()
    expect(stateOf()?.status).toBe('connected')
    expect(seen.filter((s) => s === 'connected').length).toBeGreaterThanOrEqual(2)
  })
})
