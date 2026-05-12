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
  qualityMode?: QualityMode;
  consensusModel?: string;
  candidateModels?: string[];
  fallbackModels?: string[];
  moderatorModels?: string[];
  apiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaApiKey?: string;
  ollamaCloudBaseUrl?: string;
};

type ProviderKey = "gemini" | "ollama" | "ollama-cloud" | "groq";
type QualityMode = "quick" | "deep";
type CouncilRoundName = "opening" | "critique" | "convergence";
type CouncilRound = {
  id: CouncilRoundName;
  title: string;
  instruction: string;
};
type CouncilNote = {
  round: CouncilRoundName;
  roundTitle: string;
  modelId: string;
  alias: string;
  content: string;
};
type SendEvent = (event: Record<string, unknown>) => void;

class UpstreamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const MODEL_NAME_RULES = `Use only short model names such as Gemini 2.5, Gemma 4, Llama 4, Cogito, Nemotron, or GPT.
Never write "Model 1", "Model 2", or full model IDs.`;

const QUALITY_RUBRIC = `Use this quality rubric before deciding:
- Correctness: prefer answers that are factual, internally consistent, and honest about uncertainty.
- Completeness: include the parts needed to directly satisfy the user.
- Disagreement handling: call out meaningful conflicts between models instead of hiding them.
- Missing context: say what cannot be known from the provided answers.
- Final recommendation: give one clear answer, not a vote tally.`;

const QUICK_SECTIONS = `Output exactly these sections:
**Best answer**
**Why this is best**
**Confidence**
**Agreement**
**Disagreement**
**Model notes**`;

const DEEP_SECTIONS = `Output exactly these sections:
**Best answer**
**Why this is best**
**Confidence**
**Quality scorecard**
**Claim checks**
**Agreement**
**Disagreement**
**Missing context**
**Model notes**`;

function synthesisPrompt(mode: QualityMode): string {
  const deepInstruction =
    mode === "deep"
      ? `Deep answer mode is enabled. Claim-check the most important statements against only the supplied model answers, identify unsupported or conflicting claims, and explain why the winning answer won. Use the confidence section for a concise confidence label plus why.`
      : `Quick answer mode is enabled. Be concise, but still use the rubric and include a short confidence statement.`;

  return `You are a careful consensus synthesizer.
${MODEL_NAME_RULES}
Do not copy one model's full answer. Compare, summarize, decide, and explain the logic.
${QUALITY_RUBRIC}
${deepInstruction}

${mode === "deep" ? DEEP_SECTIONS : QUICK_SECTIONS}`;
}

function councilPositionPrompt(mode: QualityMode): string {
  const deepInstruction =
    mode === "deep"
      ? "Deep answer mode is enabled. Explicitly flag unsupported claims, weak assumptions, missing evidence, and confidence-impacting disagreements."
      : "Quick answer mode is enabled. Keep the note short while naming the most important strength and risk.";

  return `You are one member of a model council.
Use your short model name when referring to yourself.
Write visible public debate notes for the user. Do not include hidden chain-of-thought or private reasoning.
Keep notes concise and concrete. Name agreements and disagreements with short model names only.
Use the quality rubric: correctness, completeness, uncertainty, disagreements, missing context, and final recommendation.
${deepInstruction}
Do not produce the final answer alone.`;
}

function councilSynthesisPrompt(mode: QualityMode): string {
  const deepInstruction =
    mode === "deep"
      ? `Deep answer mode is enabled. Use the council notes to claim-check important statements, surface confidence, and explain why the final answer beat plausible alternatives.`
      : `Quick answer mode is enabled. Keep the final verdict concise while preserving meaningful uncertainty.`;

  return `You are the final moderator of a model council.
${MODEL_NAME_RULES}
Synthesize the council positions and the original model answers. Do not copy one model's full answer.
${QUALITY_RUBRIC}
${deepInstruction}

${mode === "deep" ? DEEP_SECTIONS : QUICK_SECTIONS}`;
}

function qualityModeFor(mode?: QualityMode): QualityMode {
  return mode === "deep" ? "deep" : "quick";
}

