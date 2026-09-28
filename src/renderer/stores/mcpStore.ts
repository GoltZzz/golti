import { create } from 'zustand'
import type { McpServerConfig, McpServerState } from '../../shared/types'

interface McpStore {
  servers: McpServerConfig[]
  /** Live state by server id. Enabled servers only. */
  states: Record<string, McpServerState>
  loading: boolean
  error: string | null

  fetchServers: () => Promise<void>
  saveServer: (server: McpServerConfig) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  reconnect: (id: string) => Promise<void>
  setupListeners: () => () => void
}

function byId(states: McpServerState[]): Record<string, McpServerState> {
  return Object.fromEntries(states.map((s) => [s.id, s]))
}

export const useMcpStore = create<McpStore>((set) => ({
  servers: [],
  states: {},
  loading: false,
  error: null,

  fetchServers: async () => {
    set({ loading: true, error: null })
    try {
      const [servers, states] = await Promise.all([
        window.goltiAPI.listMcpServers() as Promise<McpServerConfig[]>,
        window.goltiAPI.getMcpStatus() as Promise<McpServerState[]>
      ])
      set({ servers, states: byId(states), loading: false })
    } catch (err: any) {
      set({ loading: false, error: err?.message || 'Failed to load MCP servers' })
    }
  },

  // Errors propagate so the editor can show them next to the form.
  saveServer: async (server) => {
    const saved: McpServerConfig = await window.goltiAPI.saveMcpServer(server)
    set((state) => {
      const exists = state.servers.some((s) => s.id === saved.id)
      return {
        servers: exists
          ? state.servers.map((s) => (s.id === saved.id ? saved : s))
          : [...state.servers, saved]
      }
    })
  },

  deleteServer: async (id) => {
    await window.goltiAPI.deleteMcpServer(id)
    set((state) => ({ servers: state.servers.filter((s) => s.id !== id) }))
  },

  reconnect: async (id) => {
    const states: McpServerState[] = await window.goltiAPI.reconnectMcpServer(id)
    set({ states: byId(states) })
  },

  setupListeners: () =>
    window.goltiAPI.onMcpStatusChange((states: McpServerState[]) => set({ states: byId(states) }))
}))
