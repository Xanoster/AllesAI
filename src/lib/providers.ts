export type ProviderKey =
  | "openai"
  | "meta"
  | "qwen"
  | "gemini";

export type ProviderInfo = {
  key: ProviderKey;
  name: string;
  color: string;
};

export const PROVIDERS: Record<ProviderKey, ProviderInfo> = {
  openai:   { key: "openai",   name: "OpenAI",   color: "#10a37f" },
  meta:     { key: "meta",     name: "Meta",     color: "#0082fb" },
  qwen:     { key: "qwen",     name: "Qwen",     color: "#6750a4" },
  gemini:   { key: "gemini",   name: "Google",   color: "#1a73e8" },
};

export const PROVIDER_ORDER: ProviderKey[] = [
  "openai",
  "meta",
  "qwen",
  "gemini",
];
