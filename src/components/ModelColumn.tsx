"use client";

import { useChat, type Message } from "@/lib/store";
import { getModel } from "@/lib/models";
import { PROVIDERS } from "@/lib/providers";
import { Markdown } from "./Markdown";
import { ProviderIcon } from "./ProviderIcon";
import { Copy, AlertCircle, Loader2, Focus, Square } from "lucide-react";
import { useState } from "react";
import { abortModel } from "@/lib/chat-client";

function MessageBubble({
  msg,
  convId,
  modelId,
}: {
  msg: Message;
  convId: string;
  modelId: string;
}) {
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
  const setFocusedModel = useChat((s) => s.setFocusedModel);
  const toggleModelEnabled = useChat((s) => s.toggleModelEnabled);
  const info = getModel(modelId);
  const thread = conv?.threads[modelId];
  if (!conv || !thread) return null;

  const isDisabled = (conv.disabledModels ?? []).includes(modelId);
  const isPending = thread.messages.some((m) => m.role === "assistant" && m.pending);

  const totalCost = thread.messages.reduce(
    (acc, m) => acc + (m.usage?.costUsd ?? 0),
    0
  );

  const isFocused = conv.focusedModel === modelId;
  const isOtherFocused = !!conv.focusedModel && !isFocused;

  const toggleFocus = () => {
    setFocusedModel(convId, isFocused ? null : modelId);
  };

  const stopStream = () => {
    abortModel(convId, modelId);
  };

  // Toggle = on/off + collapse/expand merged into one action
  const handleToggle = () => {
    toggleModelEnabled(convId, modelId);
  };

  const providerName = info ? PROVIDERS[info.provider].name : "Custom";

  // Toggle pill shared between collapsed strip and full header
  const TogglePill = (
    <button
      onClick={handleToggle}
      title={isDisabled ? "Enable — expand and receive prompts" : "Pause — collapse and stop receiving prompts"}
      className="flex items-center px-0.5"
    >
      <span
        className={
          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 transition-colors " +
          (isDisabled
            ? "border-[var(--border)] bg-[var(--bg)]"
            : "border-[var(--accent)] bg-[var(--accent)]")
        }
      >
        <span
          className={
            "pointer-events-none inline-block h-2.5 w-2.5 translate-y-[1px] rounded-full bg-white shadow transition-transform " +
            (isDisabled ? "translate-x-0.5" : "translate-x-[13px]")
          }
        />
      </span>
    </button>
  );

  // Collapsed strip when paused
  if (isDisabled) {
    return (
      <div
        className={
          "flex h-full w-11 shrink-0 flex-col items-center gap-2 overflow-hidden rounded-xl border bg-[var(--bg-elevated)] py-2 opacity-50 transition " +
          (isFocused ? "border-[var(--accent)]" : "border-[var(--border)]")
        }
      >
        {TogglePill}
        {info && <ProviderIcon provider={info.provider} size={26} />}
        <span
          className="mt-1 text-[10px] font-medium text-[var(--fg-muted)]"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          {info?.shortLabel ?? info?.label ?? modelId}
        </span>
      </div>
    );
  }
  return (
    <div
      className={
        "flex h-full min-w-[320px] flex-1 flex-col overflow-hidden rounded-xl border bg-[var(--bg-elevated)] transition " +
        (isFocused
          ? "border-[var(--accent)] shadow-lg shadow-[var(--accent)]/10"
          : isDisabled
          ? "border-[var(--border)] opacity-60"
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
              {isDisabled ? " · paused" : ""}
              {totalCost > 0 ? ` · $${totalCost.toFixed(4)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[var(--fg-muted)]">
          {TogglePill}
          {/* Stop streaming button — only visible when pending */}
          {isPending && (
            <button
              onClick={stopStream}
              className="rounded p-1 text-[var(--error)] hover:bg-[var(--bg)]"
              title="Stop response"
            >
              <Square size={12} fill="currentColor" />
            </button>
          )}
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
