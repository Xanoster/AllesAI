import { NextRequest } from "next/server";

export const runtime = "edge";

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type ResponseEntry = { model: string; content: string };

type RequestBody = {
  prompt: string;
  responses: ResponseEntry[];
  consensusModel: string;
  fallbackConsensusModel?: string;
  apiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
};

const SYSTEM_PROMPT = `You are an expert synthesizer. You will be given a user's question and several answers from different AI models.
Your job:
1. Identify the points where the models agree (the consensus).
2. Note where they disagree, and judge which is correct based on reasoning and known facts.
3. Produce a single best, well-organized answer that combines the strongest points.
4. Be concise. Use bullet points or short paragraphs. Do not invent facts that none of the models stated unless correcting an obvious error.
Format:
**Consensus**: <one-paragraph summary>
**Best answer**: <the synthesized final answer>
**Disagreements** (only if any): <bullet list>`;

const OLLAMA_PREFIX = "ollama/";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

function resolveOllamaBaseUrl(raw?: string) {
  const input = (raw || DEFAULT_OLLAMA_BASE_URL).trim();
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { prompt, responses, apiKey, geminiApiKey } = body;
  let { consensusModel } = body;
  if (!prompt || !Array.isArray(responses) || responses.length === 0 || !consensusModel) {
    return new Response("Missing prompt, responses, or consensusModel", { status: 400 });
  }

  // Resolve provider URL and key from model name
  const fallbackModel = body.fallbackConsensusModel;
  const wantsGroq = !consensusModel.startsWith("gemini") && !consensusModel.startsWith(OLLAMA_PREFIX);
  const hasGroqKey = Boolean(apiKey || process.env.GROQ_API_KEY);
  if (wantsGroq && !hasGroqKey && fallbackModel?.startsWith(OLLAMA_PREFIX)) {
    consensusModel = fallbackModel;
  }

  const isGemini = consensusModel.startsWith("gemini");
  const isOllama = consensusModel.startsWith(OLLAMA_PREFIX);

  const upstreamUrl = GROQ_URL;
  let key: string | undefined;
  if (isGemini) {
    key = geminiApiKey || process.env.GEMINI_API_KEY;
  } else if (!isOllama) {
    key = apiKey || process.env.GROQ_API_KEY;
  }

  if (!isOllama && !key) {
    const providerName = isGemini ? "Gemini" : "Groq";
    return new Response(`No API key. Add your ${providerName} API key in Settings.`, { status: 401 });
  }

  // Truncate each response - keep total under ~80K chars
  const MAX_PER_RESPONSE = Math.floor(80000 / responses.length);
  const truncated = responses.map((r) => ({
    ...r,
    content: r.content.length > MAX_PER_RESPONSE
      ? r.content.slice(0, MAX_PER_RESPONSE) + "\n...[truncated]"
      : r.content,
  }));

  const userBlock = [
    `User's question:\n${prompt}`,
    "",
    "Model answers:",
    ...truncated.map(
      (r, i) => `\n--- Model ${i + 1} (${r.model}) ---\n${r.content || "(empty)"}`
    ),
  ].join("\n");

  const encoder = new TextEncoder();

  if (isOllama) {
    const baseUrl = resolveOllamaBaseUrl(body.ollamaBaseUrl);
    if (!baseUrl) return new Response("Invalid Ollama base URL.", { status: 400 });

    const ollamaModel = consensusModel.slice(OLLAMA_PREFIX.length);
    if (!ollamaModel) return new Response("Missing Ollama model name.", { status: 400 });

    const upstream = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userBlock },
        ],
      }),
    }).catch((err: unknown) => {
      return new Response(
        `Ollama is not reachable at ${baseUrl}. ${err instanceof Error ? err.message : String(err)}`,
        { status: 502 }
      );
    });

    if (upstream instanceof Response && upstream.status !== 200) {
      const errBody = await upstream.text().catch(() => `HTTP ${upstream.status}`);
      return new Response(errBody || `Ollama returned HTTP ${upstream.status}`, { status: upstream.status });
    }
    if (!(upstream instanceof Response) || !upstream.body) return new Response("No upstream body", { status: 502 });

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
                type OllamaChunk = {
                  message?: { content?: string };
                  done?: boolean;
                  done_reason?: string;
                };
                const json = JSON.parse(line) as OllamaChunk;
                const delta = json.message?.content;
                if (typeof delta === "string" && delta.length > 0) send({ type: "delta", text: delta });
                if (json.done) {
                  if (json.done_reason) send({ type: "finish", reason: json.done_reason });
                  send({ type: "done" });
                  doneSent = true;
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
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
    });
  }

  // Gemini native API path.
  if (isGemini) {
    const geminiKey = key;
    if (!geminiKey) return new Response("No API key. Add your Gemini API key in Settings.", { status: 401 });

    const geminiUrl = `${GEMINI_BASE}/${consensusModel}:streamGenerateContent?alt=sse`;
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userBlock }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    }).catch((err: unknown) => {
      return new Response(`Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
    });

    if (upstream instanceof Response && upstream.status !== 200) {
      const errBody = await upstream.text().catch(() => `HTTP ${upstream.status}`);
      return new Response(errBody, { status: upstream.status });
    }
    if (!(upstream instanceof Response) || !upstream.body) return new Response("No upstream body", { status: 502 });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = (upstream as Response).body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
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
              if (!line || !line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                type GeminiChunk = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
                const json = JSON.parse(payload) as GeminiChunk;
                const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (typeof text === "string" && text.length > 0) send({ type: "delta", text });
              } catch { /* ignore */ }
            }
          }
        } catch (err: unknown) {
          send({ type: "error", message: err instanceof Error ? err.message : String(err) });
        } finally {
          send({ type: "done" });
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  }

  // OpenAI-compatible path (Groq).
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: consensusModel,
      temperature: 0.3,
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userBlock },
      ],
    }),
  }).catch((err: unknown) => {
    return new Response(`Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  });

  if (upstream instanceof Response && upstream.status !== 200) {
    const errBody = await upstream.text().catch(() => `HTTP ${upstream.status}`);
    if (upstream.status === 413) return new Response("Responses too large for consensus - try shorter conversations.", { status: 413 });
    return new Response(errBody, { status: upstream.status });
  }
  if (!(upstream instanceof Response) || !upstream.body) {
    return new Response("No upstream body", { status: 502 });
  }

  // Re-emit as NDJSON identical to /api/chat for client reuse
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line || !line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              send({ type: "done" });
              continue;
            }
            try {
              const json = JSON.parse(data);
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (delta) send({ type: "delta", text: delta });
              if (json.usage) send({ type: "usage", usage: json.usage });
              const finish = json.choices?.[0]?.finish_reason;
              if (finish) send({ type: "finish", reason: finish });
            } catch {
              // skip malformed
            }
          }
        }
      } catch (err: unknown) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
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
    },
  });
}
