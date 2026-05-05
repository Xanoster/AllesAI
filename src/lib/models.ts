// Models catalog. A model can have multiple API routes, but the picker groups
// those routes under one model family so users do not select duplicates.

import {
  API_PROVIDER_ORDER,
  PROVIDER_ORDER,
  type ApiProviderKey,
  type ProviderKey,
} from "./providers";

export type ModelInfo = {
  id: string;
  label: string;
  shortLabel?: string;
  provider: ProviderKey;
  apiProvider: ApiProviderKey;
  familyId: string;
  free: true;
  context: number;
  category: string;
  vision?: boolean;
  thinking?: boolean;
  routeHint?: string;
  bestFor?: string;
  paramSize?: string;
};

export type ProviderGroup = {
  provider: ProviderKey;
  freeModel?: ModelInfo;
  paidModels: ModelInfo[];
};

export type ModelFamily = {
  familyId: string;
  label: string;
  shortLabel?: string;
  provider: ProviderKey;
  context: number;
  category: string;
  vision?: boolean;
  thinking?: boolean;
  routes: ModelInfo[];
};

export type CloudOllamaPreset = {
  name: string;
  label: string;
  shortLabel?: string;
  provider: ProviderKey;
  familyId: string;
  paramSize: string;
  bestFor: string;
  context: number;
  category: string;
  vision?: boolean;
  thinking?: boolean;
};

export const OLLAMA_MODEL_PREFIX = "ollama/";
export const CLOUD_OLLAMA_PREFIX = "ollama-cloud/";

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    shortLabel: "GPT-OSS 120B",
    provider: "openai",
    apiProvider: "groq",
    familyId: "gpt-oss-120b",
    free: true,
    context: 131072,
    category: "Reasoning",
    thinking: true,
    routeHint: "Groq hosted OpenAI open-weight model",
    bestFor: "Reasoning, agents",
    paramSize: "120B",
  },
  {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout 17B",
    shortLabel: "Llama 4 Scout",
    provider: "meta",
    apiProvider: "groq",
    familyId: "llama-4-scout-17b",
    free: true,
    context: 131072,
    category: "Vision",
    vision: true,
    routeHint: "Groq hosted Meta model",
    bestFor: "Fast multimodal chat",
    paramSize: "17B",
  },
  {
    id: "qwen/qwen3-32b",
    label: "Qwen3 32B",
    shortLabel: "Qwen3 32B",
    provider: "qwen",
    apiProvider: "groq",
    familyId: "qwen3-32b",
    free: true,
    context: 131072,
    category: "General",
    thinking: true,
    routeHint: "Groq hosted Qwen model",
    bestFor: "General reasoning",
    paramSize: "32B",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    shortLabel: "Gemini Flash Lite",
    provider: "gemini",
    apiProvider: "gemini",
    familyId: "gemini-2.5-flash-lite",
    free: true,
    context: 1048576,
    category: "General",
    vision: true,
    routeHint: "Google Gemini API",
    bestFor: "Long context, web search",
  },
];

// Pre-defined hosted Ollama models (ollama.com API). They are folded into the
// same family list as other routes when they refer to the same model.
export const PRESET_CLOUD_OLLAMA_MODELS: CloudOllamaPreset[] = [
  {
    name: "gpt-oss:120b",
    label: "GPT-OSS 120B",
    shortLabel: "GPT-OSS 120B",
    provider: "openai",
    familyId: "gpt-oss-120b",
    paramSize: "120B",
    bestFor: "Advanced reasoning",
    context: 131072,
    category: "Reasoning",
    thinking: true,
  },
  {
    name: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    shortLabel: "Gemini 3 Flash",
    provider: "gemini",
    familyId: "gemini-3-flash-preview",
    paramSize: "Preview",
    bestFor: "Fast frontier Q&A",
    context: 1048576,
    category: "General",
    vision: true,
    thinking: true,
  },
  {
    name: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    shortLabel: "DeepSeek V4",
    provider: "deepseek",
    familyId: "deepseek-v4-pro",
    paramSize: "Pro",
    bestFor: "Strong reasoning",
    context: 1048576,
    category: "Reasoning",
    thinking: true,
  },
  {
    name: "qwen3.5:397b",
    label: "Qwen3.5 397B",
    shortLabel: "Qwen3.5",
    provider: "qwen",
    familyId: "qwen3-5-397b",
    paramSize: "397B",
    bestFor: "Multimodal reasoning",
    context: 256000,
    category: "General",
    vision: true,
    thinking: true,
  },
  {
    name: "gemma4:31b",
    label: "Gemma 4 31B",
    shortLabel: "Gemma 4",
    provider: "gemini",
    familyId: "gemma4-31b",
    paramSize: "31B",
    bestFor: "Reasoning, general Q&A",
    context: 256000,
    category: "Reasoning",
    vision: true,
    thinking: true,
  },
];

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

