"use client";

import { useRef, useState } from "react";
import { enhancePrompt, sendPromptToAll } from "@/lib/chat-client";
import {
  filterEnabledModelIds,
  useChat,
  useSettings,
  type ProviderToggleSettings,
} from "@/lib/store";
import { ArrowUp, Globe, Loader2, Sparkles, X } from "lucide-react";
import { ProviderIcon } from "./ProviderIcon";
import { getModel } from "@/lib/models";

export function HeroComposer({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const webSearch = useSettings((s) => s.webSearch);
  const setWebSearch = useSettings((s) => s.setWebSearch);
  const groqEnabled = useSettings((s) => s.groqEnabled);
  const geminiEnabled = useSettings((s) => s.geminiEnabled);
  const localEnabled = useSettings((s) => s.localEnabled);
  const cloudOllamaEnabled = useSettings((s) => s.cloudOllamaEnabled);
  const [text, setText] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const enhanceCtrlRef = useRef<AbortController | null>(null);

  if (!conv) return null;
  const enabledSettings: ProviderToggleSettings = {
    groqEnabled,
    geminiEnabled,
    cloudOllamaEnabled,
    localEnabled,
  };
  const visibleSelectedModels = filterEnabledModelIds(conv.selectedModels, enabledSettings);

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendPromptToAll(convId, t);
    setText("");
  };

  const enhanceModel = visibleSelectedModels[0] ?? null;

  const onEnhance = async () => {
    const t = text.trim();
    if (!t || !enhanceModel || enhancing) return;
    setEnhanceError(null);
    setEnhancing(true);
    const ctrl = new AbortController();
    enhanceCtrlRef.current = ctrl;
    try {
      const improved = await enhancePrompt(enhanceModel, t, ctrl.signal);
      if (improved) setText(improved);
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setEnhanceError(err instanceof Error ? err.message : "Could not enhance prompt.");
      }
    } finally {
      if (enhanceCtrlRef.current === ctrl) enhanceCtrlRef.current = null;
      setEnhancing(false);
    }
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-10 w-full max-w-2xl px-6">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--fg)]">
            Ask many minds at once
          </h1>
          <p className="mt-3 text-base text-[var(--fg-muted)]">
            Compare answers from top free AI models, side-by-side.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            {visibleSelectedModels.slice(0, 8).map((id) => {
              const m = getModel(id);
              if (!m) return null;
              return (
                <div key={id} className="rounded-full ring-2 ring-[var(--bg)]">
                  <ProviderIcon provider={m.provider} size={26} />
                </div>
              );
            })}
            {visibleSelectedModels.length > 8 && (
              <span className="ml-1 text-sm text-[var(--fg-muted)]">
                +{visibleSelectedModels.length - 8}
              </span>
            )}
          </div>
        </div>

        {enhanceError && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--error)]/40 bg-[var(--error)]/10 px-2.5 py-1 text-[11px] text-[var(--error)]">
            <span className="font-medium">{enhanceError}</span>
            <button
              type="button"
              onClick={() => setEnhanceError(null)}
              className="ml-auto rounded p-0.5 hover:bg-[var(--bg)]"
              title="Dismiss"
            >
              <X size={11} />
            </button>
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="flex items-center gap-2 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 shadow-sm transition focus-within:border-[var(--border-strong)] focus-within:shadow-md">
            <button
              type="button"
              onClick={() => setWebSearch(!webSearch)}
              title={webSearch ? "Web search ON - click to disable" : "Enable web search for all models"}
              className={
                "shrink-0 rounded-full p-1.5 transition " +
                (webSearch ? "text-[var(--accent)]" : "text-[var(--fg-subtle)] hover:text-[var(--fg-muted)]")
              }
            >
              <Globe size={15} />
            </button>
            <button
              type="button"
              onClick={onEnhance}
              disabled={!text.trim() || !enhanceModel || enhancing}
              title={
                enhanceModel
                  ? "Enhance prompt - let AI rewrite it for a better answer"
                  : "Select a model to enhance the prompt"
              }
              className="shrink-0 rounded-full p-1.5 text-[var(--fg-subtle)] transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--fg-subtle)]"
            >
              {enhancing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            </button>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Ask anything..."
              rows={1}
              className="block max-h-48 w-full flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-6 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)]"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              title="Send"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--fg-subtle)]">
          Press <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5">Enter</kbd> to send,{" "}
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
}
