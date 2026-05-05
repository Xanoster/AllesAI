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
  apiKey?: string; // BYOK from client
  temperature?: number;

};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { model, messages, apiKey, temperature = 0.7 } = body;

  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing model or messages", { status: 400 });
  }

  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) {
    return new Response(
      "No API key. Add your OpenRouter key in Settings (BYOK).",
      { status: 401 }
    );
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": origin,
    "X-Title": "Alles AI",
  };

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
      stream_options: { include_usage: true },
    }),
  }).catch((err: unknown) => {
    return new Response(
      `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 }
    );
  });

  if (upstream instanceof Response && upstream.status !== 200) {
    return upstream;
  }
  const upstreamRes = upstream as Response;
  if (!upstreamRes.body) return new Response("No response body", { status: 502 });

  // Transform SSE -> NDJSON of {type:"delta",text} and {type:"usage",...} and {type:"done"}.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by blank lines; lines start with "data: "
          let idx: number;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              send({ type: "done" });
              continue;
            }
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                send({ type: "delta", text: delta });
              }
              if (json?.usage) {
                send({ type: "usage", usage: json.usage });
              }
              const finish = json?.choices?.[0]?.finish_reason;
              if (finish) send({ type: "finish", reason: finish });
            } catch {
              // ignore malformed lines (keep-alives etc.)
            }
          }
        }
      } catch (err: unknown) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
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
