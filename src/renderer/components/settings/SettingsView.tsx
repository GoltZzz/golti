import React, { useState, useEffect } from "react";
import { Server, Sliders, Info, Shield } from "lucide-react";
import { ProviderConfig } from "./ProviderConfig";
import { useSettingsStore } from "../../stores/settingsStore";

export const SettingsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<
    "providers" | "general" | "about"
  >("providers");
  const { settings, fetchSettings, updateSettings } = useSettingsStore();
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    fetchSettings();
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
