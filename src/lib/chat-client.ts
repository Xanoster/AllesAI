"use client";

import { useChat, useSettings, type Message, normalizeModelId } from "./store";
import { getModel } from "./models";

// Per-model abort controllers for mid-stream stopping
const activeControllers = new Map<string, AbortController>();

export function abortModel(convId: string, modelId: string) {
  const key = `${convId}:${modelId}`;
  activeControllers.get(key)?.abort();
  activeControllers.delete(key);
}

type ChatRequestMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

function toApiMessages(history: Message[], systemPrompt: string): ChatRequestMessage[] {
  const out: ChatRequestMessage[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of history) {
    if (m.role === "system") continue;
    if (m.role === "user" && m.imageDataUrl) {
      out.push({
        role: "user",
        content: [
          { type: "text", text: m.content || "" },
          { type: "image_url", image_url: { url: m.imageDataUrl } },
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export async function streamModel(opts: {
  convId: string;
  modelId: string;
  abortSignal?: AbortSignal;
}) {
  const { convId, modelId } = opts;
  // Create a local controller so we can abort per-model independently
  const localCtrl = new AbortController();
  const streamKey = `${convId}:${modelId}`;
  activeControllers.set(streamKey, localCtrl);
  // If a parent signal is passed (e.g. "stop all"), hook it up
  opts.abortSignal?.addEventListener("abort", () => localCtrl.abort());
  const abortSignal = localCtrl.signal;
  const chatState = useChat.getState();
  const settings = useSettings.getState();
  const conv = chatState.conversations[convId];
  if (!conv) return;
  const thread = conv.threads[modelId];
  if (!thread) return;

  // Drop any trailing assistant placeholder we're about to add anew, send only history.
  const history = thread.messages.filter(
    (m) => !(m.role === "assistant" && m.pending)
  );

  const msgId = chatState.startAssistant(convId, modelId);

  // Normalize model ID in case persisted data still has a stale alias
  const resolvedModelId = normalizeModelId(modelId) ?? modelId;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      signal: abortSignal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModelId,
        messages: toApiMessages(history, settings.systemPrompt),
        apiKey: settings.apiKey || undefined,
        geminiApiKey: settings.geminiApiKey || undefined,
      }),
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => res.statusText);
      let errorMsg = raw || "Request failed";
      // Parse Groq/OpenAI JSON error: { error: { message, code } }
      try {
        const json = JSON.parse(raw);
        if (json?.error?.message) errorMsg = json.error.message;
        else if (json?.message) errorMsg = json.message;
      } catch { /* keep raw text */ }
      if (res.status === 429) errorMsg = "Rate limited — wait a moment and try again.";
      if (res.status === 401) errorMsg = "Invalid or missing API key for this model. Check Settings.";
      if (res.status === 404) errorMsg = `Model "${resolvedModelId}" not found. ${errorMsg}`;
      useChat.getState().failAssistant(convId, modelId, msgId, errorMsg);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: { promptTokens?: number; completionTokens?: number; costUsd?: number } | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "delta") {
            useChat.getState().appendAssistant(convId, modelId, msgId, evt.text);
          } else if (evt.type === "usage") {
            const u = evt.usage as {
              prompt_tokens?: number;
              completion_tokens?: number;
              cost?: number;
            };
            usage = {
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
              costUsd: typeof u.cost === "number" ? u.cost : undefined,
            };
          } else if (evt.type === "error") {
            useChat.getState().failAssistant(convId, modelId, msgId, evt.message);
            return;
          }
        } catch {
          // ignore
        }
      }
    }

    useChat.getState().finishAssistant(convId, modelId, msgId, { usage });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") {
      // Keep whatever was already streamed — just mark as no longer pending
      useChat.getState().finishAssistant(convId, modelId, msgId);
      return;
    }
    useChat
      .getState()
      .failAssistant(convId, modelId, msgId, err instanceof Error ? err.message : String(err));
  } finally {
    activeControllers.delete(streamKey);
  }
}

export function sendPromptToAll(
  convId: string,
  prompt: string,
  imageDataUrl?: string
): AbortController {
  const ctrl = new AbortController();
  const state = useChat.getState();
  state.addUserMessage(convId, prompt, imageDataUrl);
  const conv = useChat.getState().conversations[convId];
  if (!conv) return ctrl;
  // Respect focus mode and disabled models
  const disabled = new Set(conv.disabledModels ?? []);
  const targets = (conv.focusedModel ? [conv.focusedModel] : conv.selectedModels)
    .filter((id) => !disabled.has(id));
  for (const modelId of targets) {
    void streamModel({ convId, modelId, abortSignal: ctrl.signal });
  }
  return ctrl;
}
