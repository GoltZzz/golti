import React, { useEffect, useState } from "react";
import { Plug, Plus, Pencil, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { useMcpStore } from "../../stores/mcpStore";
import {
  formatCommandLine,
  formatKeyValueLines,
  parseCommandLine,
  parseKeyValueLines,
  validateMcpServerConfig
} from "../../../shared/mcp-tools";
import type { McpServerConfig, McpServerState, McpTransport } from "../../../shared/types";

interface DraftState {
  id: string | null;
  name: string;
  enabled: boolean;
  transport: McpTransport;
  commandLine: string;
  env: string;
  cwd: string;
  url: string;
  headers: string;
  autoApprove: boolean;
}

const emptyDraft: DraftState = {
  id: null,
  name: "",
  enabled: true,
  transport: "stdio",
  commandLine: "",
  env: "",
  cwd: "",
  url: "",
  headers: "",
  autoApprove: false
};

const fieldLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "var(--text-muted)"
};

function draftFrom(server: McpServerConfig): DraftState {
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    transport: server.transport,
    commandLine: formatCommandLine(server.command, server.args),
    env: formatKeyValueLines(server.env, "="),
    cwd: server.cwd || "",
    url: server.url || "",
    headers: formatKeyValueLines(server.headers, ":"),
    autoApprove: !!server.autoApprove
  };
}

