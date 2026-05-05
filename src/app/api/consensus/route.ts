import { NextRequest } from "next/server";
import { getModelAlias } from "@/lib/model-rules";

export const runtime = "edge";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OLLAMA_PREFIX = "ollama/";
const CLOUD_OLLAMA_PREFIX = "ollama-cloud/";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_CLOUD_OLLAMA_BASE_URL = "https://ollama.com";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ResponseEntry = {
  model: string;
  content: string;
};

type RequestBody = {
  prompt: string;
  responses: ResponseEntry[];
  mode?: "single" | "council";
  consensusModel?: string;
  candidateModels?: string[];
  fallbackModels?: string[];
  apiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaApiKey?: string;
  ollamaCloudBaseUrl?: string;
};

class UpstreamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const SYNTHESIS_PROMPT = `You are a careful consensus synthesizer.
Use only short model names such as Gemini 2.5, Gemma 4, Llama 4, Cogito, Nemotron, or GPT.
Never write "Model 1", "Model 2", or full model IDs.
Do not copy one model's full answer. Compare, summarize, decide, and explain the logic.

Output exactly these sections:
**Best answer**
**Why this is best**
**Agreement**
**Disagreement**
**Model notes**`;

const COUNCIL_POSITION_PROMPT = `You are one member of a model council.
Use your short model name when referring to yourself.
Give a concise position: strongest answer, weak points, disagreements, and what the final synthesis should say.
Do not produce the final answer alone.`;

const COUNCIL_SYNTHESIS_PROMPT = `You are the final moderator of a model council.
Use only short model names such as Gemini 2.5, Gemma 4, Llama 4, Cogito, Nemotron, or GPT.
Never write "Model 1", "Model 2", or full model IDs.
Synthesize the council positions and the original model answers. Do not copy one model's full answer.

Output exactly these sections:
**Best answer**
**Why this is best**
**Agreement**
**Disagreement**
**Model notes**`;

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function resolveOllamaBaseUrl(raw?: string) {
  const input = (raw || DEFAULT_OLLAMA_BASE_URL).trim();
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function providerFor(modelId: string): "gemini" | "ollama" | "ollama-cloud" | "groq" {
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith(CLOUD_OLLAMA_PREFIX)) return "ollama-cloud";
  if (modelId.startsWith(OLLAMA_PREFIX)) return "ollama";
  return "groq";
}

function modelNameForProvider(modelId: string): string {
  if (modelId.startsWith(CLOUD_OLLAMA_PREFIX)) return modelId.slice(CLOUD_OLLAMA_PREFIX.length);
  if (modelId.startsWith(OLLAMA_PREFIX)) return modelId.slice(OLLAMA_PREFIX.length);
  return modelId.replace(/^groq\//, "");
}

function keyFor(body: RequestBody, modelId: string): string | undefined {
  const provider = providerFor(modelId);
  if (provider === "gemini") return body.geminiApiKey || process.env.GEMINI_API_KEY;
  if (provider === "groq") return body.apiKey || process.env.GROQ_API_KEY;
  return body.ollamaApiKey || process.env.OLLAMA_API_KEY;
}

function shortResponses(responses: ResponseEntry[]): ResponseEntry[] {
  return responses.map((response) => ({
    ...response,
    model: getModelAlias(response.model),
  }));
}

function truncateResponses(responses: ResponseEntry[]): ResponseEntry[] {
  const maxTotalChars = 500000;
  const maxPerResponse = Math.max(1, Math.floor(maxTotalChars / Math.max(1, responses.length)));
  return responses.map((response) => ({
    ...response,
    content:
      response.content.length > maxPerResponse
        ? response.content.slice(0, maxPerResponse) + "\n...[truncated]"
        : response.content,
  }));
}

function formatResponseBlock(prompt: string, responses: ResponseEntry[]): string {
  return [
    `User question:\n${prompt}`,
    "",
    "Model answers:",
    ...truncateResponses(shortResponses(responses)).map(
      (response) => `\n--- ${response.model} ---\n${response.content || "(empty)"}`
    ),
  ].join("\n");
}

function toGeminiBody(messages: ChatMessage[]) {
  const systemParts: Array<{ text: string }> = [];
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content) systemParts.push({ text: message.content });
    } else {
      contents.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      });
    }
  }

  return {
    ...(systemParts.length > 0 ? { system_instruction: { parts: systemParts } } : {}),
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  };
}

