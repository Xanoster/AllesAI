"use client";

import { useRef, useState } from "react";
import { sendPromptToAll } from "@/lib/chat-client";
import { useChat } from "@/lib/store";
import { Send, Square, ImagePlus, X } from "lucide-react";
import { getModel } from "@/lib/models";

export function Composer({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const setFocusedModel = useChat((s) => s.setFocusedModel);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>(undefined);
  const ctrlRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const anyPending = !!conv?.selectedModels.some((m) =>
    conv.threads[m]?.messages.some((msg) => msg.pending)
  );

  const focusedModel = conv?.focusedModel;
  const focusedInfo = focusedModel ? getModel(focusedModel) : undefined;

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || anyPending) return;
    ctrlRef.current = sendPromptToAll(convId, t, image);
    setText("");
    setImage(undefined);
  };

  const onStop = () => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-[var(--border)] bg-[var(--bg-soft)] p-3"
    >
      {focusedModel && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-1 text-[11px] text-[var(--accent)]">
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
      {image && (
        <div className="mb-2 inline-flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-1 pr-2 text-xs">
          <img src={image} alt="preview" className="h-10 w-10 rounded object-cover" />
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
      <div className="flex items-end gap-2">
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
          rows={2}
          className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
        />
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
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--fg-muted)] hover:text-[var(--fg)]"
          title="Attach image"
        >
          <ImagePlus size={16} />
        </button>
        {anyPending ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg bg-[var(--error)] px-3 py-2 text-sm text-white hover:opacity-90"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </form>
  );
}
