// Models catalog - free cloud defaults plus optional local Ollama models.

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

export const OLLAMA_MODEL_PREFIX = "ollama/";
export const CLOUD_OLLAMA_PREFIX = "ollama-cloud/";

export function isOllamaModelId(id: string): boolean {
  return id.startsWith(OLLAMA_MODEL_PREFIX) && id.length > OLLAMA_MODEL_PREFIX.length;
}

export function isCloudOllamaModelId(id: string): boolean {
  return id.startsWith(CLOUD_OLLAMA_PREFIX) && id.length > CLOUD_OLLAMA_PREFIX.length;
}

export function toOllamaModelId(modelName: string): string {
  return `${OLLAMA_MODEL_PREFIX}${modelName}`;
}

export function toCloudOllamaModelId(modelName: string): string {
  return `${CLOUD_OLLAMA_PREFIX}${modelName}`;
}

export function getOllamaModelName(id: string): string {
  return id.slice(OLLAMA_MODEL_PREFIX.length);
}

export function getCloudOllamaModelName(id: string): string {
  return id.slice(CLOUD_OLLAMA_PREFIX.length);
}

function localModelLabel(modelName: string): string {
  return modelName.replace(/:latest$/, "");
}

function isLikelyOllamaVisionModel(modelName: string): boolean {
  const name = modelName.toLowerCase();
  return [
    "bakllava",
    "gemma3",
    "granite3.2-vision",
    "llava",
    "minicpm-v",
    "moondream",
    "qwen2.5vl",
    "qwen2-vl",
  ].some((token) => name.includes(token));
}

export function getModel(id: string): ModelInfo | undefined {
  const catalogModel = MODEL_CATALOG.find((m) => m.id === id);
  if (catalogModel) return catalogModel;

  if (isOllamaModelId(id)) {
    const modelName = getOllamaModelName(id);
    const label = localModelLabel(modelName);
    return {
      id,
      label,
      shortLabel: label.split("/").pop() ?? label,
      provider: "ollama",
      free: true,
      context: 0,
      category: "Local",
      vision: isLikelyOllamaVisionModel(modelName),
    };
  }

  if (isCloudOllamaModelId(id)) {
    const modelName = getCloudOllamaModelName(id);
    const label = localModelLabel(modelName);
    return {
      id,
      label,
      shortLabel: label.split("/").pop() ?? label,
      provider: "ollama",
      free: true,
      context: 0,
      category: "Cloud",
      vision: isLikelyOllamaVisionModel(modelName),
    };
  }

  return undefined;
}

export function modelSupportsVision(id: string): boolean {
  return Boolean(getModel(id)?.vision);
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

// Default selection: all cloud models. Local models are opt-in.
export const DEFAULT_SELECTED_MODELS = [
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "gemini-2.5-flash-lite",
];

// Dedicated synthesis model - not shown in the column UI, only used for Consensus.
// llama-3.3-70b-versatile: 128K context, streaming, excellent at summarisation.
export const CONSENSUS_MODEL = "llama-3.3-70b-versatile";

// Pre-defined cloud Ollama models (ollama.com hosted).
// Shown in the Cloud section of the model picker — always available, no Refresh needed.
// Local Ollama models are fetched dynamically from localhost and shown separately.
export const PRESET_CLOUD_OLLAMA_MODELS: Array<{ name: string; paramSize: string; bestFor: string }> = [
  { name: "gpt-oss:20b",      paramSize: "20B",    bestFor: "Reasoning, agents" },
  { name: "gpt-oss:120b",     paramSize: "120B",   bestFor: "Advanced reasoning" },
  { name: "qwen3-coder:480b", paramSize: "480B",   bestFor: "Coding tasks" },
  { name: "qwen3-vl:235b",    paramSize: "235B",   bestFor: "Vision-language" },
  { name: "glm-4.6",          paramSize: "Varies", bestFor: "Reasoning, code" },
  { name: "minimax-m2.5",     paramSize: "Varies", bestFor: "Coding, productivity" },
  { name: "gemma3:27b",       paramSize: "27B",    bestFor: "Vision, general" },
];