async function readError(upstream: Response, fallback: string): Promise<string> {
  const raw = await upstream.text().catch(() => fallback);
  if (!raw) return fallback;
  try {
    const json = JSON.parse(raw);
    if (typeof json?.error === "string") return json.error;
    if (typeof json?.error?.message === "string") return json.error.message;
    if (typeof json?.message === "string") return json.message;
  } catch {
    // keep raw text
  }
  return raw;
}

async function fetchUpstream(body: RequestBody, modelId: string, messages: ChatMessage[], stream: boolean) {
  const provider = providerFor(modelId);
  const model = modelNameForProvider(modelId);

  if (provider === "gemini") {
    const key = keyFor(body, modelId);
    if (!key) throw new UpstreamError("No API key. Add your Gemini API key in Settings.", 401);
    const endpoint = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return fetch(`${GEMINI_BASE}/${model}:${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(toGeminiBody(messages)),
    }).catch((err: unknown) => {
      throw new UpstreamError(`Gemini API is unreachable. ${err instanceof Error ? err.message : String(err)}`, 502);
    });
  }

  if (provider === "ollama" || provider === "ollama-cloud") {
    const baseUrl = resolveOllamaBaseUrl(
      provider === "ollama-cloud"
        ? body.ollamaCloudBaseUrl || DEFAULT_CLOUD_OLLAMA_BASE_URL
        : body.ollamaBaseUrl
    );
    if (!baseUrl) {
      throw new UpstreamError(provider === "ollama-cloud" ? "Invalid Ollama API base URL." : "Invalid Ollama base URL.", 400);
    }

    const key = keyFor(body, modelId);
    if (provider === "ollama-cloud" && !key) {
      throw new UpstreamError("No Ollama API key. Add OLLAMA_API_KEY to .env.local or Settings.", 401);
    }

    return fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ model, messages, stream }),
    }).catch((err: unknown) => {
      throw new UpstreamError(`${provider === "ollama-cloud" ? "Ollama API" : "Ollama"} is unreachable. ${err instanceof Error ? err.message : String(err)}`, 502);
    });
  }

  const key = keyFor(body, modelId);
  if (!key) throw new UpstreamError("No API key. Add your Groq API key in Settings.", 401);
  return fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: stream ? 4096 : 1200,
      stream,
    }),
  }).catch((err: unknown) => {
    throw new UpstreamError(`Groq API is unreachable. ${err instanceof Error ? err.message : String(err)}`, 502);
  });
}

async function generateText(body: RequestBody, modelId: string, messages: ChatMessage[]): Promise<string> {
  const upstream = await fetchUpstream(body, modelId, messages, false);
  if (upstream.status !== 200) {
    throw new UpstreamError(await readError(upstream, `${getModelAlias(modelId)} returned HTTP ${upstream.status}`), upstream.status);
  }

  const provider = providerFor(modelId);
  const json = await upstream.json().catch(() => ({}));
  if (provider === "gemini") {
    return (json?.candidates?.[0]?.content?.parts ?? [])
      .map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();
  }
  if (provider === "ollama" || provider === "ollama-cloud") {
    return String(json?.message?.content ?? "").trim();
  }
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

async function streamText(body: RequestBody, modelId: string, messages: ChatMessage[]): Promise<Response> {
  const upstream = await fetchUpstream(body, modelId, messages, true);
  if (upstream.status !== 200) {
    if (upstream.status === 413) {
      throw new UpstreamError("Responses too large for consensus - try shorter conversations.", 413);
    }
    throw new UpstreamError(await readError(upstream, `${getModelAlias(modelId)} returned HTTP ${upstream.status}`), upstream.status);
  }
  if (!upstream.body) throw new UpstreamError("No upstream body", 502);

  const provider = providerFor(modelId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneSent = false;
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;

            try {
              if (provider === "ollama" || provider === "ollama-cloud") {
                const json = JSON.parse(line) as {
                  message?: { content?: string };
                  done?: boolean;
                  done_reason?: string;
                  prompt_eval_count?: number;
                  eval_count?: number;
                };
                const delta = json.message?.content;
                if (delta) send({ type: "delta", text: delta });
                if (json.done) {
                  if (typeof json.prompt_eval_count === "number" || typeof json.eval_count === "number") {
                    send({ type: "usage", usage: { prompt_tokens: json.prompt_eval_count, completion_tokens: json.eval_count } });
                  }
                  if (json.done_reason) send({ type: "finish", reason: json.done_reason });
                  send({ type: "done" });
                  doneSent = true;
                }
                continue;
              }

              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              if (payload === "[DONE]") {
                send({ type: "done" });
                doneSent = true;
                continue;
              }

              const json = JSON.parse(payload);
              if (provider === "gemini") {
                const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) send({ type: "delta", text });
              } else {
                const delta = json?.choices?.[0]?.delta?.content;
                if (delta) send({ type: "delta", text: delta });
                if (json?.usage) send({ type: "usage", usage: json.usage });
                const finish = json?.choices?.[0]?.finish_reason;
                if (finish) send({ type: "finish", reason: finish });
              }
            } catch {
              // ignore malformed stream lines
            }
          }
        }
      } catch (err: unknown) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!doneSent) send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function synthesisMessages(body: RequestBody): ChatMessage[] {
  return [
    { role: "system", content: SYNTHESIS_PROMPT },
    { role: "user", content: formatResponseBlock(body.prompt, body.responses) },
  ];
}

async function runSingle(body: RequestBody): Promise<Response> {
  const models = unique([body.consensusModel, ...(body.fallbackModels ?? [])]);
  if (models.length === 0) throw new UpstreamError("Missing consensusModel", 400);

  let lastError: UpstreamError | null = null;
  for (const model of models) {
    try {
      return await streamText(body, model, synthesisMessages(body));
    } catch (err) {
      lastError = err instanceof UpstreamError ? err : new UpstreamError(err instanceof Error ? err.message : String(err), 502);
    }
  }

  throw lastError ?? new UpstreamError("Consensus failed.", 502);
}

async function runCouncil(body: RequestBody): Promise<Response> {
  const candidates = unique(body.candidateModels ?? []);
  const fallbacks = unique(body.fallbackModels ?? []);
  if (candidates.length < 2) throw new UpstreamError("Model council needs at least two available models.", 400);

  const fallbackQueue = [...fallbacks];
  const notes: Array<{ modelId: string; alias: string; content: string }> = [];
  const baseBlock = formatResponseBlock(body.prompt, body.responses);

  async function tryPosition(modelId: string) {
    const alias = getModelAlias(modelId);
    const content = await generateText(body, modelId, [
      { role: "system", content: COUNCIL_POSITION_PROMPT },
      {
        role: "user",
        content:
          `You are ${alias}.\n\n${baseBlock}\n\n` +
          `Respond as ${alias}. Keep it concise and name agreements/disagreements using short model names only.`,
      },
    ]);
    if (!content) throw new UpstreamError(`${alias} returned an empty council note.`, 502);
    return { modelId, alias, content };
  }

  for (const candidate of candidates) {
    try {
      notes.push(await tryPosition(candidate));
      continue;
    } catch {
      // Replace failed council member with the next fallback, if any.
    }

    while (fallbackQueue.length > 0) {
      const fallback = fallbackQueue.shift()!;
      if (notes.some((note) => note.modelId === fallback) || candidates.includes(fallback)) continue;
      try {
        notes.push(await tryPosition(fallback));
        break;
      } catch {
        // Try the next fallback.
      }
    }
  }

  if (notes.length < 2) {
    throw new UpstreamError("Model council needs at least two working models.", 502);
  }

  const councilBlock = [
    baseBlock,
    "",
    "Council positions:",
    ...notes.map((note) => `\n--- ${note.alias} ---\n${note.content}`),
  ].join("\n");

  let lastError: UpstreamError | null = null;
  for (const note of notes) {
    try {
      return await streamText(body, note.modelId, [
        { role: "system", content: COUNCIL_SYNTHESIS_PROMPT },
        { role: "user", content: councilBlock },
      ]);
    } catch (err) {
      lastError = err instanceof UpstreamError ? err : new UpstreamError(err instanceof Error ? err.message : String(err), 502);
    }
  }

  throw lastError ?? new UpstreamError("Model council synthesis failed.", 502);
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.prompt || !Array.isArray(body.responses) || body.responses.length === 0) {
    return new Response("Missing prompt or responses", { status: 400 });
  }

  try {
    return body.mode === "council" ? await runCouncil(body) : await runSingle(body);
  } catch (err) {
    const error = err instanceof UpstreamError ? err : new UpstreamError(err instanceof Error ? err.message : String(err), 502);
    return new Response(error.message, { status: error.status });
  }
}
