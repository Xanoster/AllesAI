"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CONSENSUS_MODEL,
  DEFAULT_SELECTED_MODELS,
  MODEL_CATALOG,
  PRESET_CLOUD_OLLAMA_MODELS,
  dedupeModelIdsByFamily,
  getCloudOllamaModelName,
  getLocalOllamaModelInfo,
  getModel,
  getModelFamilyId,
  getPresetCloudOllamaModelInfos,
  isCloudOllamaModelId,
  isOllamaModelId,
  type ModelInfo,
} from "./models";
import type { ApiProviderKey } from "./providers";
import { uid } from "./utils";

export type Role = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: Role;
  content: string;
  imageDataUrl?: never; // image upload removed
  modelId?: string; // for assistant messages
  createdAt: number;
  // streaming/runtime metadata
  pending?: boolean;
  error?: string;
  responseTimeMs?: number;
  usage?: { promptTokens?: number; completionTokens?: number; costUsd?: number };
  grounding?: { queries: string[]; sources: Array<{ title: string; uri: string }> };
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
  disabledModels?: string[]; // models paused - won't receive new prompts
  focusedModel?: string | null; // when set, only this model receives further prompts
  threads: Record<string, ModelThread>; // keyed by modelId
  consensusMessages?: Message[];
};

type Theme = "light" | "dark";

export type LocalOllamaModel = {
  name: string;
  model: string;
  modifiedAt?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
};

export type SettingsState = {
  apiKey: string;
  setApiKey: (k: string) => void;
  groqEnabled: boolean;
  setGroqEnabled: (v: boolean) => void;
  geminiApiKey: string;
  setGeminiApiKey: (k: string) => void;
  geminiEnabled: boolean;
  setGeminiEnabled: (v: boolean) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
  webSearch: boolean;
  setWebSearch: (v: boolean) => void;
  compactColumns: boolean;
  setCompactColumns: (v: boolean) => void;
  consensusModel: string;
  setConsensusModel: (modelId: string) => void;
  saveConsensusToChat: boolean;
  setSaveConsensusToChat: (v: boolean) => void;
  localEnabled: boolean;
  setLocalEnabled: (v: boolean) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  ollamaApiKey: string;
  setOllamaApiKey: (k: string) => void;
  cloudOllamaEnabled: boolean;
  setCloudOllamaEnabled: (v: boolean) => void;
  ollamaCloudBaseUrl: string;
  setOllamaCloudBaseUrl: (url: string) => void;
  availableLocalModels: LocalOllamaModel[];
  setAvailableLocalModels: (models: LocalOllamaModel[]) => void;

  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

export type ProviderToggleSettings = Pick<
  SettingsState,
  "groqEnabled" | "geminiEnabled" | "cloudOllamaEnabled" | "localEnabled"
>;

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      setApiKey: (k) => set({ apiKey: k }),
      groqEnabled: true,
      setGroqEnabled: (v) => set({ groqEnabled: v }),
      geminiApiKey: "",
      setGeminiApiKey: (k) => set({ geminiApiKey: k }),
      geminiEnabled: true,
      setGeminiEnabled: (v) => set({ geminiEnabled: v }),
      systemPrompt: "You are a helpful, concise assistant.",
      setSystemPrompt: (s) => set({ systemPrompt: s }),
      webSearch: false,
      setWebSearch: (v) => set({ webSearch: v }),
      compactColumns: false,
      setCompactColumns: (v) => set({ compactColumns: v }),
      consensusModel: CONSENSUS_MODEL,
      setConsensusModel: (modelId) => set({ consensusModel: modelId }),
      saveConsensusToChat: false,
      setSaveConsensusToChat: (v) => set({ saveConsensusToChat: v }),
      localEnabled: false,
      setLocalEnabled: (v) => set({ localEnabled: v, availableLocalModels: [] }),
      ollamaBaseUrl: "http://localhost:11434",
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
      ollamaApiKey: "",
      setOllamaApiKey: (k) => set({ ollamaApiKey: k }),
      cloudOllamaEnabled: false,
      setCloudOllamaEnabled: (v) => set({ cloudOllamaEnabled: v }),
      ollamaCloudBaseUrl: "https://ollama.com",
      setOllamaCloudBaseUrl: (url) => set({ ollamaCloudBaseUrl: url }),
      availableLocalModels: [],
      setAvailableLocalModels: (models) => set({ availableLocalModels: models }),

      theme: "dark",
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    {
      name: "alles-ai-settings",
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<SettingsState>;
        return {
          apiKey: state.apiKey ?? "",
          groqEnabled: state.groqEnabled ?? true,
          geminiApiKey: state.geminiApiKey ?? "",
          geminiEnabled: state.geminiEnabled ?? true,
          systemPrompt: state.systemPrompt ?? "You are a helpful, concise assistant.",
          webSearch: state.webSearch ?? false,
          compactColumns: state.compactColumns ?? false,
          consensusModel: state.consensusModel ?? CONSENSUS_MODEL,
          saveConsensusToChat: state.saveConsensusToChat ?? false,
          localEnabled: state.localEnabled ?? false,
          ollamaBaseUrl: state.ollamaBaseUrl ?? "http://localhost:11434",
          ollamaApiKey: state.ollamaApiKey ?? "",
          cloudOllamaEnabled: state.cloudOllamaEnabled ?? false,
          ollamaCloudBaseUrl: state.ollamaCloudBaseUrl ?? "https://ollama.com",
          theme: state.theme ?? "dark",
        };
      },
      partialize: (state) => ({
        apiKey: state.apiKey,
        groqEnabled: state.groqEnabled,
        geminiApiKey: state.geminiApiKey,
        geminiEnabled: state.geminiEnabled,
        systemPrompt: state.systemPrompt,
        webSearch: state.webSearch,
        compactColumns: state.compactColumns,
        consensusModel: state.consensusModel,
        saveConsensusToChat: state.saveConsensusToChat,
        localEnabled: state.localEnabled,
        ollamaBaseUrl: state.ollamaBaseUrl,
        ollamaApiKey: state.ollamaApiKey,
        cloudOllamaEnabled: state.cloudOllamaEnabled,
        ollamaCloudBaseUrl: state.ollamaCloudBaseUrl,
        theme: state.theme,
      }),
    }
  )
);

