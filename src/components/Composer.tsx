"use client";

import { useRef, useState } from "react";
import { sendPromptToAll } from "@/lib/chat-client";
import { useChat, useSettings } from "@/lib/store";
import { ArrowUp, Square, X, Globe } from "lucide-react";
import { getModel } from "@/lib/models";

export function Composer({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const setFocusedModel = useChat((s) => s.setFocusedModel);
  const webSearch = useSettings((s) => s.webSearch);
  const setWebSearch = useSettings((s) => s.setWebSearch);
  const [text, setText] = useState("");
  const ctrlRef = useRef<AbortController | null>(null);

  // In focus mode, only block if the focused model is still streaming
  const focusedModel = conv?.focusedModel;
  const anyPending = focusedModel
    ? !!conv?.threads[focusedModel]?.messages.some((msg) => msg.pending)
    : !!conv?.selectedModels.some((m) =>
        conv.threads[m]?.messages.some((msg) => msg.pending)
      );
  const focusedInfo = focusedModel ? getModel(focusedModel) : undefined;

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || anyPending) return;
    ctrlRef.current = sendPromptToAll(convId, t);
    setText("");
  };

  const onStop = () => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-[var(--border)] bg-[var(--bg-soft)] px-4 pb-4 pt-3">
      {focusedModel && (
        <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] text-[var(--accent)]">
          <span className="font-medium">Focused on {focusedInfo?.label ?? focusedModel}</span>
          <span className="text-[var(--fg-muted)]">— prompts only go to this model</span>
          <button
            type="button"
            onClick={() => setFocusedModel(convId, null)}
            className="ml-auto rounded p-0.5 hover:bg-[var(--bg)]"
            title="Exit focus"
          >
            <X size={11} />
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 shadow-sm focus-within:border-[var(--border-strong)] focus-within:shadow-md transition">
        <button
          type="button"
          onClick={() => setWebSearch(!webSearch)}
          title={webSearch ? "Web search ON (Gemini) — click to disable" : "Enable web search (Gemini only)"}
          className={"shrink-0 rounded-full p-1.5 transition " + (webSearch ? "text-[var(--accent)]" : "text-[var(--fg-subtle)] hover:text-[var(--fg-muted)]")}
        >
          <Globe size={15} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={
            focusedModel
              ? "Continue chatting with the focused model…"
              : "Message all selected models…"
          }
          rows={1}
          className="block max-h-48 w-full flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-6 text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)]"
        />
        {anyPending ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--error)] text-white shadow-sm transition hover:opacity-90"
            title="Stop"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            title="Send"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </form>
  );
}
