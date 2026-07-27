import React, { useState, useEffect } from "react";
import { Server, Sliders, Info, Zap, Play, Square, Download, Trash2, CheckCircle2, Globe, Copy, RefreshCw } from "lucide-react";
import { ProviderConfig } from "./ProviderConfig";
import { EggLogo } from "../brand/EggLogo";
import { useSettingsStore } from "../../stores/settingsStore";
import { useEngineStore } from "../../stores/engineStore";
import { useSearchRuntimeStore } from "../../stores/searchRuntimeStore";
import { useSidebarStore, type SettingsSubTab } from "../../stores/sidebarStore";
import { EngineStatusBadge } from "../common/EngineStatusBadge";

export const SettingsView: React.FC = () => {
  const settingsFocus = useSidebarStore((s) => s.settingsSubTab);
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(
    () => useSidebarStore.getState().settingsSubTab ?? "providers"
  );
  const { settings, fetchSettings, updateSettings, setupListeners: setupSettingsListeners } = useSettingsStore();
  const {
    engineState,
    localModels,
    isInstallingBinary,
    error: engineError,
    startEngine,
    stopEngine,
    installEngine,
    reinstallEngine,
    fetchLocalModels,
    deleteLocalModel,
    loadModel
  } = useEngineStore();
  const {
    runtimeState,
    progress,
    error: searchRuntimeError,
    install,
    start,
    stop,
    repair,
    setupListeners,
    fetchStatus
  } = useSearchRuntimeStore();

  const [systemPrompt, setSystemPrompt] = useState("");
  const [webSearchTestQuery, setWebSearchTestQuery] = useState("latest AI news");
  const [webSearchTestBusy, setWebSearchTestBusy] = useState(false);
  const [webSearchTestMessage, setWebSearchTestMessage] = useState<string | null>(null);
  const [webSearchTestOk, setWebSearchTestOk] = useState<boolean | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showSearchAdvanced, setShowSearchAdvanced] = useState(false);
  const [gpuDevices, setGpuDevices] = useState<
    { id: string; name: string; totalMiB: number; freeMiB: number }[]
  >([]);

  const refreshGpuDevices = React.useCallback(async () => {
    try {
      const devices = await window.goltiAPI.listEngineDevices();
      setGpuDevices(devices || []);
    } catch {
      setGpuDevices([]);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchLocalModels();
    const cleanupSearch = setupListeners();
    const cleanupSettings = setupSettingsListeners();
    return () => {
      cleanupSearch();
      cleanupSettings();
    };
  }, []);

  // Refresh the offload device list once the engine binary is present.
  useEffect(() => {
    if (engineState.status !== "not-installed") refreshGpuDevices();
  }, [engineState.status, refreshGpuDevices]);

  // Apply a GPU/CPU selection: persist it and restart the engine if running.
  const applyEngineDevice = async (device: string) => {
    await updateSettings({ engineDevice: device });
    if (engineState.status === "running") {
      await stopEngine();
      await startEngine();
    }
  };

  useEffect(() => {
    if (settingsFocus) setActiveSubTab(settingsFocus);
  }, [settingsFocus]);

  useEffect(() => {
    if (settings?.systemPrompt) {
      setSystemPrompt(settings.systemPrompt);
    }
  }, [settings]);

  const webSearchReady = runtimeState.status === "running" && runtimeState.apiHealthy;

  const friendlyStatus = () => {
    if (runtimeState.status === "downloading") {
      return progress?.speed === "Installing…" || progress?.speed === "Extracting…"
        ? "Installing Web Search…"
        : "Downloading Web Search…";
    }
    if (runtimeState.status === "starting") return "Starting Web Search…";
    if (webSearchReady) return "Ready — Web Search is available";
    if (runtimeState.status === "error") return runtimeState.error || "Web Search needs attention";
    if (runtimeState.status === "not-installed") return "Not installed yet — turn on Web Search in chat to set up";
    return "Installed — waiting to start";
  };

  const runWebSearchTest = async () => {
    setWebSearchTestBusy(true);
    setWebSearchTestMessage(null);
    setWebSearchTestOk(null);
    try {
      const result = await window.goltiAPI.testWebSearch(webSearchTestQuery);
      setWebSearchTestOk(result.ok);
      if (result.ok) {
        const first = result.results[0];
        setWebSearchTestMessage(
          `Working — ${result.results.length} result${result.results.length === 1 ? "" : "s"}${
            first ? `: ${first.title}` : ""
          }`
        );
      } else {
        setWebSearchTestMessage(result.error || "Web search test failed");
      }
      await fetchStatus();
    } catch (err: any) {
      setWebSearchTestOk(false);
      setWebSearchTestMessage(err?.message || "Web search test failed");
    } finally {
      setWebSearchTestBusy(false);
    }
  };

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
            {/* Engine UI Toggle Setting */}
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Show Golti Engine in UI
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Display status banners and options in Hardware Cookbook and Status Bar.
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings?.engineEnabled ?? true}
                  onChange={(e) => updateSettings({ engineEnabled: e.target.checked })}
                />
              </label>
            </div>

            {/* Status Card */}
            <EngineStatusBadge
              engineState={engineState}
              isInstallingBinary={isInstallingBinary}
              onInstall={installEngine}
              onReinstall={reinstallEngine}
              onStart={startEngine}
              onStop={stopEngine}
            />

              {/* Hardware & Acceleration Settings */}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", background: "var(--bg-app)", padding: "12px", borderRadius: "6px" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Status</span>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: engineState.status === "running" ? "#98c379" : engineState.status === "error" ? "#e06c75" : "var(--text-primary)" }}>
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

              {/* GPU acceleration + device picker */}
              <div style={{ background: "var(--bg-app)", padding: "12px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Acceleration
                  </span>
                  {engineState.status === "running" && (
                    <span style={{ fontSize: "12px", fontWeight: 500, color: engineState.gpuLayers === 0 ? "var(--text-muted)" : "#98c379" }}>
                      {engineState.gpuLayers === 0
                        ? "CPU only"
                        : `GPU · ${engineState.gpuDevice || engineState.backend || "accelerated"}`}
                      {engineState.gpuLayers && engineState.gpuLayers > 0
                        ? ` · ${engineState.gpuLayers} layers`
                        : engineState.gpuLayers === -1
                        ? " · all layers"
                        : ""}
                      {engineState.fellBackToCpu ? " · reduced (fit)" : ""}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Offload to</label>
                  <select
                    value={settings?.engineDevice || "auto"}
                    onChange={(e) => applyEngineDevice(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      padding: "6px 8px",
                      fontSize: "12px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-subtle)"
                    }}
                  >
                    <option value="auto">Auto (pick best GPU)</option>
                    {gpuDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {(d.totalMiB / 1024).toFixed(1)} GB
                      </option>
                    ))}
                    <option value="cpu">CPU only</option>
                  </select>
                  <button
                    onClick={() => refreshGpuDevices()}
                    title="Rescan GPUs"
                    style={{
                      padding: "6px 10px",
                      fontSize: "12px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-subtle)"
                    }}
                  >
                    Rescan
                  </button>
                </div>
                {gpuDevices.length === 0 && (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    No GPU devices detected — the engine will run on CPU. Install the engine first if you just set it up.
                  </span>
                )}
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Changing this restarts the engine. "Auto" sizes GPU layers to fit your VRAM.
                </span>
              </div>

              {engineState.loadedModel && (
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  <strong>Active Loaded Model:</strong> {engineState.loadedModel.split(/[\/\\]/).pop()}
                </div>
              )}

              {(engineState.error || engineError || engineState.status === "error") && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#e06c75",
                    backgroundColor: "rgba(224, 108, 117, 0.08)",
                    border: "1px solid rgba(224, 108, 117, 0.3)",
                    padding: "12px 14px",
                    borderRadius: "6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div>
                      <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>
                        {engineState.failure?.title || "Golti Engine Encountered an Error"}
                      </strong>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {engineState.failure?.detail ||
                          engineState.error ||
                          engineError ||
                          "llama-server process reported a fault."}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <button
                        onClick={() => startEngine()}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "rgba(152, 195, 121, 0.2)",
                          color: "#98c379",
                          border: "1px solid rgba(152, 195, 121, 0.4)",
                          fontSize: "11px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <RefreshCw size={12} /> Retry Launch
                      </button>
                      <button
                        onClick={() => {
                          const logsToCopy = engineState.lastLogs || engineState.error || engineError || "No detailed logs available";
                          navigator.clipboard.writeText(logsToCopy);
                          setCopiedLogs(true);
                          setTimeout(() => setCopiedLogs(false), 2000);
                        }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "11px",
                          fontWeight: 500,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <Copy size={12} /> {copiedLogs ? "Copied Logs!" : "Copy Error Logs"}
                      </button>
                    </div>
                  </div>

                  {(engineState.lastLogs || engineState.error) && (
                    <div style={{ marginTop: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                        Diagnostic Stderr Output:
                      </span>
                      <pre
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "#abb2bf",
                          backgroundColor: "var(--bg-app)",
                          padding: "8px 10px",
                          borderRadius: "4px",
                          maxHeight: "140px",
                          overflowY: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          margin: 0,
                          border: "1px solid var(--border-subtle)"
                        }}
                      >
                        {engineState.lastLogs || engineState.error}
                      </pre>
                    </div>
                  )}
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
                  marginBottom: 8
                }}
              >
                AI Thinking & Reasoning
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Display the model's reasoning chain and duration timer in collapsible blocks for reasoning models (e.g. DeepSeek-R1, Qwen 2.5 Thought, o1/o3).
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings?.showThinkingProcess ?? true}
                  onChange={(e) => updateSettings({ showThinkingProcess: e.target.checked })}
                />
                <span>Show AI thinking process in chat bubbles</span>
              </label>
            </div>

            <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Zap size={16} /> Golti Engine Integration
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Golti Engine runs local GGUF models on your machine. If you only use Cloud APIs (OpenAI, Gemini, Anthropic) or Ollama, you can hide Golti Engine status banners and options.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings?.engineEnabled ?? true}
                  onChange={(e) => updateSettings({ engineEnabled: e.target.checked })}
                />
                <span>Show Golti Engine in Cookbook, Status Bar & Settings</span>
              </label>
            </div>

            <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Globe size={16} /> Web Search
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Self-hosted on your computer. Turn on Web Search in chat to install and start it —
                this page is for repair and advanced options. No API keys required.
              </p>
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: webSearchReady
                    ? "rgba(152, 195, 121, 0.12)"
                    : "rgba(229, 192, 123, 0.12)",
                  color: webSearchReady ? "#98c379" : "#e5c07b",
                  fontSize: 12,
                }}
              >
                {friendlyStatus()}
                {progress && progress.percent < 100 ? ` (${progress.percent}%)` : ''}
                {runtimeState.version ? ` · v${runtimeState.version}` : ''}
              </div>

              {(searchRuntimeError || runtimeState.error) && (
                <div style={{ fontSize: 12, color: 'var(--accent-primary)', marginBottom: 12 }}>
                  {searchRuntimeError || runtimeState.error}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => install().catch(() => {})}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--text-on-accent)',
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  {runtimeState.status === 'not-installed' ? 'Install' : 'Check / Start'}
                </button>
                <button
                  onClick={() => start().catch(() => {})}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    fontSize: 12
                  }}
                >
                  Start
                </button>
                <button
                  onClick={() => stop()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    fontSize: 12
                  }}
                >
                  Stop
                </button>
                <button
                  onClick={() => repair().catch(() => {})}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(224, 108, 117, 0.15)',
                    color: '#e06c75',
                    fontSize: 12
                  }}
                >
                  Repair / Reinstall
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Test search</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={webSearchTestQuery}
                    onChange={(e) => setWebSearchTestQuery(e.target.value)}
                    placeholder="Try a search…"
                    style={{
                      flex: 1,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      padding: '8px',
                      fontSize: 12
                    }}
                  />
                  <button
                    onClick={runWebSearchTest}
                    disabled={webSearchTestBusy}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--text-on-accent)',
                      fontSize: 12,
                      fontWeight: 500,
                      opacity: webSearchTestBusy ? 0.5 : 1
                    }}
                  >
                    {webSearchTestBusy ? 'Testing…' : 'Test'}
                  </button>
                </div>
                {webSearchTestMessage && (
                  <div
                    style={{
                      fontSize: 12,
                      color: webSearchTestOk ? '#98c379' : 'var(--accent-primary)'
                    }}
                  >
                    {webSearchTestMessage}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowSearchAdvanced((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  padding: 0,
                  marginBottom: 8
                }}
              >
                {showSearchAdvanced ? 'Hide advanced' : 'Show advanced'}
              </button>

              {showSearchAdvanced && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    Local API port
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      value={settings?.searchRuntimePort || 8741}
                      onChange={(e) => updateSettings({ searchRuntimePort: Number(e.target.value) })}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        padding: '8px'
                      }}
                    />
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
                            provider: 'local',
                            maxResults: Number(e.target.value),
                            enabled: true,
                            endpoint: settings?.webSearch?.endpoint
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
                  {runtimeState.lastLog && (
                    <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Last log: {runtimeState.lastLog}
                    </div>
                  )}
                </div>
              )}
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
                <EggLogo size={24} title="Golti" />
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

