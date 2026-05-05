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
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    shortLabel: "GPT-OSS",
    provider: "openai",
    free: true,
    context: 131072,
    category: "General",
  },
  {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout 17B",
    shortLabel: "Llama 4 Scout",
    provider: "meta",
    free: true,
    context: 131072,
    category: "Vision",
    vision: true,
  },
  {
    id: "qwen/qwen3-32b",
    label: "Qwen3 32B",
    shortLabel: "Qwen3 32B",
    provider: "qwen",
    free: true,
    context: 131072,
    category: "General",
  },
  {
    id: "groq/compound",
    label: "Groq Compound",
    shortLabel: "Compound",
    provider: "groq",
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

// Default selection: all 4 models
export const DEFAULT_SELECTED_MODELS = [
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "groq/compound",
];

// Consensus synthesizer — fastest + tool-capable
export const CONSENSUS_MODEL = "groq/compound";
