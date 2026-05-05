export type ProviderKey =
  | "openai"
  | "meta"
  | "qwen"
  | "groq";

export type ProviderInfo = {
  key: ProviderKey;
  name: string;
  color: string;
};

export const PROVIDERS: Record<ProviderKey, ProviderInfo> = {
  openai: { key: "openai", name: "OpenAI",  color: "#10a37f" },
  meta:   { key: "meta",   name: "Meta",    color: "#0082fb" },
  qwen:   { key: "qwen",   name: "Qwen",    color: "#6750a4" },
  groq:   { key: "groq",   name: "Groq",    color: "#f55036" },
};

export const PROVIDER_ORDER: ProviderKey[] = [
  "openai",
  "meta",
  "qwen",
  "groq",
];
