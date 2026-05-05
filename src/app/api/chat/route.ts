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
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { model, messages, apiKey } = body;

  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing model or messages", { status: 400 });
  }

  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) {
    return new Response(
      "No API key. Add your Groq API key in Settings.",
      { status: 401 }
    );
  }

  const upstream = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
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

  // Transform Groq SSE -> NDJSON {type:"delta",text} / {type:"usage"} / {type:"done"}
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
              // ignore malformed keep-alive lines
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