export function isApiProviderEnabled(
  apiProvider: ApiProviderKey,
  settings: ProviderToggleSettings = useSettings.getState()
): boolean {
  if (apiProvider === "groq") return settings.groqEnabled;
  if (apiProvider === "gemini") return settings.geminiEnabled;
  if (apiProvider === "ollama-cloud") return settings.cloudOllamaEnabled;
  if (apiProvider === "ollama-local") return settings.localEnabled;
  return true;
}

export function filterEnabledModelIds(
  modelIds: string[],
  settings: ProviderToggleSettings = useSettings.getState()
): string[] {
  return modelIds.filter((modelId) => {
    const model = getModel(modelId);
    return model ? isApiProviderEnabled(model.apiProvider, settings) : false;
  });
}

function getEnabledRoutes(settings: SettingsState): ModelInfo[] {
  return [
    ...MODEL_CATALOG,
    ...(settings.cloudOllamaEnabled ? getPresetCloudOllamaModelInfos() : []),
    ...(settings.localEnabled
      ? settings.availableLocalModels.map((model) => getLocalOllamaModelInfo(model.name))
      : []),
  ].filter((route) => isApiProviderEnabled(route.apiProvider, settings));
}

function findReplacementRoute(
  modelId: string,
  removedProvider: ApiProviderKey,
  settings: SettingsState
): string | null {
  const familyId = getModelFamilyId(modelId);
  return (
    getEnabledRoutes(settings).find(
      (route) => route.apiProvider !== removedProvider && route.familyId === familyId
    )?.id ?? null
  );
}

