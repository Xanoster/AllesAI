import { NextRequest } from "next/server";

export const runtime = "edge";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

type RequestBody = {
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  geminiApiKey?: string;
  webSearch?: boolean;
};

const GROQ_URL    = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Convert OpenAI-style messages to Gemini native format
function toGeminiBody(messages: ChatMessage[], webSearch?: boolean) {
  const systemParts: Array<{ text: string }> = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      const text = typeof m.content === "string" ? m.content : m.content.map(p => p.type === "text" ? p.text : "").join("");
      if (text) systemParts.push({ text });
    } else {
      const role = m.role === "assistant" ? "model" : "user";
      const parts: Array<{ text: string }> =
        typeof m.content === "string"
          ? [{ text: m.content }]
          : m.content.map((p) => ({ text: p.type === "text" ? p.text : "" })).filter((p) => p.text);
      if (parts.length > 0) contents.push({ role, parts });
    }
  }

  return {
    ...(systemParts.length > 0 ? { system_instruction: { parts: systemParts } } : {}),
    contents,
    generationConfig: { temperature: 0.7 },
    ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
  };
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { model, messages } = body;

  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing model or messages", { status: 400 });
  }

  // ── Gemini native API path ──────────────────────────────────────────────
  if (model.startsWith("gemini")) {
    const key = body.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!key) return new Response("No API key. Add your Gemini API key in Settings.", { status: 401 });

    const geminiUrl = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`;
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(toGeminiBody(messages, body.webSearch)),
    }).catch((err: unknown) => {
      return new Response(`Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
    });

    if (upstream instanceof Response && upstream.status !== 200) {
      const errBody = await upstream.text().catch(() => `HTTP ${upstream.status}`);
      return new Response(errBody, { status: upstream.status });
    }
    const upstreamRes = upstream as Response;
    if (!upstreamRes.body) return new Response("No response body", { status: 502 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstreamRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

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
              if (!payload || payload === "[DONE]") continue;
              try {
                type GeminiChunk = {
                  candidates?: Array<{
                    content?: { parts?: Array<{ text?: string }> };
                    finishReason?: string;
                    groundingMetadata?: {
                      webSearchQueries?: string[];
                      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
                    };
                  }>;
                };
                const json = JSON.parse(payload) as GeminiChunk;
                const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (typeof text === "string" && text.length > 0) send({ type: "delta", text });
                const finish = json?.candidates?.[0]?.finishReason;
                if (finish && finish !== "STOP") send({ type: "finish", reason: finish });
                const gm = json?.candidates?.[0]?.groundingMetadata;
                if (gm) {
                  const queries = gm.webSearchQueries ?? [];
                  const sources = (gm.groundingChunks ?? [])
                    .filter((c) => c.web?.uri)
                    .map((c) => ({ title: c.web!.title ?? c.web!.uri!, uri: c.web!.uri! }));
                  if (queries.length > 0 || sources.length > 0) {
                    send({ type: "grounding", queries, sources });
                  }
                }
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
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── OpenAI-compatible path (Groq only) ────────────────────────────────────────────────
  const key = body.apiKey || process.env.GROQ_API_KEY;

  if (!key) {
    return new Response("No API key. Add your Groq API key in Settings.", { status: 401 });
  }

  // Strip internal "groq/" namespace prefix → actual Groq API model name
  const groqModelId = model.replace(/^groq\//, "");

  const upstream = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: groqModelId, messages, stream: true }),
  }).catch((err: unknown) => {
    return new Response(`Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  });

  if (upstream instanceof Response && upstream.status !== 200) {
    const errBody = await upstream.text().catch(() => `HTTP ${upstream.status}`);
    return new Response(errBody, { status: upstream.status });
  }
  const upstreamRes = upstream as Response;
  if (!upstreamRes.body) return new Response("No response body", { status: 502 });

  // Streaming SSE → NDJSON
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

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
            if (payload === "[DONE]") { send({ type: "done" }); continue; }
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) send({ type: "delta", text: delta });
              if (json?.usage) send({ type: "usage", usage: json.usage });
              const finish = json?.choices?.[0]?.finish_reason;
              if (finish) send({ type: "finish", reason: finish });
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
