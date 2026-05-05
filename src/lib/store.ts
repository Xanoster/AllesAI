"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SELECTED_MODELS, MODEL_CATALOG } from "./models";
import { uid } from "./utils";

export type Role = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: Role;
  content: string;
  imageDataUrl?: string; // for vision input
  modelId?: string; // for assistant messages
  createdAt: number;
  // streaming/runtime metadata
  pending?: boolean;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number; costUsd?: number };
  favorite?: boolean;
};

// Per-model thread of messages. The user prompt is mirrored across all columns.
export type ModelThread = {
  modelId: string;
  messages: Message[];
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  selectedModels: string[];
  disabledModels?: string[]; // models paused — won't receive new prompts
  focusedModel?: string | null; // when set, only this model receives further prompts
  threads: Record<string, ModelThread>; // keyed by modelId
};

type Theme = "light" | "dark";

type SettingsState = {
  apiKey: string;
  setApiKey: (k: string) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;


  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      setApiKey: (k) => set({ apiKey: k }),
      systemPrompt: "You are a helpful, concise assistant.",
      setSystemPrompt: (s) => set({ systemPrompt: s }),


      theme: "dark",
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    { name: "alles-ai-settings" }
  )
);

type ChatState = {
  conversations: Record<string, Conversation>;
  activeId: string | null;
  lastUsedModels: string[];
  newConversation: (selectedModels?: string[]) => string;
  setActive: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setSelectedModels: (id: string, models: string[]) => void;
  toggleModelEnabled: (convId: string, modelId: string) => void;
  setFocusedModel: (id: string, modelId: string | null) => void;
  addUserMessage: (id: string, content: string, imageDataUrl?: string) => string;
  startAssistant: (convId: string, modelId: string) => string; // returns msg id
  appendAssistant: (convId: string, modelId: string, msgId: string, delta: string) => void;
  finishAssistant: (
    convId: string,
    modelId: string,
    msgId: string,
    patch?: Partial<Message>
  ) => void;
  failAssistant: (convId: string, modelId: string, msgId: string, error: string) => void;
  toggleFavorite: (convId: string, modelId: string, msgId: string) => void;
};

function emptyConversation(selectedModels: string[]): Conversation {
  const now = Date.now();
  const threads: Record<string, ModelThread> = {};
  for (const m of selectedModels) threads[m] = { modelId: m, messages: [] };
  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    selectedModels,
    threads,
  };
}

const VALID_MODEL_IDS = new Set(MODEL_CATALOG.map((model) => model.id));

const MODEL_ID_ALIASES: Record<string, string> = {
  "openai/gpt-oss-120b:free":           "openai/gpt-oss-20b:free",
  "qwen/qwen3-coder-480b:free":        "qwen/qwen3-coder:free",
  "inclusionai/ling-2.6-1t:free":      "meta-llama/llama-3.3-70b-instruct:free",
  "minimax/minimax-m2.5:free":         "qwen/qwen3-coder:free",
  "nvidia/nemotron-3-super-120b:free": "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-3-super-120b-a12b:free": "nvidia/nemotron-3-nano-30b-a3b:free",
};

function findLegacyModelIds(modelId: string): string[] {
  return Object.entries(MODEL_ID_ALIASES)
    .filter(([, currentId]) => currentId === modelId)
    .map(([legacyId]) => legacyId);
}

export function normalizeModelId(modelId: string): string | null {
  const normalized = MODEL_ID_ALIASES[modelId] ?? modelId;
  return VALID_MODEL_IDS.has(normalized) ? normalized : null;
}

