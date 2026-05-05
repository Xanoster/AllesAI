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
                  Groq API Key (BYOK){" "}
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
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--fg-subtle)]"
                />
                <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                  Stored only in your browser&apos;s localStorage. Never sent to our servers — used per-request.
                </p>
              </div>

              {/* Gemini API Key */}
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
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1.5 text-[var(--fg)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--fg-subtle)]"
                />
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


            </div>
          </div>
        </div>
      )}
    </>
  );
}
