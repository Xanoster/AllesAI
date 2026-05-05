"use client";

import { useRef, useState } from "react";
import { sendPromptToAll } from "@/lib/chat-client";
import { useChat } from "@/lib/store";
import { ImagePlus, X, Send } from "lucide-react";
import { ProviderIcon } from "./ProviderIcon";
import { getModel } from "@/lib/models";

// Centered "first prompt" hero — matches the cleaner landing design.
// After the first prompt, the column layout takes over.
export function HeroComposer({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!conv) return null;

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendPromptToAll(convId, t, image);
    setText("");
    setImage(undefined);
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-10 w-full max-w-2xl px-4">
        {/* Hero greeting */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--fg)]">
            Ask many minds at once
          </h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Compare answers from the world's best free AI models, side-by-side.
          </p>
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {conv.selectedModels.slice(0, 8).map((id) => {
              const m = getModel(id);
              if (!m) return null;
              return (
                <div key={id} className="rounded-full ring-2 ring-[var(--bg)]">
                  <ProviderIcon provider={m.provider} size={22} />
                </div>
              );
            })}
            {conv.selectedModels.length > 8 && (
              <span className="ml-1 text-xs text-[var(--fg-muted)]">
                +{conv.selectedModels.length - 8}
              </span>
            )}
          </div>
        </div>

        {/* Prompt card */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm"
        >
          {image && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-1 pr-2 text-xs">
              <img src={image} alt="" className="h-10 w-10 rounded object-cover" />
              <span className="text-[var(--fg-muted)]">image attached</span>
              <button
                type="button"
                onClick={() => setImage(undefined)}
                className="rounded p-0.5 hover:bg-[var(--border)]"
              >
                <X size={12} />
              </button>
            </div>
          )}
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
            rows={2}
            className="w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-[var(--fg-subtle)]"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickImage}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)]"
              title="Attach image"
            >
              <ImagePlus size={16} />
            </button>
            <button
              type="submit"
              disabled={!text.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] transition hover:opacity-90 disabled:opacity-40"
            >
              Send <Send size={13} />
            </button>
          </div>
        </form>

        <p className="mt-3 text-center text-[11px] text-[var(--fg-subtle)]">
          Press <kbd className="rounded border border-[var(--border)] px-1">Enter</kbd> to send,{" "}
          <kbd className="rounded border border-[var(--border)] px-1">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
}