function replaceProviderRoutes(
  modelIds: string[],
  removedProvider: ApiProviderKey,
  settings: SettingsState
): string[] {
  const next = modelIds.flatMap((modelId) => {
    const model = getModel(modelId);
    if (model?.apiProvider !== removedProvider) return [modelId];
    const replacement = findReplacementRoute(modelId, removedProvider, settings);
    return replacement ? [replacement] : [];
  });
  return dedupeModelIdsByFamily(Array.from(new Set(next)));
}

function ensureThreadsForSelectedModels(
  conversation: Conversation,
  selectedModels: string[]
): Record<string, ModelThread> {
  const threads = { ...conversation.threads };
  for (const modelId of selectedModels) {
    if (threads[modelId]) continue;
    const familyId = getModelFamilyId(modelId);
    const sourceThread = Object.values(threads).find(
      (thread) => getModelFamilyId(thread.modelId) === familyId
    );
    threads[modelId] = sourceThread
      ? {
          ...sourceThread,
          modelId,
          messages: sourceThread.messages.map((message) =>
            message.modelId ? { ...message, modelId } : message
          ),
        }
      : { modelId, messages: [] };
  }
  return threads;
}

type ChatState = {
  conversations: Record<string, Conversation>;
  activeId: string | null;
  lastUsedModels: string[];
  newConversation: (selectedModels?: string[]) => string;
  setActive: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearConversations: () => void;
  importConversations: (conversations: Record<string, Conversation>) => void;
  renameConversation: (id: string, title: string) => void;
  setSelectedModels: (id: string, models: string[]) => void;
  removeApiProviderModels: (apiProvider: ApiProviderKey) => void;
  removeOllamaModels: () => void;
  removeLocalOllamaModels: () => void;
  removeCloudOllamaModels: () => void;
  toggleModelEnabled: (convId: string, modelId: string) => void;
  setFocusedModel: (id: string, modelId: string | null) => void;
  addUserMessage: (id: string, content: string, modelIds?: string[]) => string;
  startAssistant: (convId: string, modelId: string) => string; // returns msg id
  appendAssistant: (convId: string, modelId: string, msgId: string, delta: string) => void;
  finishAssistant: (
    convId: string,
    modelId: string,
    msgId: string,
    patch?: Partial<Message>
  ) => void;
  failAssistant: (convId: string, modelId: string, msgId: string, error: string) => void;
  saveConsensus: (convId: string, content: string, modelId: string) => void;
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
    consensusMessages: [],
  };
}

const VALID_MODEL_IDS = new Set(MODEL_CATALOG.map((model) => model.id));

const MODEL_ID_ALIASES: Record<string, string> = {
  // Legacy :free suffix -> Groq IDs
  "openai/gpt-oss-120b:free": "openai/gpt-oss-120b",
  // Legacy hosted Ollama names -> direct Ollama API names
  "ollama-cloud/gpt-oss:120b-cloud": "ollama-cloud/gpt-oss:120b",
  "ollama-cloud/gemma4:31b-cloud": "ollama-cloud/gemma4:31b",
  // Removed legacy model IDs -> point to nothing
  "deepseek-chat": "",
  "deepseek-r1-distill-llama-70b": "",
  "deepseek-v4-flash": "",
  "ollama-cloud/qwen3-vl:235b-cloud": "",
  "ollama-cloud/glm-4.6:cloud": "",
  "ollama-cloud/minimax-m2.5:cloud": "",
  // Old Gemini IDs -> 2.5 flash lite
  "gemini-2.0-flash": "gemini-2.5-flash-lite",
  "gemini-2.5-flash": "gemini-2.5-flash-lite",
  // gemini-2.5-pro removed
  "gemini-2.5-pro": "gemini-2.5-flash-lite",
};

function findLegacyModelIds(modelId: string): string[] {
  return Object.entries(MODEL_ID_ALIASES)
    .filter(([, currentId]) => currentId === modelId)
    .map(([legacyId]) => legacyId);
}

