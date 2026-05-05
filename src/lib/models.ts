// Models catalog — free defaults only.

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
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    shortLabel: "Gemini 2.5 Flash",
    provider: "gemini",
    free: true,
    context: 1048576,
    category: "General",
    vision: true,
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
    if (m.free) {
      g.freeModel = m;
    } else {
      g.paidModels.push(m);
    }
  }
  return Array.from(map.values());
}

// Default selection: all 6 models
export const DEFAULT_SELECTED_MODELS = [
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "gemini-2.5-flash-lite",
];

// Consensus synthesizer — fastest + tool-capable
// A dedicated synthesis model — not shown in the column UI, only used for Consensus.
// llama-3.3-70b-versatile: 128K context, streaming, excellent at summarisation.
export const CONSENSUS_MODEL = "llama-3.3-70b-versatile";