function configFrom(draft: DraftState): McpServerConfig {
  const base = {
    id: draft.id ?? `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: draft.name.trim(),
    enabled: draft.enabled,
    transport: draft.transport,
    autoApprove: draft.autoApprove || undefined
  };
  if (draft.transport === "http") {
    const headers = parseKeyValueLines(draft.headers, ":");
    return { ...base, url: draft.url.trim(), headers: Object.keys(headers).length ? headers : undefined };
  }
  const [command = "", ...args] = parseCommandLine(draft.commandLine);
  const env = parseKeyValueLines(draft.env, "=");
  return {
    ...base,
    command,
    args,
    env: Object.keys(env).length ? env : undefined,
    cwd: draft.cwd.trim() || undefined
  };
}

function statusText(server: McpServerConfig, state: McpServerState | undefined): string {
  if (!server.enabled) return "Disabled";
  if (!state || state.status === "connecting") return "Connecting…";
  if (state.status === "error") return "Couldn't connect";
  const count = `${state.tools.length} tool${state.tools.length === 1 ? "" : "s"}`;
  return state.serverInfo ? `${count} · ${state.serverInfo}` : count;
}

function statusKind(server: McpServerConfig, state: McpServerState | undefined): string {
  if (!server.enabled) return "off";
  return state?.status ?? "connecting";
}

export const McpSettings: React.FC = () => {
  const { servers, states, loading, error, fetchServers, saveServer, deleteServer, reconnect, setupListeners } =
    useMcpStore();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
    return setupListeners();
  }, []);

  const save = async () => {
    if (!draft) return;
    const config = configFrom(draft);
    const problem = validateMcpServerConfig(config);
    if (problem) return setSaveError(problem);
    const clash = servers.find(
      (s) => s.id !== config.id && s.name.trim().toLowerCase() === config.name.toLowerCase()
    );
    if (clash) return setSaveError(`A server named "${clash.name}" already exists.`);

    setSaving(true);
    setSaveError(null);
    try {
      await saveServer(config);
      setDraft(null);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save server");
    } finally {
      setSaving(false);
    }
  };

  const runReconnect = async (id: string) => {
    setReconnecting(id);
    try {
      await reconnect(id);
    } finally {
      setReconnecting(null);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-card">
        <h3 className="settings-card__title">
          <Plug size={16} /> MCP Servers
        </h3>
        <p className="settings-card__desc">
          Connect Model Context Protocol servers to give the assistant tools, like reading your files or working with
          other apps. Tools are offered in <strong>Agent</strong> mode (press <code>Shift+Tab</code> in the message
          box), and every call asks for your approval unless you trust the server.
        </p>

        {!draft && (
          <div>
            <button
              onClick={() => {
                setSaveError(null);
                setDraft({ ...emptyDraft });
              }}
              className="settings-btn settings-btn--primary"
            >
              <Plus size={14} /> New Server
            </button>
          </div>
        )}

        {error && <div className="settings-error">{error}</div>}

        {draft && (
          <div className="settings-subpanel">
            <span className="settings-eyebrow">{draft.id ? "Edit server" : "New server"}</span>

            <label style={fieldLabelStyle}>
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Filesystem"
                className="settings-input"
                autoFocus
              />
            </label>

            <div style={fieldLabelStyle}>
              Connection
              <div className="settings-btn-row" role="radiogroup" aria-label="Connection type">
                {(
                  [
                    ["stdio", "Local command"],
                    ["http", "Remote URL"]
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={draft.transport === value}
                    onClick={() => setDraft({ ...draft, transport: value })}
                    className={
                      "settings-btn " + (draft.transport === value ? "settings-btn--primary" : "settings-btn--ghost")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {draft.transport === "stdio" ? (
              <>
                <label style={fieldLabelStyle}>
                  Command
                  <input
                    value={draft.commandLine}
                    onChange={(e) => setDraft({ ...draft, commandLine: e.target.value })}
                    placeholder="npx -y @modelcontextprotocol/server-filesystem ~/Documents"
                    className="settings-input mcp-mono"
                    spellCheck={false}
                  />
                </label>
                <span className="settings-hint">
                  The full command that starts the server. Quote arguments that contain spaces.
                </span>

                <label style={fieldLabelStyle}>
                  Environment variables (optional)
                  <textarea
                    value={draft.env}
                    onChange={(e) => setDraft({ ...draft, env: e.target.value })}
                    rows={3}
                    className="settings-textarea mcp-mono"
                    placeholder={"API_KEY=…\nOne KEY=value per line"}
                    spellCheck={false}
                  />
                </label>

                <label style={fieldLabelStyle}>
                  Working directory (optional)
                  <input
                    value={draft.cwd}
                    onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                    placeholder="~/projects/my-app"
                    className="settings-input mcp-mono"
                    spellCheck={false}
                  />
                </label>
              </>
            ) : (
              <>
                <label style={fieldLabelStyle}>
                  URL
                  <input
                    value={draft.url}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    placeholder="https://example.com/mcp"
                    className="settings-input mcp-mono"
                    spellCheck={false}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  Headers (optional)
                  <textarea
                    value={draft.headers}
                    onChange={(e) => setDraft({ ...draft, headers: e.target.value })}
                    rows={3}
                    className="settings-textarea mcp-mono"
                    placeholder={"Authorization: Bearer …\nOne Name: value per line"}
                    spellCheck={false}
                  />
                </label>
              </>
            )}

            <label className="settings-check">
              <input
                type="checkbox"
                checked={draft.autoApprove}
                onChange={(e) => setDraft({ ...draft, autoApprove: e.target.checked })}
              />
              Run this server's tools without asking
            </label>
            <span className="settings-hint">
              Only for servers you trust: the assistant can then act through them without checking with you first.
            </span>

            {saveError && <div className="settings-error">{saveError}</div>}

            <div className="settings-btn-row">
              <button onClick={save} disabled={saving} className="settings-btn settings-btn--primary">
                {saving ? "Saving…" : draft.id ? "Save Changes" : "Add Server"}
              </button>
              <button onClick={() => setDraft(null)} className="settings-btn settings-btn--ghost">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Your Servers ({servers.length})</h3>

        {loading && servers.length === 0 ? (
          <p className="settings-card__desc">Loading servers…</p>
        ) : servers.length === 0 ? (
          <p className="settings-card__desc">No servers yet. Add one above to give the assistant its first tools.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {servers.map((server) => {
              const state = states[server.id];
              const kind = statusKind(server, state);
              return (
                <div key={server.id} className={"mcp-server" + (draft?.id === server.id ? " model-row--active" : "")}>
                  <div className="mcp-server__head">
                    <span className={`mcp-dot is-${kind}`} aria-hidden="true" />
                    <div className="mcp-server__info">
                      <div className="model-row__name">
                        {server.name}
                        {server.autoApprove && <span className="settings-hint">runs without asking</span>}
                      </div>
                      <div className="model-row__size">{statusText(server, state)}</div>
                      <div className="mcp-server__target mcp-mono">
                        {server.transport === "http" ? server.url : formatCommandLine(server.command, server.args)}
                      </div>
                    </div>

                    <div className="mcp-server__actions">
                      <label className="settings-check" title={server.enabled ? "Disable server" : "Enable server"}>
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          onChange={() => saveServer({ ...server, enabled: !server.enabled })}
                        />
                        On
                      </label>
                      {server.enabled && (
                        <button
                          onClick={() => runReconnect(server.id)}
                          disabled={reconnecting === server.id}
                          className="settings-btn settings-btn--ghost"
                          title="Restart the connection"
                        >
                          {reconnecting === server.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSaveError(null);
                          setDraft(draftFrom(server));
                        }}
                        className="settings-btn settings-btn--ghost"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      {confirmDelete === server.id ? (
                        <>
                          <button
                            onClick={async () => {
                              await deleteServer(server.id);
                              setConfirmDelete(null);
                              if (draft?.id === server.id) setDraft(null);
                            }}
                            className="settings-btn settings-btn--danger"
                          >
                            Confirm
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="settings-btn settings-btn--ghost">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(server.id)}
                          className="settings-btn settings-btn--danger"
                          aria-label={`Delete ${server.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {server.enabled && state?.status === "error" && (
                    <div className="settings-error">
                      <span>{state.error}</span>
                      {state.lastLogs && <pre className="settings-error__log">{state.lastLogs}</pre>}
                    </div>
                  )}

                  {server.enabled && state?.status === "connected" && state.tools.length > 0 && (
                    <details className="mcp-tools">
                      <summary>Show tools</summary>
                      <ul>
                        {state.tools.map((tool) => (
                          <li key={tool.name}>
                            <code>{tool.name}</code>
                            {tool.description && <span> - {tool.description}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