export function getPresetCloudOllamaModelInfos(): ModelInfo[] {
  return PRESET_CLOUD_OLLAMA_MODELS.map(cloudPresetToModel);
}

export function getLocalOllamaModelInfo(modelName: string): ModelInfo {
  return ollamaNameToModel(modelName, "ollama-local");
}

export function getModel(id: string): ModelInfo | undefined {
  const catalogModel = MODEL_CATALOG.find((m) => m.id === id);
  if (catalogModel) return catalogModel;

  if (isOllamaModelId(id)) {
    return ollamaNameToModel(getOllamaModelName(id), "ollama-local");
  }

  if (isCloudOllamaModelId(id)) {
    const modelName = getCloudOllamaModelName(id);
    const preset = PRESET_CLOUD_OLLAMA_MODELS.find((model) => model.name === modelName);
    return preset ? cloudPresetToModel(preset) : ollamaNameToModel(modelName, "ollama-cloud");
  }

  return undefined;
}

export function getModelFamilyId(id: string): string {
  return getModel(id)?.familyId ?? id;
}

export function dedupeModelIdsByFamily(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const familyId = getModelFamilyId(id);
    if (seen.has(familyId)) continue;
    seen.add(familyId);
    next.push(id);
  }
  return next;
}

export function modelSupportsVision(id: string): boolean {
  return Boolean(getModel(id)?.vision);
}

export function buildModelFamilies(models: ModelInfo[]): ModelFamily[] {
  const map = new Map<string, ModelFamily>();

  for (const model of models) {
    const existing = map.get(model.familyId);
    if (!existing) {
      map.set(model.familyId, {
        familyId: model.familyId,
        label: model.label,
        shortLabel: model.shortLabel,
        provider: model.provider,
        context: model.context,
        category: model.category,
        vision: model.vision,
        thinking: model.thinking,
        routes: [model],
      });
      continue;
    }

    existing.context = Math.max(existing.context, model.context);
    existing.vision = existing.vision || model.vision;
    existing.thinking = existing.thinking || model.thinking;
    existing.routes.push(model);
    existing.routes.sort(compareModelRoutes);
  }

  return Array.from(map.values()).sort(compareFamilies);
}

export function getProviderGroups(): ProviderGroup[] {
  const map = new Map<ProviderKey, ProviderGroup>();
  for (const model of MODEL_CATALOG) {
    let group = map.get(model.provider);
    if (!group) {
      group = { provider: model.provider, paidModels: [] };
      map.set(model.provider, group);
    }
    if (model.free) {
      group.freeModel = model;
    } else {
      group.paidModels.push(model);
    }
  }
  return PROVIDER_ORDER.map((provider) => map.get(provider)).filter(Boolean) as ProviderGroup[];
}

// Default selection: broad, non-duplicated hosted API coverage. Local and
// Ollama API routes are opt-in.
export const DEFAULT_SELECTED_MODELS = [
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "gemini-2.5-flash-lite",
];

// Dedicated synthesis model - not shown as a comparison column by default.
export const CONSENSUS_MODEL = "llama-3.3-70b-versatile";

