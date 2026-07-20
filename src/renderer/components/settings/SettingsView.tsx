import React, { useState, useEffect } from "react";
import { Server, Sliders, Info, Shield, Zap, Play, Square, Download, Trash2, CheckCircle2 } from "lucide-react";
import { ProviderConfig } from "./ProviderConfig";
import { useSettingsStore } from "../../stores/settingsStore";
import { useEngineStore } from "../../stores/engineStore";

export const SettingsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<
    "providers" | "engine" | "general" | "about"
  >("providers");
  const { settings, fetchSettings, updateSettings } = useSettingsStore();
  const {
    engineState,
    localModels,
    isInstallingBinary,
    error: engineError,
    startEngine,
    stopEngine,
    installEngine,
    fetchLocalModels,
    deleteLocalModel,
    loadModel
  } = useEngineStore();

  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    fetchSettings();
    fetchLocalModels();
  }, []);

  useEffect(() => {
    if (settings?.systemPrompt) {
      setSystemPrompt(settings.systemPrompt);
    }
  }, [settings]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-app)",
        overflowY: "auto",
      }}
    >
      {/* Settings Header */}
      <div
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Workspace Settings
        </h2>

        <div
          style={{ display: "flex", gap: "var(--space-2)", marginLeft: "auto" }}
        >
          {[
            {
              id: "providers",
              label: "Providers & APIs",
              icon: <Server size={14} />,
            },
            {
              id: "engine",
              label: "Golti Engine",
              icon: <Zap size={14} />,
            },
            {
              id: "general",
              label: "General & Prompt",
              icon: <Sliders size={14} />,
            },
            { id: "about", label: "About Golti", icon: <Info size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor:
                  activeSubTab === tab.id ? "var(--bg-card)" : "transparent",
                color:
                  activeSubTab === tab.id
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                fontSize: "13px",
                fontWeight: activeSubTab === tab.id ? 500 : 400,
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, padding: "var(--space-4)" }}>
        {activeSubTab === "providers" && <ProviderConfig />}

        {activeSubTab === "engine" && (
          <div
            style={{
              maxWidth: "680px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            {/* Status Card */}
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Zap size={16} style={{ color: "#e5c07b" }} /> Golti Engine Server
                  </h3>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Local standalone inference process running llama-server.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {engineState.status === "not-installed" ? (
                    <button
                      onClick={() => installEngine()}
                      disabled={isInstallingBinary}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "#e5c07b",
                        color: "#1e1e1e",
                        fontWeight: 600,
                        fontSize: "12px"
                      }}
                    >
                      {isInstallingBinary ? "Installing..." : "Install Engine"}
                    </button>
                  ) : engineState.status === "running" ? (
                    <button
                      onClick={() => stopEngine()}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "rgba(224, 108, 117, 0.2)",
                        color: "#e06c75",
                        border: "1px solid rgba(224, 108, 117, 0.4)",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                    >
                      <Square size={12} /> Stop Server
                    </button>
                  ) : (
                    <button
                      onClick={() => startEngine()}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "rgba(152, 195, 121, 0.2)",
                        color: "#98c379",
                        border: "1px solid rgba(152, 195, 121, 0.4)",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                    >
                      <Play size={12} /> Start Server
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", background: "var(--bg-app)", padding: "12px", borderRadius: "6px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Status</span>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: engineState.status === "running" ? "#98c379" : "var(--text-primary)" }}>
                    {engineState.status.toUpperCase()}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Port</span>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>{engineState.port || 8391}</div>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Process PID</span>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>{engineState.pid || "—"}</div>
                </div>
              </div>

              {engineState.loadedModel && (
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  <strong>Active Loaded Model:</strong> {engineState.loadedModel.split(/[\/\\]/).pop()}
                </div>
              )}

              {engineError && (
                <div style={{ fontSize: "12px", color: "#e06c75", backgroundColor: "rgba(224, 108, 117, 0.1)", padding: "8px", borderRadius: "4px" }}>
                  {engineError}
                </div>
              )}
            </div>

            {/* Local Models List */}
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                Downloaded GGUF Models (~/Golti/models)
              </h3>

              {localModels.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  No models downloaded yet. Browse the Hardware Cookbook to download GGUF models directly!
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {localModels.map((m) => {
                    const isLoaded = engineState.loadedModel === m.filepath
                    return (
                      <div
                        key={m.filename}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          backgroundColor: "var(--bg-app)",
                          borderRadius: "6px",
                          border: isLoaded ? "1px solid #98c379" : "1px solid var(--border-subtle)"
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                            {m.filename} {isLoaded && <span style={{ color: "#98c379", fontSize: "11px", marginLeft: "6px" }}><CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> Loaded</span>}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{m.sizeGB} GB</div>
                        </div>

                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => loadModel(m.filepath)}
                            disabled={isLoaded}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "4px",
                              backgroundColor: isLoaded ? "transparent" : "var(--accent-primary)",
                              color: isLoaded ? "var(--text-muted)" : "var(--text-on-accent)",
                              fontSize: "12px",
                              fontWeight: 500
                            }}
                          >
                            {isLoaded ? "Active" : "Load Model"}
                          </button>
                          <button
                            onClick={() => deleteLocalModel(m.filename)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(224, 108, 117, 0.15)",
                              color: "#e06c75",
                              fontSize: "12px"
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === "general" && (
          <div
            style={{
              maxWidth: "640px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                System Prompt
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-2)",
                }}
              >
                This prompt will be prepended to all new conversations to define
                your AI assistant's persona.
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={5}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-input)",
                  border: "1px solid var(--border-medium)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  resize: "vertical",
                }}
              />
              <button
                onClick={() => updateSettings({ systemPrompt })}
                style={{
                  marginTop: "var(--space-2)",
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--accent-primary)",
                  color: "var(--text-on-accent)",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                Save System Prompt
              </button>
            </div>

            <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                Web Search
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Configure a Brave or Tavily API key. Search stays opt-in per prompt from the chat composer.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings?.webSearch?.enabled)}
                  onChange={(e) =>
                    updateSettings({
                      webSearch: {
                        provider: settings?.webSearch?.provider || 'brave',
                        apiKey: settings?.webSearch?.apiKey,
                        maxResults: settings?.webSearch?.maxResults || 5,
                        enabled: e.target.checked
                      }
                    })
                  }
                />
                Enable web search
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  Provider
                  <select
                    value={settings?.webSearch?.provider || 'none'}
                    onChange={(e) =>
                      updateSettings({
                        webSearch: {
                          provider: e.target.value as any,
                          apiKey: settings?.webSearch?.apiKey,
                          maxResults: settings?.webSearch?.maxResults || 5,
                          enabled: settings?.webSearch?.enabled || false
                        }
                      })
                    }
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      padding: '8px'
                    }}
                  >
                    <option value="none">None</option>
                    <option value="brave">Brave</option>
                    <option value="tavily">Tavily</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  Max results
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings?.webSearch?.maxResults || 5}
                    onChange={(e) =>
                      updateSettings({
                        webSearch: {
                          provider: settings?.webSearch?.provider || 'brave',
                          apiKey: settings?.webSearch?.apiKey,
                          maxResults: Number(e.target.value),
                          enabled: settings?.webSearch?.enabled || false
                        }
                      })
                    }
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      padding: '8px'
                    }}
                  />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                API key
                <input
                  type="password"
                  value={settings?.webSearch?.apiKey || ''}
                  onChange={(e) =>
                    updateSettings({
                      webSearch: {
                        provider: settings?.webSearch?.provider || 'brave',
                        apiKey: e.target.value,
                        maxResults: settings?.webSearch?.maxResults || 5,
                        enabled: settings?.webSearch?.enabled || false
                      }
                    })
                  }
                  placeholder="Paste provider API key"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    padding: '8px'
                  }}
                />
              </label>
            </div>

            <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                OS Navigation Layout Preview
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Customize or force preview the top navigation & title bar style for specific operating systems (macOS, Windows, or Linux).
              </p>
              <select
                value={settings?.osPlatformOverride || 'auto'}
                onChange={(e) => updateSettings({ osPlatformOverride: e.target.value as any })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--bg-input)",
                  border: "1px solid var(--border-medium)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  maxWidth: "240px"
                }}
              >
                <option value="auto">Auto (Host Machine OS)</option>
                <option value="darwin">macOS Style (Traffic Lights Inset)</option>
                <option value="win32">Windows Style (Right Controls)</option>
                <option value="linux">Linux Style (GTK Rounded Right Controls)</option>
              </select>
            </div>
          </div>
        )}

        {activeSubTab === "about" && (
          <div
            style={{
              maxWidth: "540px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div
              style={{
                padding: "var(--space-6)",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--accent-primary-alpha)",
                  color: "var(--accent-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto var(--space-3) auto",
                }}
              >
                <Shield size={24} />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 600 }}>
                Golti AI Workspace
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                }}
              >
                Version 1.0.0 · Local-First Desktop App
              </p>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginTop: "var(--space-4)",
                  lineHeight: 1.6,
                }}
              >
                Walang magawa hehe
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

