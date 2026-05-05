export type ProviderKey =
  | "openai"
  | "google"
  | "meta"
  | "qwen"
  | "nvidia";

export type ProviderInfo = {
  key: ProviderKey;
  name: string;
  color: string;
};

export const PROVIDERS: Record<ProviderKey, ProviderInfo> = {
  openai: { key: "openai", name: "OpenAI", color: "#10a37f" },
  google: { key: "google", name: "Google", color: "#4285f4" },
  meta:   { key: "meta",   name: "Meta",   color: "#0082fb" },
  qwen:   { key: "qwen",   name: "Qwen",   color: "#6750a4" },
  nvidia: { key: "nvidia", name: "NVIDIA", color: "#76b900" },
};

export const PROVIDER_ORDER: ProviderKey[] = [
  "openai",
  "google",
  "meta",
  "qwen",
  "nvidia",
];