function cloudPresetToModel(preset: CloudOllamaPreset): ModelInfo {
  return {
    id: toCloudOllamaModelId(preset.name),
    label: preset.label,
    shortLabel: preset.shortLabel,
    provider: preset.provider,
    apiProvider: "ollama-cloud",
    familyId: preset.familyId,
    free: true,
    context: preset.context,
    category: preset.category,
    vision: preset.vision,
    thinking: preset.thinking,
    routeHint: "Ollama API",
    bestFor: preset.bestFor,
    paramSize: preset.paramSize,
  };
}

function ollamaNameToModel(modelName: string, apiProvider: ApiProviderKey): ModelInfo {
  const inferred = inferOllamaModel(modelName);
  const id =
    apiProvider === "ollama-cloud"
      ? toCloudOllamaModelId(modelName)
      : toOllamaModelId(modelName);

  return {
    id,
    label: inferred.label,
    shortLabel: inferred.shortLabel,
    provider: inferred.provider,
    apiProvider,
    familyId: inferred.familyId,
    free: true,
    context: inferred.context,
    category: apiProvider === "ollama-cloud" ? inferred.category : inferred.category || "Local",
    vision: inferred.vision,
    thinking: inferred.thinking,
    routeHint: apiProvider === "ollama-cloud" ? "Ollama API" : "Installed local Ollama model",
    bestFor: inferred.bestFor,
    paramSize: inferred.paramSize,
  };
}

