"use client";

import { useChat, useSettings, type Message } from "./store";
import { getModel } from "./models";

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

function estimateCostUsd(
  _modelId: string,
  _usage: { prompt_tokens?: number; completion_tokens?: number }
): number | undefined {
  // All models are free — no cost estimation needed
  return undefined;
}

export async function streamModel(opts: {
  convId: string;
  modelId: string;
  abortSignal?: AbortSignal;
}) {
  const { convId, modelId, abortSignal } = opts;
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

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      signal: abortSignal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: toApiMessages(history, settings.systemPrompt),
        apiKey: settings.apiKey || undefined,
        temperature: settings.temperature,
        useOllama: settings.useOllama,
        ollamaBaseUrl: settings.ollamaBaseUrl,
      }),
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => res.statusText);
      let errorMsg = raw || "Request failed";
      // Parse OpenRouter JSON error: { error: { message, code } }
      try {
        const json = JSON.parse(raw);
        if (json?.error?.message) errorMsg = json.error.message;
        else if (json?.message) errorMsg = json.message;
      } catch { /* keep raw text */ }
      if (res.status === 429) errorMsg = "Rate limited — wait a moment and try again.";
      if (res.status === 401) errorMsg = "Invalid or missing API key. Check Settings.";
      if (res.status === 404) errorMsg = `Model not found: "${modelId}". Try a different model.`;
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
              costUsd: typeof u.cost === "number" ? u.cost : estimateCostUsd(modelId, u),
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
      useChat
        .getState()
        .finishAssistant(convId, modelId, msgId, { error: "Stopped" });
      return;
    }
    useChat
      .getState()
      .failAssistant(convId, modelId, msgId, err instanceof Error ? err.message : String(err));
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
  // Respect focus mode: only stream to focused model if set
  const targets = conv.focusedModel ? [conv.focusedModel] : conv.selectedModels;
  for (const modelId of targets) {
    void streamModel({ convId, modelId, abortSignal: ctrl.signal });
  }
  return ctrl;
}
