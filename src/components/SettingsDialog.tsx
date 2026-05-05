"use client";

import { useState } from "react";
import { useSettings } from "@/lib/store";
import { Settings as SettingsIcon, X, ExternalLink } from "lucide-react";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const s = useSettings();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg)] hover:border-[var(--border-strong)]"
      >
        <SettingsIcon size={12} /> Settings
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-sm shadow-xl"
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
              {/* API Key */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
                  OpenRouter API Key (BYOK){" "}
                  <a
                    href="https://openrouter.ai/keys"
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
                  placeholder="sk-or-v1-..."
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--fg-subtle)]"
                />
                <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                  Stored only in your browser&apos;s localStorage. Never sent to our servers — used per-request.
                </p>
              </div>

              {/* System prompt */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
                  System prompt
                </label>
                <textarea
                  value={s.systemPrompt}
                  onChange={(e) => s.setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--fg-subtle)]"
                />
              </div>

              {/* Temperature */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
                  Temperature: {s.temperature.toFixed(2)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={s.temperature}
                  onChange={(e) => s.setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              {/* Ollama */}
              <div className="rounded border border-[var(--border)] bg-[var(--bg-soft)] p-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.useOllama}
                    onChange={(e) => s.setUseOllama(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="font-medium text-[var(--fg)]">
                    Use local Ollama instead of OpenRouter
                  </span>
                </label>
                <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                  Run models locally via{" "}
                  <a
                    href="https://ollama.com"
                    className="text-[var(--accent)] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ollama
                  </a>
                  . Use the model id shown by{" "}
                  <code className="rounded bg-[var(--code-bg)] px-1 text-[var(--code-fg)]">
                    ollama list
                  </code>
                  .
                </p>
                {s.useOllama && (
                  <input
                    value={s.ollamaBaseUrl}
                    onChange={(e) => s.setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[var(--fg)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--fg-subtle)]"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
