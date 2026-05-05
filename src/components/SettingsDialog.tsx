"use client";

import { useState } from "react";
import { useChat, useSettings, type LocalOllamaModel } from "@/lib/store";
import { ExternalLink, RefreshCw, Settings as SettingsIcon, X } from "lucide-react";

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-[var(--bg-soft)] text-[var(--fg-muted)]")
      }
    >
      {label}
    </span>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs text-[var(--fg)]"
      aria-pressed={on}
    >
      <span
        className={
          "relative h-5 w-9 shrink-0 rounded-full transition " +
          (on ? "bg-emerald-500" : "bg-[var(--border-strong)]")
        }
      >
        <span
          className={
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition " +
            (on ? "left-[18px]" : "left-0.5")
          }
        />
      </span>
      {label}
    </button>
  );
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const s = useSettings();
  const removeOllamaModels = useChat((state) => state.removeOllamaModels);

  const refreshLocalModels = async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const params = new URLSearchParams({ baseUrl: s.ollamaBaseUrl });
      if (s.ollamaApiKey) params.set("apiKey", s.ollamaApiKey);
      const res = await fetch(`/api/ollama/models?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        models?: LocalOllamaModel[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      s.setAvailableLocalModels(data.models ?? []);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalLoading(false);
    }
  };

  const setLocalEnabled = (enabled: boolean) => {
    s.setLocalEnabled(enabled);
    setLocalError(null);
    if (!enabled) removeOllamaModels();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--fg)] transition hover:border-[var(--border-strong)]"
      >
        <SettingsIcon size={14} /> Settings
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-sm shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--fg)]">Settings</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">Cloud keys</div>
                    <div className="text-[11px] text-[var(--fg-muted)]">BYOK keys stay in browser storage.</div>
                  </div>
                  <div className="flex gap-1">
                    <StatusPill label={s.apiKey ? "Groq ready" : "Groq key missing"} ok={Boolean(s.apiKey)} />
                    <StatusPill label={s.geminiApiKey ? "Gemini ready" : "Gemini key missing"} ok={Boolean(s.geminiApiKey)} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
                      Groq API Key{" "}
                      <a
                        href="https://console.groq.com"
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
                      >
                        get key <ExternalLink size={10} />
                      </a>
                    </label>
                    <input
                      type="password"
                      value={s.apiKey}
                      onChange={(e) => s.setApiKey(e.target.value)}
                      placeholder="gsk_..."
                      className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
                      Gemini API Key{" "}
                      <a
                        href="https://aistudio.google.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
                      >
                        get key <ExternalLink size={10} />
                      </a>
                    </label>
                    <input
                      type="password"
                      value={s.geminiApiKey}
                      onChange={(e) => s.setGeminiApiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">Local Ollama</div>
                    <div className="text-[11px] text-[var(--fg-muted)]">Models installed on this machine via Ollama.</div>
                  </div>
                  <StatusPill
                    label={s.localEnabled ? `${s.availableLocalModels.length} found` : "Off"}
                    ok={s.localEnabled && s.availableLocalModels.length > 0}
                  />
                </div>

                <div className="space-y-2">
                  <Toggle on={s.localEnabled} onChange={setLocalEnabled} label="Enable local Ollama models" />

                  {s.localEnabled && (
                    <>
                      <label className="block text-[11px] font-medium text-[var(--fg-muted)]">
                        Ollama base URL
                      </label>
                      <input
                        value={s.ollamaBaseUrl}
                        onChange={(e) => s.setOllamaBaseUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--fg-muted)]">
                          {s.availableLocalModels.length} installed model{s.availableLocalModels.length === 1 ? "" : "s"} detected
                        </span>
                        <button
                          type="button"
                          onClick={refreshLocalModels}
                          disabled={localLoading}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--fg)] hover:border-[var(--border-strong)] disabled:opacity-60"
                        >
                          <RefreshCw size={11} className={localLoading ? "animate-spin" : ""} />
                          Refresh
                        </button>
                      </div>
                      {localError && (
                        <div className="rounded border border-[var(--error)]/40 bg-[var(--bg-soft)] px-2 py-1.5 text-[11px] text-[var(--error)]">
                          {localError}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">Cloud Ollama (ollama.com)</div>
                    <div className="text-[11px] text-[var(--fg-muted)]">Hosted models via the ollama.com API.</div>
                  </div>
                  <StatusPill
                    label={s.cloudOllamaEnabled ? "On" : "Off"}
                    ok={s.cloudOllamaEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Toggle on={s.cloudOllamaEnabled} onChange={s.setCloudOllamaEnabled} label="Enable cloud Ollama models" />

                  {s.cloudOllamaEnabled && (
                    <>
                      <label className="block text-[11px] font-medium text-[var(--fg-muted)]">
                        Cloud base URL
                      </label>
                      <input
                        value={s.ollamaCloudBaseUrl}
                        onChange={(e) => s.setOllamaCloudBaseUrl(e.target.value)}
                        placeholder="https://ollama.com"
                        className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                      />
                      <label className="block text-[11px] font-medium text-[var(--fg-muted)]">
                        API key
                      </label>
                      <input
                        type="password"
                        value={s.ollamaApiKey}
                        onChange={(e) => s.setOllamaApiKey(e.target.value)}
                        placeholder="Your ollama.com API key"
                        className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                      />
                    </>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="mb-3">
                  <div className="text-xs font-semibold text-[var(--fg)]">Behavior</div>
                  <div className="text-[11px] text-[var(--fg-muted)]">Display and response preferences.</div>
                </div>
                <div className="space-y-3">
                  <Toggle on={s.webSearch} onChange={s.setWebSearch} label="Enable Gemini web search" />
                  <Toggle on={s.compactColumns} onChange={s.setCompactColumns} label="Compact response columns" />
                  <Toggle on={s.saveConsensusToChat} onChange={s.setSaveConsensusToChat} label="Save consensus automatically" />

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
                      System prompt
                    </label>
                    <textarea
                      value={s.systemPrompt}
                      onChange={(e) => s.setSystemPrompt(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
