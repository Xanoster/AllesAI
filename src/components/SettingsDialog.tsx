"use client";

import { useState } from "react";
import { useChat, useSettings, type LocalOllamaModel } from "@/lib/store";
import { type CustomProvider } from "@/lib/models";
import { uid } from "@/lib/utils";
import { ExternalLink, Plus, RefreshCw, Settings as SettingsIcon, Trash2, X } from "lucide-react";

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (ok ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--bg-soft)] text-[var(--fg-muted)]")
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
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(!on);
      }}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-2 text-left text-xs text-[var(--fg)] transition hover:border-[var(--border-strong)]"
      aria-pressed={on}
    >
      <span className="font-medium">{label}</span>
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
    </button>
  );
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const s = useSettings();
  const removeApiProviderModels = useChat((state) => state.removeApiProviderModels);

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
    if (!enabled) removeApiProviderModels("ollama-local");
  };

  const setGroqEnabled = (enabled: boolean) => {
    s.setGroqEnabled(enabled);
    if (!enabled) removeApiProviderModels("groq");
  };

  const setGeminiEnabled = (enabled: boolean) => {
    s.setGeminiEnabled(enabled);
    if (!enabled) removeApiProviderModels("gemini");
  };

  const setCloudOllamaEnabled = (enabled: boolean) => {
    s.setCloudOllamaEnabled(enabled);
    if (!enabled) removeApiProviderModels("ollama-cloud");
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
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">API providers</div>
                    <div className="text-[11px] text-[var(--fg-muted)]">Hosted APIs that run cloud models.</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <StatusPill
                      label={s.groqEnabled ? (s.apiKey ? "Groq ready" : "Groq key missing") : "Groq off"}
                      ok={s.groqEnabled && Boolean(s.apiKey)}
                    />
                    <StatusPill
                      label={s.geminiEnabled ? (s.geminiApiKey ? "Gemini ready" : "Gemini key missing") : "Gemini off"}
                      ok={s.geminiEnabled && Boolean(s.geminiApiKey)}
                    />
                    <StatusPill
                      label={s.cloudOllamaEnabled ? (s.ollamaApiKey ? "Ollama ready" : "Ollama key missing") : "Ollama off"}
                      ok={s.cloudOllamaEnabled && Boolean(s.ollamaApiKey)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Toggle on={s.groqEnabled} onChange={setGroqEnabled} label="Enable Groq hosted models" />
                    <div className="text-[11px] text-[var(--fg-muted)]">
                      Fast hosted routes for GPT-OSS, Llama, and Qwen model families.
                    </div>
                    {s.groqEnabled && (
                      <>
                        <label className="block text-xs font-medium text-[var(--fg)]">
                          Groq API key{" "}
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
                      </>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-[var(--border)] pt-4">
                    <Toggle on={s.geminiEnabled} onChange={setGeminiEnabled} label="Enable Gemini API models" />
                    <div className="text-[11px] text-[var(--fg-muted)]">
                      Google AI Studio routes for Gemini models and vision-capable requests.
                    </div>
                    {s.geminiEnabled && (
                      <>
                        <label className="block text-xs font-medium text-[var(--fg)]">
                          Gemini API key{" "}
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
                      </>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-[var(--border)] pt-4">
                    <Toggle on={s.cloudOllamaEnabled} onChange={setCloudOllamaEnabled} label="Enable Ollama hosted models" />
                    <div className="text-[11px] text-[var(--fg-muted)]">
                      Hosted ollama.com API routes for optional cloud models.
                    </div>

                    {s.cloudOllamaEnabled && (
                      <>
                        <label className="block text-xs font-medium text-[var(--fg)]">
                          Ollama API URL
                        </label>
                        <input
                          value={s.ollamaCloudBaseUrl}
                          onChange={(e) => s.setOllamaCloudBaseUrl(e.target.value)}
                          placeholder="https://ollama.com"
                          className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                        />
                        <label className="block text-xs font-medium text-[var(--fg)]">
                          Ollama API key{" "}
                          <a
                            href="https://ollama.com/settings/keys"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
                          >
                            get key <ExternalLink size={10} />
                          </a>
                        </label>
                        <input
                          type="password"
                          value={s.ollamaApiKey}
                          onChange={(e) => s.setOllamaApiKey(e.target.value)}
                          placeholder="Your ollama.com API key"
                          className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                        />
                      </>
                    )}
                  </div>
                </div>
              </section>

              <CustomProvidersSection />

              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">Web search</div>
                    <div className="text-[11px] text-[var(--fg-muted)]">Tavily MCP shared by all models.</div>
                  </div>
                  <StatusPill
                    label={s.tavilyApiKey ? "Ready" : "Env or key needed"}
                    ok={Boolean(s.tavilyApiKey)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--fg-muted)]">
                    Tavily API key{" "}
                    <a
                      href="https://app.tavily.com/home"
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
                    >
                      get key <ExternalLink size={10} />
                    </a>
                  </label>
                  <input
                    type="password"
                    value={s.tavilyApiKey}
                    onChange={(e) => s.setTavilyApiKey(e.target.value)}
                    placeholder="tvly-..."
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
                  />
                  <div className="text-[11px] text-[var(--fg-muted)]">
                    Leave blank to use `TAVILY_API_KEY`, `tavilyApiKey`, or `TAVILY_MCP_URL` from `.env.local`.
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--fg)]">Local Ollama</div>
                    <div className="text-[11px] text-[var(--fg-muted)]">Use models installed on this machine.</div>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CustomProvidersSection() {
  const customProviders = useSettings((s) => s.customProviders);
  const addCustomProvider = useSettings((s) => s.addCustomProvider);
  const updateCustomProvider = useSettings((s) => s.updateCustomProvider);
  const removeCustomProvider = useSettings((s) => s.removeCustomProvider);

  const addProvider = () =>
    addCustomProvider({
      id: uid(),
      name: "",
      baseUrl: "",
      apiKey: "",
      models: [],
    });

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-[var(--fg)]">Custom providers</div>
          <div className="text-[11px] text-[var(--fg-muted)]">
            Add any OpenAI-compatible API (OpenRouter, Together, Mistral, vLLM…).
          </div>
        </div>
        <StatusPill label={`${customProviders.length} added`} ok={customProviders.length > 0} />
      </div>

      <div className="space-y-3">
        {customProviders.map((provider) => (
          <CustomProviderEditor
            key={provider.id}
            provider={provider}
            onChange={(patch) => updateCustomProvider(provider.id, patch)}
            onRemove={() => removeCustomProvider(provider.id)}
          />
        ))}

        <button
          type="button"
          onClick={addProvider}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--fg)] hover:border-[var(--border-strong)]"
        >
          <Plus size={12} /> Add custom provider
        </button>
      </div>
    </section>
  );
}

function CustomProviderEditor({
  provider,
  onChange,
  onRemove,
}: {
  provider: CustomProvider;
  onChange: (patch: Partial<CustomProvider>) => void;
  onRemove: () => void;
}) {
  const inputClass =
    "w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]";
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-2.5">
      <div className="flex items-center gap-2">
        <input
          value={provider.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Provider name (e.g. OpenRouter)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg)] hover:text-[var(--error)]"
          title="Remove provider"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <input
        value={provider.baseUrl}
        onChange={(e) => onChange({ baseUrl: e.target.value })}
        placeholder="Base URL (e.g. https://openrouter.ai/api/v1)"
        className={inputClass}
      />
      <input
        type="password"
        value={provider.apiKey}
        onChange={(e) => onChange({ apiKey: e.target.value })}
        placeholder="API key (optional for local servers)"
        className={inputClass}
      />
      <textarea
        value={provider.models.join("\n")}
        onChange={(e) =>
          onChange({
            models: e.target.value
              .split(/[\n,]+/)
              .map((m) => m.trim())
              .filter(Boolean),
          })
        }
        placeholder="Model IDs, one per line (e.g. gpt-4o-mini)"
        rows={2}
        className={inputClass + " resize-y font-mono"}
      />
    </div>
  );
}
