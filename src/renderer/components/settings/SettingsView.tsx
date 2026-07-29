import React, { useState, useEffect } from "react";
import { Server, Sliders, Info, Zap, Download, Trash2, CheckCircle2, Globe, Copy, RefreshCw, BrainCircuit, MonitorSmartphone, SquareSlash } from "lucide-react";
import { ProviderConfig } from "./ProviderConfig";
import { SkillsSettings } from "./SkillsSettings";
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

  const tabs: { id: SettingsSubTab; label: string; icon: React.ReactNode }[] = [
    { id: "providers", label: "Providers & APIs", icon: <Server size={14} /> },
    { id: "engine", label: "Golti Engine", icon: <Zap size={14} /> },
    { id: "skills", label: "Skills", icon: <SquareSlash size={14} /> },
    { id: "general", label: "General & Prompt", icon: <Sliders size={14} /> },
    { id: "about", label: "About Golti", icon: <Info size={14} /> },
  ];

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h2 className="settings-title">Workspace Settings</h2>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeSubTab === tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className="settings-tab"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-content">
        {activeSubTab === "providers" && <ProviderConfig />}

        {activeSubTab === "engine" && (
          <div className="settings-panel settings-panel--wide">
            {/* Engine UI Toggle Setting */}
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row__label">Show Golti Engine in UI</div>
                  <div className="settings-row__sub">
                    Display status banners and options in Hardware Cookbook and Status Bar.
                  </div>
                </div>
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={settings?.engineEnabled ?? true}
                    onChange={(e) => updateSettings({ engineEnabled: e.target.checked })}
                  />
                </label>
              </div>
            </div>

            {/* Status hero */}
            <EngineStatusBadge
              engineState={engineState}
              isInstallingBinary={isInstallingBinary}
              onInstall={installEngine}
              onReinstall={reinstallEngine}
              onStart={startEngine}
              onStop={stopEngine}
            />

            {/* Hardware & Acceleration */}
            <div className="settings-card">
              <div className="stat-grid">
                <div>
                  <span className="stat-tile__label">Status</span>
                  <div
                    className={
                      "stat-tile__value" +
                      (engineState.status === "running"
                        ? " stat-tile__value--ok"
                        : engineState.status === "error"
                        ? " stat-tile__value--err"
                        : "")
                    }
                  >
                    {engineState.status.toUpperCase()}
                  </div>
                </div>
                <div>
                  <span className="stat-tile__label">Port</span>
                  <div className="stat-tile__value">{engineState.port || 8391}</div>
                </div>
                <div>
                  <span className="stat-tile__label">Process PID</span>
                  <div className="stat-tile__value">{engineState.pid || "—"}</div>
                </div>
              </div>

              {/* GPU acceleration + device picker */}
              <div className="settings-subpanel">
                <div className="settings-subpanel__head">
                  <span className="settings-eyebrow">Acceleration</span>
                  {engineState.status === "running" && (
                    <span
                      className="stat-tile__value"
                      style={{ color: engineState.gpuLayers === 0 ? "var(--text-muted)" : "var(--status-success)" }}
                    >
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
                    className="settings-select"
                    style={{ flex: 1, minWidth: "200px" }}
                  >
                    <option value="auto">Auto (pick best GPU)</option>
                    {gpuDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {(d.totalMiB / 1024).toFixed(1)} GB
                      </option>
                    ))}
                    <option value="cpu">CPU only</option>
                  </select>
                  <button onClick={() => refreshGpuDevices()} title="Rescan GPUs" className="settings-btn settings-btn--ghost">
                    <RefreshCw size={12} /> Rescan
                  </button>
                </div>
                {gpuDevices.length === 0 && (
                  <span className="settings-hint">
                    No GPU devices detected — the engine will run on CPU. Install the engine first if you just set it up.
                  </span>
                )}
                <span className="settings-hint">
                  Changing this restarts the engine. "Auto" sizes GPU layers to fit your VRAM.
                </span>
              </div>

              {engineState.loadedModel && (
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  <strong>Active Loaded Model:</strong> {engineState.loadedModel.split(/[\/\\]/).pop()}
                </div>
              )}

              {(engineState.error || engineError || engineState.status === "error") && (
                <div className="settings-error">
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
                        className="settings-btn"
                        style={{
                          backgroundColor: "var(--status-success-soft)",
                          color: "var(--status-success)",
                          border: "1px solid var(--status-success-border)",
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
                        className="settings-btn settings-btn--ghost"
                      >
                        <Copy size={12} /> {copiedLogs ? "Copied Logs!" : "Copy Error Logs"}
                      </button>
                    </div>
                  </div>

                  {(engineState.lastLogs || engineState.error) && (
                    <div style={{ marginTop: "4px" }}>
                      <span className="settings-hint" style={{ display: "block", marginBottom: "4px" }}>
                        Diagnostic Stderr Output:
                      </span>
                      <pre className="settings-error__log">
                        {engineState.lastLogs || engineState.error}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Local Models List */}
            <div className="settings-card">
              <h3 className="settings-card__title">
                <Download size={16} /> Downloaded GGUF Models (~/Golti/models)
              </h3>

              {localModels.length === 0 ? (
                <p className="settings-card__desc">
                  No models downloaded yet. Browse the Hardware Cookbook to download GGUF models directly!
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {localModels.map((m) => {
                    const isLoaded = engineState.loadedModel === m.filepath;
                    return (
                      <div key={m.filename} className={"model-row" + (isLoaded ? " model-row--active" : "")}>
                        <div>
                          <div className="model-row__name">
                            {m.filename}
                            {isLoaded && (
                              <span className="model-row__loaded">
                                <CheckCircle2 size={12} /> Loaded
                              </span>
                            )}
                          </div>
                          <div className="model-row__size">{m.sizeGB} GB</div>
                        </div>

                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => loadModel(m.filepath)}
                            disabled={isLoaded}
                            className={"settings-btn" + (isLoaded ? "" : " settings-btn--primary")}
                            style={isLoaded ? { color: "var(--text-muted)" } : undefined}
                          >
                            {isLoaded ? "Active" : "Load Model"}
                          </button>
                          <button onClick={() => deleteLocalModel(m.filename)} className="settings-btn settings-btn--danger">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === "skills" && <SkillsSettings />}

        {activeSubTab === "general" && (
          <div className="settings-panel settings-panel--narrow">
            {/* System Prompt */}
            <div className="settings-card">
              <h3 className="settings-card__title">System Prompt</h3>
              <p className="settings-card__desc">
                This prompt will be prepended to all new conversations to define your AI assistant's persona.
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={5}
                className="settings-textarea"
              />
              <div>
                <button onClick={() => updateSettings({ systemPrompt })} className="settings-btn settings-btn--primary">
                  Save System Prompt
                </button>
              </div>
            </div>

            {/* Thinking */}
            <div className="settings-card">
              <h3 className="settings-card__title">
                <BrainCircuit size={16} /> AI Thinking & Reasoning
              </h3>
              <p className="settings-card__desc">
                Display the model's reasoning chain and duration timer in collapsible blocks for reasoning models (e.g.
                DeepSeek-R1, Qwen 2.5 Thought, o1/o3).
              </p>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings?.showThinkingProcess ?? true}
                  onChange={(e) => updateSettings({ showThinkingProcess: e.target.checked })}
                />
                <span>Show AI thinking process in chat bubbles</span>
              </label>
            </div>

            {/* Engine integration */}
            <div className="settings-card">
              <h3 className="settings-card__title">
                <Zap size={16} /> Golti Engine Integration
              </h3>
              <p className="settings-card__desc">
                Golti Engine runs local GGUF models on your machine. If you only use Cloud APIs (OpenAI, Gemini,
                Anthropic), you can hide Golti Engine status banners and options.
              </p>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings?.engineEnabled ?? true}
                  onChange={(e) => updateSettings({ engineEnabled: e.target.checked })}
                />
                <span>Show Golti Engine in Cookbook, Status Bar & Settings</span>
              </label>
            </div>

            {/* Web Search */}
            <div className="settings-card">
              <h3 className="settings-card__title">
                <Globe size={16} /> Web Search
              </h3>
              <p className="settings-card__desc">
                Self-hosted on your computer. Turn on Web Search in chat to install and start it — this page is for
                repair and advanced options. No API keys required.
              </p>
              <div className={"settings-banner " + (webSearchReady ? "settings-banner--ok" : "settings-banner--warn")}>
                {friendlyStatus()}
                {progress && progress.percent < 100 ? ` (${progress.percent}%)` : ""}
                {runtimeState.version ? ` · v${runtimeState.version}` : ""}
              </div>

              {(searchRuntimeError || runtimeState.error) && (
                <div style={{ fontSize: 12, color: "var(--status-error)" }}>
                  {searchRuntimeError || runtimeState.error}
                </div>
              )}

              <div className="settings-btn-row">
                <button onClick={() => install().catch(() => {})} className="settings-btn settings-btn--primary">
                  {runtimeState.status === "not-installed" ? "Install" : "Check / Start"}
                </button>
                <button onClick={() => start().catch(() => {})} className="settings-btn settings-btn--ghost">
                  Start
                </button>
                <button onClick={() => stop()} className="settings-btn settings-btn--ghost">
                  Stop
                </button>
                <button onClick={() => repair().catch(() => {})} className="settings-btn settings-btn--danger">
                  Repair / Reinstall
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="settings-hint">Test search</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={webSearchTestQuery}
                    onChange={(e) => setWebSearchTestQuery(e.target.value)}
                    placeholder="Try a search…"
                    className="settings-input"
                    style={{ flex: 1 }}
                  />
                  <button onClick={runWebSearchTest} disabled={webSearchTestBusy} className="settings-btn settings-btn--primary">
                    {webSearchTestBusy ? "Testing…" : "Test"}
                  </button>
                </div>
                {webSearchTestMessage && (
                  <div style={{ fontSize: 12, color: webSearchTestOk ? "var(--status-success)" : "var(--status-error)" }}>
                    {webSearchTestMessage}
                  </div>
                )}
              </div>

              <button onClick={() => setShowSearchAdvanced((v) => !v)} className="settings-btn--link">
                {showSearchAdvanced ? "Hide advanced" : "Show advanced"}
              </button>

              {showSearchAdvanced && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    Local API port
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      value={settings?.searchRuntimePort || 8741}
                      onChange={(e) => updateSettings({ searchRuntimePort: Number(e.target.value) })}
                      className="settings-input"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    Max results
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={settings?.webSearch?.maxResults || 5}
                      onChange={(e) =>
                        updateSettings({
                          webSearch: {
                            provider: "local",
                            maxResults: Number(e.target.value),
                            enabled: true,
                            endpoint: settings?.webSearch?.endpoint
                          }
                        })
                      }
                      className="settings-input"
                    />
                  </label>
                  {runtimeState.lastLog && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      Last log: {runtimeState.lastLog}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* OS nav preview */}
            <div className="settings-card">
              <h3 className="settings-card__title">
                <MonitorSmartphone size={16} /> OS Navigation Layout Preview
              </h3>
              <p className="settings-card__desc">
                Customize or force preview the top navigation & title bar style for specific operating systems (macOS,
                Windows, or Linux).
              </p>
              <select
                value={settings?.osPlatformOverride || "auto"}
                onChange={(e) => updateSettings({ osPlatformOverride: e.target.value as any })}
                className="settings-select"
                style={{ maxWidth: "260px" }}
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
          <div className="settings-panel" style={{ maxWidth: "540px" }}>
            <div className="about-card">
              <div className="about-badge">
                <EggLogo size={24} title="Golti" />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Golti AI Workspace</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                Version 1.0.0 · Local-First Desktop App
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "var(--space-4)", lineHeight: 1.6 }}>
                Walang magawa hehe
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
