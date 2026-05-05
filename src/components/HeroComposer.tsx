"use client";

import { useState } from "react";
import { sendPromptToAll } from "@/lib/chat-client";
import { useChat } from "@/lib/store";
import { ArrowUp } from "lucide-react";
import { ProviderIcon } from "./ProviderIcon";
import { getModel } from "@/lib/models";

// Centered "first prompt" hero — matches the cleaner landing design.
// After the first prompt, the column layout takes over.
export function HeroComposer({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const [text, setText] = useState("");

  if (!conv) return null;

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendPromptToAll(convId, t);
    setText("");
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-10 w-full max-w-2xl px-6">
        {/* Hero greeting */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--fg)]">
            Ask many minds at once
          </h1>
          <p className="mt-3 text-base text-[var(--fg-muted)]">
            Compare answers from the world's best free AI models, side-by-side.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            {conv.selectedModels.slice(0, 8).map((id) => {
              const m = getModel(id);
              if (!m) return null;
              return (
                <div key={id} className="rounded-full ring-2 ring-[var(--bg)]">
                  <ProviderIcon provider={m.provider} size={26} />
                </div>
              );
            })}
            {conv.selectedModels.length > 8 && (
              <span className="ml-1 text-sm text-[var(--fg-muted)]">
                +{conv.selectedModels.length - 8}
              </span>
            )}
          </div>
        </div>

        {/* Pill composer matches bottom Composer */}
        <form onSubmit={onSubmit}>
          <div className="flex items-center gap-2 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 shadow-sm focus-within:border-[var(--border-strong)] focus-within:shadow-md transition">
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
              placeholder="Ask anything…"
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
