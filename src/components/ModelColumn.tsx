"use client";

import { useState, useRef, useEffect } from "react";
import { useChat, type Message } from "@/lib/store";
import { getModel } from "@/lib/models";
import { PROVIDERS } from "@/lib/providers";
import { Markdown } from "./Markdown";
import { ProviderIcon } from "./ProviderIcon";
import { AlertCircle, Loader2, Focus, Square, Copy, Check, GripVertical, ChevronDown, ChevronRight, Brain } from "lucide-react";
import { abortModel } from "@/lib/chat-client";

/** Split out <think>...</think> blocks from raw content. */
function parseThinking(content: string): { thinking: string; answer: string } {
  const match = content.match(/^<think>([\s\S]*?)<\/think>\s*/);
  if (match) {
    return { thinking: match[1].trim(), answer: content.slice(match[0].length) };
  }
  // Partial: still streaming inside <think>
  if (content.startsWith("<think>") && !content.includes("</think>")) {
    return { thinking: content.slice(7).trim(), answer: "" };
  }
  return { thinking: "", answer: content };
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] transition"
      >
        <Brain size={11} className="shrink-0" />
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {open ? "Hide thinking" : "Show thinking"}
      </button>
      {open && (
        <div className="mt-1.5 rounded border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-[12px] text-[var(--fg-muted)] italic">
          <Markdown source={text} />
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
}: {
  msg: Message;
  convId: string;
  modelId: string;
}) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const showCopy =
    !isUser && !msg.pending && !msg.error && !!msg.content;

  return (
    <div
      data-role={msg.role}
      className="group relative rounded-lg border px-3 py-2 text-sm"
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
      {msg.error === "Stopped" ? (
        <>
          {msg.content && <Markdown source={msg.content} />}
          <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]">
            <Square size={10} fill="currentColor" /> stopped
          </div>
        </>
      ) : msg.error ? (
        <div className="flex items-center gap-2 text-[var(--error)]">
          <AlertCircle size={14} /> {msg.error}
        </div>
      ) : msg.role === "assistant" && msg.content === "" && msg.pending ? (
        <div className="flex items-center gap-2 text-[var(--fg-muted)]">
          <Loader2 size={14} className="animate-spin" /> thinking…
        </div>
      ) : (
        (() => {
          const { thinking, answer } = parseThinking(msg.content || "");
          return (
            <>
              {thinking && <ThinkingBlock text={thinking} />}
              {answer && <Markdown source={answer} />}
              {!answer && msg.pending && (
                <div className="flex items-center gap-2 text-[var(--fg-muted)]">
                  <Loader2 size={14} className="animate-spin" /> thinking…
                </div>
              )}
            </>
          );
        })()
      )}
      {showCopy && (
        <button
          onClick={onCopy}
          title={copied ? "Copied" : "Copy response"}
          className="absolute right-1.5 top-1.5 rounded p-1 text-[var(--fg-muted)] opacity-0 transition hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] group-hover:opacity-100"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}

export function ModelColumn({
  convId,
  modelId,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  convId: string;
  modelId: string;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  isDragOver?: boolean;
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const prevConvId = useRef<string>(convId);

  // Find the ID of the latest user message
  const latestUserMsg = [...thread.messages].reverse().find((m) => m.role === "user");
  const latestUserMsgId = latestUserMsg?.id ?? null;

  // Initialize with the current latest user message ID so the FIRST render
  // (page refresh / opening old chat) does not trigger a scroll.
  const lastUserMsgId = useRef<string | null>(latestUserMsgId);

  useEffect(() => {
    // Conversation switched — reset tracking to its current latest, don't scroll
    if (prevConvId.current !== convId) {
      prevConvId.current = convId;
      lastUserMsgId.current = latestUserMsgId;
      return;
    }
    // Only scroll when a NEW user message appeared after mount
    if (latestUserMsgId === lastUserMsgId.current) return;
    lastUserMsgId.current = latestUserMsgId;

    // Wait for DOM paint, then scroll the new user bubble to the top
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const userBubbles = container.querySelectorAll("[data-role='user']");
      const lastUser = userBubbles[userBubbles.length - 1] as HTMLElement | undefined;
      if (lastUser) {
        lastUser.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, [convId, latestUserMsgId]);

  // Dynamic spacer: just enough room so the last user msg can scroll to top.
  // Shrinks automatically as the assistant response grows beneath it.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const spacer = spacerRef.current;
    if (!container || !spacer) return;

    const updateSpacer = () => {
      const userBubbles = container.querySelectorAll("[data-role='user']");
      const lastUser = userBubbles[userBubbles.length - 1] as HTMLElement | undefined;
      if (!lastUser) {
        spacer.style.height = "0px";
        return;
      }
      // Sum heights of last user bubble + everything after it (excluding spacer)
      let contentBelow = 0;
      let found = false;
      Array.from(container.children).forEach((child) => {
        if (child === spacer) return;
        if (child === lastUser) found = true;
        if (found) contentBelow += (child as HTMLElement).offsetHeight;
      });
      const needed = container.clientHeight - contentBelow;
      spacer.style.height = `${Math.max(0, needed)}px`;
    };

    updateSpacer();
    const ro = new ResizeObserver(updateSpacer);
    ro.observe(container);
    const mo = new MutationObserver(updateSpacer);
    mo.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [thread.messages.length]);



  // Toggle pill shared between collapsed strip and full header
  const TogglePill = (
    <button
      onClick={handleToggle}
      title={isDisabled ? "Enable — expand and receive prompts" : "Pause — collapse and stop receiving prompts"}
      className="flex items-center px-0.5"
    >
      <span
        className={
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
          (isDisabled
            ? "bg-[var(--border-strong)]"
            : "bg-[var(--accent)]")
        }
      >
        <span
          className={
            "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform " +
            (isDisabled ? "translate-x-0.5" : "translate-x-[18px]")
          }
        />
      </span>
    </button>
  );

  // Collapsed strip when paused
  if (isDisabled) {
    return (
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={
          "flex h-full w-11 shrink-0 flex-col items-center gap-2 overflow-hidden bg-[var(--bg-soft)] py-2 opacity-50 transition border-t-2 " +
          (isFocused ? "border-t-[var(--accent)]" : "border-t-transparent") +
          (isDragOver ? " ring-2 ring-inset ring-[var(--accent)]" : "")
        }
      >
        {/* Grip is the only draggable element */}
        <span
          draggable
          onDragStart={onDragStart}
          className="cursor-grab active:cursor-grabbing text-[var(--fg-subtle)] hover:text-[var(--fg-muted)] shrink-0"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </span>
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
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "flex h-full min-w-[320px] flex-1 flex-col overflow-hidden transition border-t-2 " +
        (isFocused ? "border-t-[var(--accent)]" : "border-t-transparent") +
        (isOtherFocused ? " opacity-40" : "") +
        (isDragOver ? " ring-2 ring-inset ring-[var(--accent)]" : "")
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-soft)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            draggable
            onDragStart={onDragStart}
            className="cursor-grab active:cursor-grabbing text-[var(--fg-subtle)] hover:text-[var(--fg-muted)] shrink-0"
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </span>
          {info && <ProviderIcon provider={info.provider} size={28} />}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--fg)]">
              {info?.label ?? modelId}
            </div>
            <div className="truncate text-[11px] text-[var(--fg-muted)]">
              {providerName}
              {info?.free ? " · free" : ""}
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
              className="rounded p-1.5 text-[var(--error)] hover:bg-[var(--bg)]"
              title="Stop response"
            >
              <Square size={13} fill="currentColor" />
            </button>
          )}
          <button
            onClick={toggleFocus}
            className={
              "rounded p-1.5 hover:bg-[var(--bg)] hover:text-[var(--fg)] " +
              (isFocused ? "text-[var(--accent)]" : "")
            }
            title={isFocused ? "Exit focus mode" : "Focus on this model only"}
          >
            <Focus size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {thread.messages.length === 0 && (
          <div className="pt-8 text-center text-xs text-[var(--fg-subtle)]">
            Send a prompt to see this model respond.
          </div>
        )}
        {thread.messages.map((m) => (
          <MessageBubble key={m.id} msg={m} convId={convId} modelId={modelId} />
        ))}
        {/* Dynamic spacer: only as tall as needed so latest user msg can reach top.
            Shrinks as assistant response grows; disappears once content fills view. */}
        <div ref={spacerRef} aria-hidden style={{ height: 0 }} />
      </div>

      {isOtherFocused && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-soft)] px-3 py-1.5 text-center text-[10px] text-[var(--fg-muted)]">
          read-only · another model is focused
        </div>
      )}
    </div>
  );
}
