// 5 FREE models — live-tested and responding on OpenRouter as of 2026-04-28.
// Zero paid models. Zero redundancy. One per provider.

import type { ProviderKey } from "./providers";

export type ModelInfo = {
  id: string;
  label: string;
  shortLabel?: string;
  provider: ProviderKey;
  free: true;
  context: number;
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
    id: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B",
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
    context: 131072,
    category: "General",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder",
    shortLabel: "Qwen3",
    provider: "qwen",
    free: true,
    context: 131072,
    category: "Coding",
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "Nemotron 3 Nano 30B",
    shortLabel: "Nemotron Nano",
    provider: "nvidia",
    free: true,
    context: 131072,
    category: "Agents",
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
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

// Consensus synthesizer
export const CONSENSUS_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";
