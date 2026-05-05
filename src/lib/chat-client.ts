"use client";

import { filterEnabledModelIds, useChat, useSettings, type Message, normalizeModelId } from "./store";
import { isCloudOllamaModelId, isOllamaModelId } from "./models";

// Per-model abort controllers for mid-stream stopping
const activeControllers = new Map<string, AbortController>();

export function abortModel(convId: string, modelId: string) {
  const key = `${convId}:${modelId}`;
  activeControllers.get(key)?.abort();
  activeControllers.delete(key);
}

type ChatRequestMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type WebContext = {
  text: string;
  grounding: NonNullable<Message["grounding"]>;
};

function extractApiError(raw: string, fallback: string): string {
  if (!raw) return fallback;
  try {
    const json = JSON.parse(raw);
    if (typeof json?.error === "string") return json.error;
    if (typeof json?.error?.message === "string") return json.error.message;
    if (typeof json?.message === "string") return json.message;
  } catch {
    /* keep raw text */
  }
  return raw;
}

function isSubscriptionError(message: string): boolean {
  return /requires?\s+(an?\s+)?subscription|upgrade\s+for\s+access/i.test(message);
}

function formatChatError(raw: string, status: number, statusText: string, modelId: string): string {
  const parsed = extractApiError(raw, statusText || "Request failed");

  if (isSubscriptionError(parsed)) {
    const provider = isCloudOllamaModelId(modelId) || isOllamaModelId(modelId)
      ? "Ollama"
      : "The provider";
    return `${provider} says this model requires a subscription. Choose another model/source, or upgrade at https://ollama.com/upgrade.`;
  }

  if (status === 429) return "Rate limited - wait a moment and try again.";
  if (status === 401) return "Invalid or missing API key for this model. Check Settings.";
  if (status === 404) return `Model "${modelId}" not found. ${parsed}`;
  if (status === 502 && isOllamaModelId(modelId)) {
    return "Ollama is offline or unreachable. Start Ollama and retry this column.";
  }
  if (status === 502 && isCloudOllamaModelId(modelId)) {
    return "Ollama API is unreachable. Check the base URL in Settings.";
  }

  return parsed || "Request failed";
}

function toApiMessages(
  history: Message[],
  systemPrompt: string,
  webContext?: WebContext
): ChatRequestMessage[] {
  const out: ChatRequestMessage[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  if (webContext) {
    out.push({
      role: "system",
      content:
        "Current web search results are provided below. Use them for up-to-date facts, cite the source numbers when relevant, and say when the search results do not answer the question.\n\n" +
        webContext.text,
    });
  }
  for (const m of history) {
    if (m.role === "system") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function streamModel(opts: {
  convId: string;
  modelId: string;
  assistantMsgId?: string;
  abortSignal?: AbortSignal;
  webContext?: WebContext;
}) {
  const { convId, modelId } = opts;
  // Create a local controller so we can abort per-model independently
  const localCtrl = new AbortController();
  const streamKey = `${convId}:${modelId}`;
  activeControllers.set(streamKey, localCtrl);
  // If a parent signal is passed (e.g. "stop all"), hook it up
  opts.abortSignal?.addEventListener("abort", () => localCtrl.abort());
  if (opts.abortSignal?.aborted) localCtrl.abort();
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

  const msgId = opts.assistantMsgId ?? chatState.startAssistant(convId, modelId);
  chatState.setAssistantStatus(convId, modelId, msgId, "thinking");

  // Normalize model ID in case persisted data still has a stale alias
  const resolvedModelId = normalizeModelId(modelId) ?? modelId;
  const startedAt = performance.now();
  let firstTokenAt: number | null = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      signal: abortSignal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModelId,
        messages: toApiMessages(history, settings.systemPrompt, opts.webContext),
        apiKey: settings.apiKey || undefined,
        geminiApiKey: settings.geminiApiKey || undefined,
        ollamaBaseUrl: settings.ollamaBaseUrl || undefined,
        ollamaApiKey: settings.ollamaApiKey || undefined,
        ollamaCloudBaseUrl: settings.ollamaCloudBaseUrl || undefined,
      }),
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => res.statusText);
      const errorMsg = formatChatError(raw, res.status, res.statusText, resolvedModelId);
      useChat.getState().failAssistant(convId, modelId, msgId, errorMsg);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: { promptTokens?: number; completionTokens?: number; costUsd?: number } | undefined;
    let grounding: Message["grounding"] | undefined = opts.webContext?.grounding;

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
            if (firstTokenAt === null) {
              firstTokenAt = performance.now();
              if (process.env.NODE_ENV === "development") {
                console.debug(
                  `[stream] first token ${resolvedModelId}: ${Math.round(firstTokenAt - startedAt)}ms`
                );
              }
            }
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
          } else if (evt.type === "grounding") {
            grounding = { queries: evt.queries, sources: evt.sources };
          } else if (evt.type === "error") {
            useChat.getState().failAssistant(convId, modelId, msgId, evt.message);
            return;
          }
        } catch {
          // ignore
        }
      }
    }

    useChat.getState().finishAssistant(convId, modelId, msgId, { usage, grounding });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") {
      // Keep whatever was already streamed - just mark as no longer pending
      useChat.getState().finishAssistant(convId, modelId, msgId);
      return;
    }
    useChat
      .getState()
      .failAssistant(convId, modelId, msgId, err instanceof Error ? err.message : String(err));
  } finally {
    if (process.env.NODE_ENV === "development") {
      console.debug(
        `[stream] finished ${resolvedModelId}: ${Math.round(performance.now() - startedAt)}ms`
      );
    }
    activeControllers.delete(streamKey);
  }
}