const VALID_CLOUD_MODEL_NAMES = new Set(PRESET_CLOUD_OLLAMA_MODELS.map((m) => m.name));

export function normalizeModelId(modelId: string): string | null {
  const normalized = MODEL_ID_ALIASES[modelId] ?? modelId;
  if (isOllamaModelId(normalized)) return normalized;
  if (isCloudOllamaModelId(normalized)) {
    return VALID_CLOUD_MODEL_NAMES.has(getCloudOllamaModelName(normalized)) ? normalized : null;
  }
  return VALID_MODEL_IDS.has(normalized) ? normalized : null;
}

function sanitizeConversation(conversation: Conversation): Conversation {
  const selectedModels = dedupeModelIdsByFamily(
    Array.from(
      new Set(
        conversation.selectedModels
          .map(normalizeModelId)
          .filter((modelId): modelId is string => Boolean(modelId))
      )
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
    consensusMessages: conversation.consensusMessages ?? [],
  };
}

function removeSelectedRoutes(
  state: ChatState,
  shouldRemove: (modelId: string) => boolean
): Pick<ChatState, "conversations" | "lastUsedModels"> {
  const conversations = Object.fromEntries(
    Object.entries(state.conversations).map(([id, conversation]) => [
      id,
      {
        ...conversation,
        selectedModels: conversation.selectedModels.filter((modelId) => !shouldRemove(modelId)),
        disabledModels: (conversation.disabledModels ?? []).filter((modelId) => !shouldRemove(modelId)),
        focusedModel:
          conversation.focusedModel && shouldRemove(conversation.focusedModel)
            ? null
            : conversation.focusedModel,
        updatedAt: Date.now(),
      },
    ])
  );

  return {
    conversations,
    lastUsedModels: state.lastUsedModels.filter((modelId) => !shouldRemove(modelId)),
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
        // Use explicitly passed models, or the last active provider-compatible models.
        const models =
          filterEnabledModelIds(selectedModels ?? lastUsedModels).length > 0
            ? filterEnabledModelIds(selectedModels ?? lastUsedModels)
            : selectedModels
              ? []
              : filterEnabledModelIds(DEFAULT_SELECTED_MODELS);
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
      clearConversations: () => set({ conversations: {}, activeId: null }),
      importConversations: (incoming) =>
        set((s) => {
          const imported = Object.fromEntries(
            Object.entries(incoming).map(([id, conversation]) => [
              id,
              sanitizeConversation(conversation),
            ])
          );
          return {
            conversations: { ...s.conversations, ...imported },
            activeId: Object.keys(imported)[0] ?? s.activeId,
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
          const nextModels = dedupeModelIdsByFamily(
            Array.from(
              new Set(
                models
                  .map(normalizeModelId)
                  .filter((modelId): modelId is string => Boolean(modelId))
              )
            )
          );
          const threads = { ...c.threads };
          for (const m of nextModels) {
            if (!threads[m]) {
              const familyId = getModelFamilyId(m);
              const sourceThread = Object.values(threads).find(
                (thread) => getModelFamilyId(thread.modelId) === familyId
              );
              threads[m] = sourceThread
                ? {
                    ...sourceThread,
                    modelId: m,
                    messages: sourceThread.messages.map((message) =>
                      message.modelId ? { ...message, modelId: m } : message
                    ),
                  }
                : { modelId: m, messages: [] };
            }
          }
          // If focused model was deselected, clear focus
          const focusedModel = c.focusedModel && nextModels.includes(c.focusedModel) ? c.focusedModel : null;
          return {
            lastUsedModels: nextModels,
            conversations: {
              ...s.conversations,
              [id]: { ...c, selectedModels: nextModels, threads, focusedModel, updatedAt: Date.now() },
            },
          };
        }),
      removeOllamaModels: () =>
        set((s) =>
          removeSelectedRoutes(
            s,
            (modelId) => isOllamaModelId(modelId) || isCloudOllamaModelId(modelId)
          )
        ),
      removeApiProviderModels: (apiProvider) =>
        set((s) => {
          const settings = useSettings.getState();
          const conversations = Object.fromEntries(
            Object.entries(s.conversations).map(([id, conversation]) => {
              const selectedModels = replaceProviderRoutes(
                conversation.selectedModels,
                apiProvider,
                settings
              );
              const focusedReplacement =
                conversation.focusedModel &&
                getModel(conversation.focusedModel)?.apiProvider === apiProvider
                  ? findReplacementRoute(conversation.focusedModel, apiProvider, settings)
                  : conversation.focusedModel;
              const focusedModel =
                focusedReplacement && selectedModels.includes(focusedReplacement)
                  ? focusedReplacement
                  : null;

              return [
                id,
                {
                  ...conversation,
                  selectedModels,
                  disabledModels: (conversation.disabledModels ?? []).filter(
                    (modelId) => getModel(modelId)?.apiProvider !== apiProvider
                  ),
                  focusedModel,
                  threads: ensureThreadsForSelectedModels(conversation, selectedModels),
                  updatedAt: Date.now(),
                },
              ];
            })
          );

          return {
            conversations,
            lastUsedModels: replaceProviderRoutes(s.lastUsedModels, apiProvider, settings),
          };
        }),
      removeLocalOllamaModels: () =>
        set((s) => removeSelectedRoutes(s, isOllamaModelId)),
      removeCloudOllamaModels: () =>
        set((s) => removeSelectedRoutes(s, isCloudOllamaModelId)),
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
      addUserMessage: (id, content, modelIds) => {
        const msgId = uid();
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          const threads = { ...c.threads };
          // If focused, only add to focused model thread; else add to all selected
          const targets = modelIds ?? (c.focusedModel ? [c.focusedModel] : c.selectedModels);
          for (const m of targets) {
            const t = threads[m] ?? { modelId: m, messages: [] };
            threads[m] = {
              ...t,
              messages: [
                ...t.messages,
                { id: msgId, role: "user", content, createdAt: Date.now() },
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
          const finishedAt = Date.now();
          const messages = t.messages.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  pending: false,
                  responseTimeMs:
                    patch?.responseTimeMs ??
                    m.responseTimeMs ??
                    Math.max(0, finishedAt - m.createdAt),
                  ...patch,
                }
              : m
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
      saveConsensus: (convId, content, modelId) =>
        set((s) => {
          const c = s.conversations[convId];
          if (!c) return s;
          const note: Message = {
            id: uid(),
            role: "assistant",
            content,
            modelId,
            createdAt: Date.now(),
          };
          return {
            conversations: {
              ...s.conversations,
              [convId]: {
                ...c,
                consensusMessages: [...(c.consensusMessages ?? []), note],
                updatedAt: Date.now(),
              },
            },
          };
        }),
    }),
    {
      name: "alles-ai-chats",
      version: 19,
      migrate: (persistedState) => {
        const state = persistedState as Partial<ChatState> | undefined;
        const conversations = Object.fromEntries(
          Object.entries(state?.conversations ?? {}).map(([id, conversation]) => [
            id,
            sanitizeConversation(conversation as Conversation),
          ])
        );

        const lastUsedModels = dedupeModelIdsByFamily(
          Array.from(
            new Set(
              (state?.lastUsedModels ?? [])
                .map(normalizeModelId)
                .filter((modelId): modelId is string => Boolean(modelId))
            )
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
        // Always sanitize on load - don't rely solely on version-based migration
        const sanitizedConvs = Object.fromEntries(
          Object.entries(state.conversations).map(([id, conv]) => [
            id,
            sanitizeConversation(conv),
          ])
        );
        const sanitizedLast = dedupeModelIdsByFamily(
          Array.from(
            new Set(
              state.lastUsedModels
                .map(normalizeModelId)
                .filter((id): id is string => Boolean(id))
            )
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