function inferOllamaModel(modelName: string): Omit<ModelInfo, "id" | "apiProvider" | "free"> {
  const cleanName = stripLatestTag(modelName).trim();
  const lower = cleanName.toLowerCase();
  const size = extractParamSize(lower);

  if (lower.startsWith("gpt-oss")) {
    const paramSize = size ?? "Unknown";
    return {
      label: `GPT-OSS ${paramSize}`,
      shortLabel: `GPT-OSS ${paramSize}`,
      provider: "openai",
      familyId: `gpt-oss-${paramSize.toLowerCase()}`,
      context: 131072,
      category: "Reasoning",
      thinking: true,
      bestFor: "Reasoning, agents",
      paramSize,
    };
  }

  if (lower.startsWith("qwen3-coder")) {
    const paramSize = size ?? "Unknown";
    return {
      label: `Qwen3 Coder ${paramSize}`,
      shortLabel: "Qwen3 Coder",
      provider: "qwen",
      familyId: `qwen3-coder-${paramSize.toLowerCase()}`,
      context: 0,
      category: "Coding",
      thinking: true,
      bestFor: "Coding tasks",
      paramSize,
    };
  }

  if (lower.startsWith("qwen3-vl") || lower.includes("qwen2.5vl") || lower.includes("qwen2-vl")) {
    const paramSize = size ?? "Unknown";
    const series = lower.startsWith("qwen3-vl") ? "qwen3-vl" : "qwen-vl";
    const labelSeries = lower.startsWith("qwen3-vl") ? "Qwen3 VL" : "Qwen VL";
    return {
      label: `${labelSeries} ${paramSize}`,
      shortLabel: labelSeries,
      provider: "qwen",
      familyId: `${series}-${paramSize.toLowerCase()}`,
      context: 0,
      category: "Vision",
      vision: true,
      bestFor: "Vision-language",
      paramSize,
    };
  }

  if (lower.startsWith("qwen3.5")) {
    const paramSize = size ?? "Unknown";
    return {
      label: `Qwen3.5 ${paramSize}`,
      shortLabel: "Qwen3.5",
      provider: "qwen",
      familyId: `qwen3-5-${paramSize.toLowerCase()}`,
      context: 256000,
      category: "General",
      vision: true,
      thinking: true,
      bestFor: "Multimodal reasoning",
      paramSize,
    };
  }

  if (lower.startsWith("qwen3")) {
    const paramSize = size ?? "Unknown";
    return {
      label: `Qwen3 ${paramSize}`,
      shortLabel: `Qwen3 ${paramSize}`,
      provider: "qwen",
      familyId: `qwen3-${paramSize.toLowerCase()}`,
      context: 0,
      category: "General",
      thinking: true,
      bestFor: "General reasoning",
      paramSize,
    };
  }

  if (lower.startsWith("gemma4")) {
    const paramSize = size ?? "Unknown";
    return {
      label: `Gemma 4 ${paramSize}`,
      shortLabel: "Gemma 4",
      provider: "gemini",
      familyId: `gemma4-${paramSize.toLowerCase()}`,
      context: lower.includes("31b") || lower.includes("26b") ? 256000 : 128000,
      category: "Reasoning",
      vision: true,
      thinking: true,
      bestFor: "Reasoning, general Q&A",
      paramSize,
    };
  }

  if (lower.startsWith("deepseek")) {
    const label = humanizeModelName(cleanName).replace(/^Deepseek\b/, "DeepSeek");
    return {
      label,
      shortLabel: label,
      provider: "deepseek",
      familyId: normalizeFamilyId(cleanName),
      context: lower.includes("v4") ? 1048576 : 0,
      category: "Reasoning",
      thinking: true,
      bestFor: "Reasoning",
      paramSize: size ?? "Varies",
    };
  }

  if (lower.startsWith("gemma3")) {
    const paramSize = size ?? "Unknown";
    return {
      label: `Gemma 3 ${paramSize}`,
      shortLabel: "Gemma 3",
      provider: "gemini",
      familyId: `gemma3-${paramSize.toLowerCase()}`,
      context: 0,
      category: "Vision",
      vision: true,
      bestFor: "Vision, general",
      paramSize,
    };
  }

  if (lower.startsWith("glm-")) {
    return {
      label: humanizeModelName(cleanName, true),
      shortLabel: humanizeModelName(cleanName, true),
      provider: "zhipu",
      familyId: normalizeFamilyId(cleanName),
      context: 0,
      category: "Reasoning",
      thinking: true,
      bestFor: "Reasoning, code",
      paramSize: size ?? "Varies",
    };
  }

  if (lower.startsWith("minimax")) {
    return {
      label: humanizeModelName(cleanName, true),
      shortLabel: humanizeModelName(cleanName, true),
      provider: "minimax",
      familyId: normalizeFamilyId(cleanName),
      context: 0,
      category: "Productivity",
      bestFor: "Coding, productivity",
      paramSize: size ?? "Varies",
    };
  }

  if (lower.includes("llama")) {
    return {
      label: humanizeModelName(cleanName),
      shortLabel: humanizeModelName(cleanName),
      provider: "meta",
      familyId: normalizeFamilyId(cleanName),
      context: 0,
      category: isLikelyOllamaVisionModel(cleanName) ? "Vision" : "General",
      vision: isLikelyOllamaVisionModel(cleanName),
      paramSize: size,
    };
  }

  return {
    label: humanizeModelName(cleanName),
    shortLabel: humanizeModelName(cleanName),
    provider: "ollama",
    familyId: normalizeFamilyId(cleanName),
    context: 0,
    category: isLikelyOllamaVisionModel(cleanName) ? "Vision" : "Local",
    vision: isLikelyOllamaVisionModel(cleanName),
    paramSize: size,
  };
}

function compareModelRoutes(a: ModelInfo, b: ModelInfo) {
  return (
    API_PROVIDER_ORDER.indexOf(a.apiProvider) - API_PROVIDER_ORDER.indexOf(b.apiProvider) ||
    a.label.localeCompare(b.label)
  );
}

function compareFamilies(a: ModelFamily, b: ModelFamily) {
  return (
    PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider) ||
    a.label.localeCompare(b.label)
  );
}

function stripLatestTag(modelName: string): string {
  return modelName.replace(/:latest$/, "");
}

function normalizeFamilyId(modelName: string): string {
  return stripLatestTag(modelName)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\./g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractParamSize(modelName: string): string | undefined {
  const match = modelName.match(/(?::|-)(\d+(?:\.\d+)?b)\b/);
  return match?.[1]?.toUpperCase();
}

function humanizeModelName(modelName: string, keepCaps = false): string {
  const spaced = stripLatestTag(modelName)
    .replace(/[/:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (keepCaps) {
    return spaced
      .replace(/\bglm\b/gi, "GLM")
      .replace(/\bm2\.5\b/gi, "M2.5");
  }

  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
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
    "qwen3-vl",
  ].some((token) => name.includes(token));
}