function sanitizeConversation(conversation: Conversation): Conversation {
  const selectedModels = Array.from(
    new Set(
      conversation.selectedModels
        .map(normalizeModelId)
        .filter((modelId): modelId is string => Boolean(modelId))
    )
  );

  const nextSelectedModels = selectedModels.length > 0 ? selectedModels : DEFAULT_SELECTED_MODELS;
  const threads: Record<string, ModelThread> = {};

  for (const modelId of nextSelectedModels) {
    const sourceThread =
      conversation.threads[modelId] ??
      findLegacyModelIds(modelId)
        .map((legacyId) => conversation.threads[legacyId])
        .find(Boolean);
    threads[modelId] = sourceThread
      ? {
          ...sourceThread,
          modelId,
          messages: sourceThread.messages.map((message) =>
            message.modelId ? { ...message, modelId: normalizeModelId(message.modelId) ?? modelId } : message
          ),
        }
      : { modelId, messages: [] };
  }

  const focusedModel = conversation.focusedModel ? normalizeModelId(conversation.focusedModel) : null;

  return {
    ...conversation,
    selectedModels: nextSelectedModels,
    focusedModel: focusedModel && nextSelectedModels.includes(focusedModel) ? focusedModel : null,
    threads,
  };
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeId: null,
      lastUsedModels: DEFAULT_SELECTED_MODELS,
      newConversation: (selectedModels) => {
        // If the active conversation is still blank (no messages), reuse it
        const { conversations, activeId, lastUsedModels } = get();
        if (activeId) {
          const active = conversations[activeId];
          if (active) {
            const hasMessages = Object.values(active.threads).some(
              (t) => t.messages.length > 0
            );
            if (!hasMessages) return activeId;
          }
        }
        // Use explicitly passed models, or the last models the user selected globally
        const models = selectedModels ?? lastUsedModels;
        const c = emptyConversation(models);
        set((s) => ({
          conversations: { ...s.conversations, [c.id]: c },
          activeId: c.id,
        }));
        return c.id;
      },
      setActive: (id) => set({ activeId: id }),
      deleteConversation: (id) =>
        set((s) => {
          const next = { ...s.conversations };
          delete next[id];
          const remaining = Object.keys(next);
          return {
            conversations: next,
            activeId: s.activeId === id ? remaining[0] ?? null : s.activeId,
          };
        }),
      renameConversation: (id, title) =>
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          return {
            conversations: { ...s.conversations, [id]: { ...c, title, updatedAt: Date.now() } },
          };
        }),
      setSelectedModels: (id, models) =>
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          const threads = { ...c.threads };
          for (const m of models) {
            if (!threads[m]) threads[m] = { modelId: m, messages: [] };
          }
          // If focused model was deselected, clear focus
          const focusedModel = c.focusedModel && models.includes(c.focusedModel) ? c.focusedModel : null;
          return {
            lastUsedModels: models,
            conversations: {
              ...s.conversations,
              [id]: { ...c, selectedModels: models, threads, focusedModel, updatedAt: Date.now() },
            },
          };
        }),
      toggleModelEnabled: (convId, modelId) =>
        set((s) => {
          const c = s.conversations[convId];
          if (!c) return s;
          const disabled = c.disabledModels ?? [];
          const isDisabled = disabled.includes(modelId);
          return {
            conversations: {
              ...s.conversations,
              [convId]: {
                ...c,
                disabledModels: isDisabled
                  ? disabled.filter((m) => m !== modelId)
                  : [...disabled, modelId],
                updatedAt: Date.now(),
              },
            },
          };
        }),
      setFocusedModel: (id, modelId) =>
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          return {
            conversations: {
              ...s.conversations,
              [id]: { ...c, focusedModel: modelId, updatedAt: Date.now() },
            },
          };
        }),
      addUserMessage: (id, content, imageDataUrl) => {
        const msgId = uid();
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          const threads = { ...c.threads };
          // If focused, only add to focused model thread; else add to all selected
          const targets = c.focusedModel ? [c.focusedModel] : c.selectedModels;
          for (const m of targets) {
            const t = threads[m] ?? { modelId: m, messages: [] };
            threads[m] = {
              ...t,
              messages: [
                ...t.messages,
                { id: msgId, role: "user", content, imageDataUrl, createdAt: Date.now() },
              ],
            };
          }
          const title =
            c.title === "New chat" ? content.slice(0, 60) || "New chat" : c.title;
          return {
            conversations: {
              ...s.conversations,
              [id]: { ...c, threads, title, updatedAt: Date.now() },
            },
          };
        });
        return msgId;
      },
      startAssistant: (convId, modelId) => {
        const msgId = uid();
        set((s) => {
          const c = s.conversations[convId];
          if (!c) return s;
          const t = c.threads[modelId] ?? { modelId, messages: [] };
          const newT: ModelThread = {
            ...t,
            messages: [
              ...t.messages,
              {
                id: msgId,
                role: "assistant",
                content: "",
                modelId,
                pending: true,
                createdAt: Date.now(),
              },
            ],
          };
          return {
            conversations: {
              ...s.conversations,
              [convId]: { ...c, threads: { ...c.threads, [modelId]: newT } },
            },
          };
        });
        return msgId;
      },
      appendAssistant: (convId, modelId, msgId, delta) =>
        set((s) => {
          const c = s.conversations[convId];
          if (!c) return s;
          const t = c.threads[modelId];
          if (!t) return s;
          const messages = t.messages.map((m) =>
            m.id === msgId ? { ...m, content: m.content + delta } : m
          );
          return {
            conversations: {
              ...s.conversations,
              [convId]: { ...c, threads: { ...c.threads, [modelId]: { ...t, messages } } },
            },
          };
        }),
      finishAssistant: (convId, modelId, msgId, patch) =>
        set((s) => {
          const c = s.conversations[convId];
          if (!c) return s;
          const t = c.threads[modelId];
          if (!t) return s;
          const messages = t.messages.map((m) =>
            m.id === msgId ? { ...m, pending: false, ...patch } : m
          );
          return {
            conversations: {
              ...s.conversations,
              [convId]: {
                ...c,
                threads: { ...c.threads, [modelId]: { ...t, messages } },
                updatedAt: Date.now(),
              },
            },
          };
        }),
      failAssistant: (convId, modelId, msgId, error) =>
        get().finishAssistant(convId, modelId, msgId, { error, pending: false }),
      toggleFavorite: (convId, modelId, msgId) =>
        set((s) => {
          const c = s.conversations[convId];
          if (!c) return s;
          const t = c.threads[modelId];
          if (!t) return s;
          const messages = t.messages.map((m) =>
            m.id === msgId ? { ...m, favorite: !m.favorite } : m
          );
          return {
            conversations: {
              ...s.conversations,
              [convId]: { ...c, threads: { ...c.threads, [modelId]: { ...t, messages } } },
            },
          };
        }),
    }),
    {
      name: "alles-ai-chats",
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as Partial<ChatState> | undefined;
        const conversations = Object.fromEntries(
          Object.entries(state?.conversations ?? {}).map(([id, conversation]) => [
            id,
            sanitizeConversation(conversation as Conversation),
          ])
        );

        const lastUsedModels = Array.from(
          new Set(
            (state?.lastUsedModels ?? [])
              .map(normalizeModelId)
              .filter((modelId): modelId is string => Boolean(modelId))
          )
        );

        return {
          ...state,
          conversations,
          lastUsedModels: lastUsedModels.length > 0 ? lastUsedModels : DEFAULT_SELECTED_MODELS,
          activeId:
            state?.activeId && conversations[state.activeId]
              ? state.activeId
              : Object.keys(conversations)[0] ?? null,
        } as ChatState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Always sanitize on load — don't rely solely on version-based migration
        const sanitizedConvs = Object.fromEntries(
          Object.entries(state.conversations).map(([id, conv]) => [
            id,
            sanitizeConversation(conv),
          ])
        );
        const sanitizedLast = Array.from(
          new Set(
            state.lastUsedModels
              .map(normalizeModelId)
              .filter((id): id is string => Boolean(id))
          )
        );
        useChat.setState({
          conversations: sanitizedConvs,
          lastUsedModels: sanitizedLast.length > 0 ? sanitizedLast : DEFAULT_SELECTED_MODELS,
        });
      },
    }
  )
);
