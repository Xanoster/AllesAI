// 8 providers — all verified free on OpenRouter as of 2026-04-28.

export type ProviderKey =
  | "openai"
  | "google"
  | "meta"
  | "qwen"
  | "nvidia"
  | "inclusionai"
  | "nous"
  | "minimax";

export type ProviderInfo = {
  key: ProviderKey;
  name: string;
  color: string;      // brand tile bg
};

export const PROVIDERS: Record<ProviderKey, ProviderInfo> = {
  openai:      { key: "openai",      name: "OpenAI",       color: "#10a37f" },
  google:      { key: "google",      name: "Google",       color: "#4285f4" },
  meta:        { key: "meta",        name: "Meta",         color: "#0866ff" },
  qwen:        { key: "qwen",        name: "Qwen",         color: "#6e4fdb" },
  nvidia:      { key: "nvidia",      name: "NVIDIA",       color: "#76b900" },
  inclusionai: { key: "inclusionai", name: "InclusionAI",  color: "#e44d26" },
  nous:        { key: "nous",        name: "Nous Research", color: "#0d9488" },
  minimax:     { key: "minimax",     name: "MiniMax",      color: "#f23c50" },
};

export const PROVIDER_ORDER: ProviderKey[] = [
  "openai",
  "google",
  "meta",
  "qwen",
  "nvidia",
  "inclusionai",
  "nous",
  "minimax",
];
