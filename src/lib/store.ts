"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SELECTED_MODELS } from "./models";
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
  focusedModel?: string | null; // when set, only this model receives further prompts
  threads: Record<string, ModelThread>; // keyed by modelId
};

type Theme = "light" | "dark";

type SettingsState = {
  apiKey: string;
  setApiKey: (k: string) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
  temperature: number;
  setTemperature: (t: number) => void;
  useOllama: boolean;
  setUseOllama: (v: boolean) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (u: string) => void;
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
      temperature: 0.7,
      setTemperature: (t) => set({ temperature: t }),
      useOllama: false,
      setUseOllama: (v) => set({ useOllama: v }),
      ollamaBaseUrl: "http://localhost:11434/v1",
      setOllamaBaseUrl: (u) => set({ ollamaBaseUrl: u }),
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
  newConversation: (selectedModels?: string[]) => string;
  setActive: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setSelectedModels: (id: string, models: string[]) => void;
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

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeId: null,
      newConversation: (selectedModels) => {
        const models = selectedModels ?? DEFAULT_SELECTED_MODELS;
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
            conversations: {
              ...s.conversations,
              [id]: { ...c, selectedModels: models, threads, focusedModel, updatedAt: Date.now() },
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
    { name: "alles-ai-chats" }
  )
);
