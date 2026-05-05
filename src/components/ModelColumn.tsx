"use client";

import { useChat, type Message } from "@/lib/store";
import { getModel } from "@/lib/models";
import { PROVIDERS } from "@/lib/providers";
import { Markdown } from "./Markdown";
import { ProviderIcon } from "./ProviderIcon";
import { Copy, Star, RefreshCw, AlertCircle, Loader2, Focus, X } from "lucide-react";
import { useState } from "react";
import { streamModel } from "@/lib/chat-client";

function MessageBubble({
  msg,
  convId,
  modelId,
}: {
  msg: Message;
  convId: string;
  modelId: string;
}) {
  const toggleFavorite = useChat((s) => s.toggleFavorite);
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        background: isUser ? "var(--user-bubble)" : "var(--asst-bubble)",
        borderColor: isUser ? "var(--user-border)" : "var(--asst-border)",
      }}
    >
      {msg.imageDataUrl && (
        <img
          src={msg.imageDataUrl}
          alt="attached"
          className="mb-2 max-h-48 rounded border border-[var(--border)]"
        />
      )}
      {msg.error ? (
        <div className="flex items-center gap-2 text-[var(--error)]">
          <AlertCircle size={14} /> {msg.error}
        </div>
      ) : msg.role === "assistant" && msg.content === "" && msg.pending ? (
        <div className="flex items-center gap-2 text-[var(--fg-muted)]">
          <Loader2 size={14} className="animate-spin" /> thinking…
        </div>
      ) : (
        <Markdown source={msg.content || ""} />
      )}

      {!isUser && !msg.pending && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--fg-muted)]">
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1 hover:text-[var(--fg)]"
            title="Copy"
          >
            <Copy size={11} /> {copied ? "copied" : "copy"}
          </button>
          <button
            onClick={() => toggleFavorite(convId, modelId, msg.id)}
            className={
              "inline-flex items-center gap-1 hover:text-yellow-500 " +
              (msg.favorite ? "text-yellow-500" : "")
            }
            title="Favorite"
          >
            <Star size={11} fill={msg.favorite ? "currentColor" : "none"} />
            {msg.favorite ? "favorited" : "favorite"}
          </button>
          {msg.usage?.completionTokens !== undefined && (
            <span title="Tokens">
              {msg.usage.promptTokens ?? "?"} → {msg.usage.completionTokens} tok
            </span>
          )}
          {typeof msg.usage?.costUsd === "number" && msg.usage.costUsd > 0 && (
            <span>${msg.usage.costUsd.toFixed(5)}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ModelColumn({
  convId,
  modelId,
}: {
  convId: string;
  modelId: string;
}) {
  const conv = useChat((s) => s.conversations[convId]);
  const setSelectedModels = useChat((s) => s.setSelectedModels);
  const setFocusedModel = useChat((s) => s.setFocusedModel);
  const info = getModel(modelId);
  const thread = conv?.threads[modelId];
  if (!conv || !thread) return null;

  const totalCost = thread.messages.reduce(
    (acc, m) => acc + (m.usage?.costUsd ?? 0),
    0
  );

  const isFocused = conv.focusedModel === modelId;
  const isOtherFocused = !!conv.focusedModel && !isFocused;

  const removeColumn = () => {
    setSelectedModels(
      convId,
      conv.selectedModels.filter((m) => m !== modelId)
    );
  };

  const toggleFocus = () => {
    setFocusedModel(convId, isFocused ? null : modelId);
  };

  const regenerate = () => {
    void streamModel({ convId, modelId });
  };

  const providerName = info ? PROVIDERS[info.provider].name : "Custom";

  return (
    <div
      className={
        "flex h-full min-w-[320px] flex-1 flex-col overflow-hidden rounded-xl border bg-[var(--bg-elevated)] transition " +
        (isFocused
          ? "border-[var(--accent)] shadow-lg shadow-[var(--accent)]/10"
          : "border-[var(--border)]") +
        (isOtherFocused ? " opacity-50" : "")
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {info && <ProviderIcon provider={info.provider} size={26} />}
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-[var(--fg)]">
              {info?.label ?? modelId}
            </div>
            <div className="truncate text-[10px] text-[var(--fg-muted)]">
              {providerName}
              {info?.free ? " · free" : ""}
              {totalCost > 0 ? ` · $${totalCost.toFixed(4)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 text-[var(--fg-muted)]">
          <button
            onClick={toggleFocus}
            className={
              "rounded p-1 hover:bg-[var(--bg)] hover:text-[var(--fg)] " +
              (isFocused ? "text-[var(--accent)]" : "")
            }
            title={isFocused ? "Exit focus mode" : "Focus on this model only"}
          >
            <Focus size={13} />
          </button>
          <button
            onClick={regenerate}
            className="rounded p-1 hover:bg-[var(--bg)] hover:text-[var(--fg)]"
            title="Regenerate last"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={removeColumn}
            className="rounded p-1 hover:bg-[var(--bg)] hover:text-[var(--error)]"
            title="Remove column"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {thread.messages.length === 0 && (
          <div className="pt-8 text-center text-xs text-[var(--fg-subtle)]">
            Send a prompt to see this model respond.
          </div>
        )}
        {thread.messages.map((m) => (
          <MessageBubble key={m.id} msg={m} convId={convId} modelId={modelId} />
        ))}
      </div>

      {isOtherFocused && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-soft)] px-3 py-1.5 text-center text-[10px] text-[var(--fg-muted)]">
          read-only · another model is focused
        </div>
      )}
    </div>
  );
}
