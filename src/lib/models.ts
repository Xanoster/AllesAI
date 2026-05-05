// 8 FREE models — all verified live on OpenRouter API as of 2026-04-28.
// Zero paid models. Zero redundancy. One best per provider.

import type { ProviderKey } from "./providers";

export type ModelInfo = {
  id: string;
  label: string;
  shortLabel?: string;
  provider: ProviderKey;
  free: true;
  context: number;
  /** One-word category for the UI badge */
  category: string;
  vision?: boolean;
  thinking?: boolean;
};

export type ProviderGroup = {
  provider: ProviderKey;
  freeModel?: ModelInfo;
  paidModels: ModelInfo[];
};

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B",
    shortLabel: "GPT-OSS",
    provider: "openai",
    free: true,
    context: 131072,
    category: "General",
  },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    shortLabel: "Gemma 4",
    provider: "google",
    free: true,
    context: 262144,
    category: "Vision",
    vision: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B",
    shortLabel: "Llama 3.3",
    provider: "meta",
    free: true,
    context: 65536,
    category: "General",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder 480B",
    shortLabel: "Qwen3 Coder",
    provider: "qwen",
    free: true,
    context: 262000,
    category: "Coding",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B",
    shortLabel: "Nemotron Super",
    provider: "nvidia",
    free: true,
    context: 262144,
    category: "Agents",
  },
  {
    id: "inclusionai/ling-2.6-1t:free",
    label: "Ling 2.6 1T",
    shortLabel: "Ling 2.6",
    provider: "inclusionai",
    free: true,
    context: 262144,
    category: "General",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    label: "Hermes 3 405B",
    shortLabel: "Hermes 3",
    provider: "nous",
    free: true,
    context: 131072,
    category: "Reasoning",
    thinking: true,
  },
  {
    id: "minimax/minimax-m2.5:free",
    label: "MiniMax M2.5",
    shortLabel: "M2.5",
    provider: "minimax",
    free: true,
    context: 196608,
    category: "General",
  },
];

export function getModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function getProviderGroups(): ProviderGroup[] {
  const map = new Map<ProviderKey, ProviderGroup>();
  for (const m of MODEL_CATALOG) {
    let g = map.get(m.provider);
    if (!g) {
      g = { provider: m.provider, paidModels: [] };
      map.set(m.provider, g);
    }
    g.freeModel = m; // all are free — one per provider
  }
  return Array.from(map.values());
}

// Default selection: 3 diverse free models
export const DEFAULT_SELECTED_MODELS = [
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

// Consensus synthesizer: largest context, large param count
export const CONSENSUS_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