type SearchApiResponse = {
  query?: string;
  results?: Array<{ title: string; uri: string; snippet?: string }>;
  error?: string;
};

async function fetchWebContext(prompt: string, signal: AbortSignal): Promise<WebContext> {
  const settings = useSettings.getState();
  const res = await fetch("/api/search", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: prompt,
      apiKey: settings.googleSearchApiKey || undefined,
      searchEngineId: settings.googleSearchEngineId || undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as SearchApiResponse;
  if (!res.ok) {
    throw new Error(data.error || `Google Custom Search failed with HTTP ${res.status}.`);
  }

  const results = data.results ?? [];
  if (results.length === 0) {
    throw new Error("Google Custom Search returned no useful results.");
  }

  return {
    text: [
      `Search query: ${data.query || prompt}`,
      ...results.map(
        (result, index) =>
          `[${index + 1}] ${result.title}\nURL: ${result.uri}\nSnippet: ${result.snippet || "(no snippet)"}`
      ),
    ].join("\n\n"),
    grounding: {
      queries: data.query ? [data.query] : [prompt],
      sources: results.map((result) => ({ title: result.title, uri: result.uri })),
    },
  };
}

export function sendPromptToAll(
  convId: string,
  prompt: string
): AbortController {
  const ctrl = new AbortController();
  const state = useChat.getState();
  const settings = useSettings.getState();
  const conv = state.conversations[convId];
  if (!conv) return ctrl;
  // Respect focus mode and disabled models
  const disabled = new Set(conv.disabledModels ?? []);
  const candidateTargets = (conv.focusedModel ? [conv.focusedModel] : conv.selectedModels)
    .filter((id) => !disabled.has(id));
  const targets = filterEnabledModelIds(candidateTargets, settings);
  state.addUserMessage(convId, prompt, targets);
  const assistantMsgIds = new Map<string, string>();
  const modelControllers = new Map<string, AbortController>();
  for (const modelId of targets) {
    const msgId = state.startAssistant(convId, modelId, settings.webSearch ? "searching" : "thinking");
    const modelCtrl = new AbortController();
    const streamKey = `${convId}:${modelId}`;
    assistantMsgIds.set(modelId, msgId);
    modelControllers.set(modelId, modelCtrl);
    activeControllers.set(streamKey, modelCtrl);
    ctrl.signal.addEventListener("abort", () => modelCtrl.abort());
    modelCtrl.signal.addEventListener("abort", () => {
      const message = useChat
        .getState()
        .conversations[convId]?.threads[modelId]?.messages.find((m) => m.id === msgId);
      if (message?.pending) {
        useChat.getState().finishAssistant(convId, modelId, msgId);
      }
      if (activeControllers.get(streamKey) === modelCtrl) activeControllers.delete(streamKey);
    });
  }

  void (async () => {
    let webContext: WebContext | undefined;
    if (settings.webSearch) {
      try {
        webContext = await fetchWebContext(prompt, ctrl.signal);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        for (const modelId of targets) {
          const msgId = assistantMsgIds.get(modelId) ?? useChat.getState().startAssistant(convId, modelId);
          useChat.getState().failAssistant(convId, modelId, msgId, `Web search failed: ${message}`);
        }
        return;
      }
    }

    if (ctrl.signal.aborted) return;
    for (const modelId of targets) {
      const modelCtrl = modelControllers.get(modelId);
      if (modelCtrl?.signal.aborted) continue;
      void streamModel({
        convId,
        modelId,
        assistantMsgId: assistantMsgIds.get(modelId),
        abortSignal: modelCtrl?.signal ?? ctrl.signal,
        webContext,
      });
    }
  })();
  return ctrl;
}