const COUNCIL_ROUNDS: CouncilRound[] = [
  {
    id: "opening",
    title: "Opening",
    instruction:
      "State which original answer is strongest, what it gets right, and what important point it misses.",
  },
  {
    id: "critique",
    title: "Critique",
    instruction:
      "Read the opening notes. Challenge weak assumptions, unsupported claims, or missing details from other models.",
  },
  {
    id: "convergence",
    title: "Convergence",
    instruction:
      "State what you now agree on, what remains disputed, and what the final answer should include.",
  },
];

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

function providerFor(modelId: string): ProviderKey {
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function createNdjsonResponse(handler: (send: SendEvent) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SendEvent = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        await handler(send);
      } catch (err: unknown) {
        send({ type: "error", message: errorMessage(err) });
      } finally {
        send({ type: "done" });
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

async function openStreamingUpstream(body: RequestBody, modelId: string, messages: ChatMessage[]) {
  const upstream = await fetchUpstream(body, modelId, messages, true);
  if (upstream.status !== 200) {
    if (upstream.status === 413) {
      throw new UpstreamError("Responses too large for consensus - try shorter conversations.", 413);
    }
    throw new UpstreamError(await readError(upstream, `${getModelAlias(modelId)} returned HTTP ${upstream.status}`), upstream.status);
  }
  if (!upstream.body) throw new UpstreamError("No upstream body", 502);

  return { upstream, provider: providerFor(modelId) };
}

async function pipeStreamingText(
  send: SendEvent,
  opened: Awaited<ReturnType<typeof openStreamingUpstream>>
) {
  const reader = opened.upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        if (opened.provider === "ollama" || opened.provider === "ollama-cloud") {
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
          }
          continue;
        }

        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        const json = JSON.parse(payload);
        if (opened.provider === "gemini") {
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
}

async function streamTextEvents(
  send: SendEvent,
  body: RequestBody,
  modelId: string,
  messages: ChatMessage[]
) {
  const opened = await openStreamingUpstream(body, modelId, messages);
  await pipeStreamingText(send, opened);
}

async function streamText(body: RequestBody, modelId: string, messages: ChatMessage[]): Promise<Response> {
  const opened = await openStreamingUpstream(body, modelId, messages);
  return createNdjsonResponse((send) => pipeStreamingText(send, opened));
}

function synthesisMessages(body: RequestBody): ChatMessage[] {
  return [
    { role: "system", content: synthesisPrompt(qualityModeFor(body.qualityMode)) },
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

function formatCouncilHistory(notes: CouncilNote[]): string {
  if (notes.length === 0) return "No previous council notes yet.";
  return notes
    .map((note) => `\n--- ${note.roundTitle} / ${note.alias} ---\n${note.content}`)
    .join("\n");
}

function sendCouncilStatus(
  send: SendEvent,
  modelId: string,
  status: "queued" | "running" | "done" | "failed" | "replaced",
  round?: CouncilRoundName | "synthesis",
  message?: string,
  replacementModelId?: string
) {
  send({
    type: "status",
    modelId,
    model: getModelAlias(modelId),
    status,
    round,
    message,
    replacementModelId,
    replacementModel: replacementModelId ? getModelAlias(replacementModelId) : undefined,
  });
}

async function generateCouncilNote(
  body: RequestBody,
  modelId: string,
  round: CouncilRound,
  baseBlock: string,
  notes: CouncilNote[]
): Promise<CouncilNote> {
  const alias = getModelAlias(modelId);
  const content = await generateText(body, modelId, [
    { role: "system", content: councilPositionPrompt(qualityModeFor(body.qualityMode)) },
    {
      role: "user",
      content:
        `You are ${alias}.\n\n` +
        `Round: ${round.title}\n` +
        `Your task: ${round.instruction}\n\n` +
        `${baseBlock}\n\n` +
        `Previous visible council notes:\n${formatCouncilHistory(notes)}\n\n` +
        `Respond as ${alias}. Start with "${alias}:". Keep it concise and user-visible.`,
    },
  ]);
  if (!content) throw new UpstreamError(`${alias} returned an empty council note.`, 502);
  return { round: round.id, roundTitle: round.title, modelId, alias, content };
}

function moderatorModelIds(body: RequestBody, participants: string[]): string[] {
  if (body.moderatorModels?.length) {
    return unique([...body.moderatorModels, ...participants]);
  }
  return unique([body.consensusModel, ...(body.fallbackModels ?? []), ...participants]);
}

async function runCouncil(body: RequestBody): Promise<Response> {
  const candidates = unique(body.candidateModels ?? []);
  const fallbacks = unique(body.fallbackModels ?? []);
  if (candidates.length < 2) throw new UpstreamError("Model council needs at least two available models.", 400);

  return createNdjsonResponse(async (send) => {
    const fallbackQueue = fallbacks.filter((id) => !candidates.includes(id));
    const usedModels = new Set(candidates);
    const allNotes: CouncilNote[] = [];
    const baseBlock = formatResponseBlock(body.prompt, body.responses);
    let participants = [...candidates];

    for (const candidate of participants) {
      sendCouncilStatus(send, candidate, "queued");
    }

    for (const round of COUNCIL_ROUNDS) {
      send({ type: "round_start", round: round.id, title: round.title });
      const settled = await Promise.allSettled(
        participants.map(async (modelId) => {
          sendCouncilStatus(send, modelId, "running", round.id);
          return generateCouncilNote(body, modelId, round, baseBlock, allNotes);
        })
      );
      const nextParticipants: string[] = [];

      for (let i = 0; i < settled.length; i += 1) {
        const modelId = participants[i];
        const result = settled[i];
        if (result.status === "fulfilled") {
          allNotes.push(result.value);
          nextParticipants.push(modelId);
          sendCouncilStatus(send, modelId, "done", round.id);
          send({
            type: "council_note",
            round: round.id,
            roundTitle: round.title,
            modelId,
            model: result.value.alias,
            text: result.value.content,
          });
          continue;
        }

        sendCouncilStatus(send, modelId, "failed", round.id, errorMessage(result.reason));
        let replacementNote: CouncilNote | null = null;

        while (fallbackQueue.length > 0 && !replacementNote) {
          const fallback = fallbackQueue.shift()!;
          if (usedModels.has(fallback)) continue;
          usedModels.add(fallback);
          sendCouncilStatus(send, modelId, "replaced", round.id, `Replaced by ${getModelAlias(fallback)}`, fallback);
          sendCouncilStatus(send, fallback, "running", round.id, `Replacing ${getModelAlias(modelId)}`);
          try {
            replacementNote = await generateCouncilNote(body, fallback, round, baseBlock, allNotes);
            allNotes.push(replacementNote);
            nextParticipants.push(fallback);
            sendCouncilStatus(send, fallback, "done", round.id);
            send({
              type: "council_note",
              round: round.id,
              roundTitle: round.title,
              modelId: fallback,
              model: replacementNote.alias,
              text: replacementNote.content,
            });
          } catch (err: unknown) {
            sendCouncilStatus(send, fallback, "failed", round.id, errorMessage(err));
          }
        }
      }

      participants = nextParticipants;
      if (participants.length < 2) {
        throw new UpstreamError("Model council needs at least two working models.", 502);
      }
    }

    const councilBlock = [
      baseBlock,
      "",
      "Visible council debate:",
      ...allNotes.map((note) => `\n--- ${note.roundTitle} / ${note.alias} ---\n${note.content}`),
    ].join("\n");

    send({ type: "round_start", round: "synthesis", title: "Final synthesis" });
    let lastError: UpstreamError | null = null;
    for (const modelId of moderatorModelIds(body, participants)) {
      try {
        sendCouncilStatus(send, modelId, "running", "synthesis", "Moderating final verdict");
        await streamTextEvents(send, body, modelId, [
          { role: "system", content: councilSynthesisPrompt(qualityModeFor(body.qualityMode)) },
          { role: "user", content: councilBlock },
        ]);
        sendCouncilStatus(send, modelId, "done", "synthesis", "Final verdict complete");
        return;
      } catch (err: unknown) {
        lastError = err instanceof UpstreamError ? err : new UpstreamError(errorMessage(err), 502);
        sendCouncilStatus(send, modelId, "failed", "synthesis", lastError.message);
      }
    }

    throw lastError ?? new UpstreamError("Model council synthesis failed.", 502);
  });
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
