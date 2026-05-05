import { NextRequest } from "next/server";

export const runtime = "edge";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ResponseEntry = { model: string; content: string };

type RequestBody = {
  prompt: string;
  responses: ResponseEntry[];
  consensusModel: string;
  apiKey?: string;
  useOllama?: boolean;
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

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { prompt, responses, consensusModel, apiKey, useOllama, ollamaBaseUrl } = body;
  if (!prompt || !Array.isArray(responses) || responses.length === 0 || !consensusModel) {
    return new Response("Missing prompt, responses, or consensusModel", { status: 400 });
  }

  const isOllama = !!useOllama;
  const url = isOllama
    ? `${(ollamaBaseUrl ?? "http://localhost:11434/v1").replace(/\/$/, "")}/chat/completions`
    : OPENROUTER_URL;

  const key = apiKey || (isOllama ? "ollama" : process.env.OPENROUTER_API_KEY);
  if (!key && !isOllama) {
    return new Response("No API key. Add your OpenRouter key in Settings.", { status: 401 });
  }

  const userBlock = [
    `User's question:\n${prompt}`,
    "",
    "Model answers:",
    ...responses.map(
      (r, i) => `\n--- Model ${i + 1} (${r.model}) ---\n${r.content || "(empty)"}`
    ),
  ].join("\n");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key ?? "ollama"}`,
  };
  if (!isOllama) {
    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    headers["HTTP-Referer"] = origin;
    headers["X-Title"] = "Alles AI";
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: consensusModel,
      temperature: 0.3,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userBlock },
      ],
      ...(isOllama ? {} : { stream_options: { include_usage: true } }),
    }),
  }).catch((err: unknown) => {
    return new Response(
      `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 }
    );
  });

  if (upstream instanceof Response && !upstream.ok && !upstream.body) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }
  if (!(upstream instanceof Response) || !upstream.body) {
    return new Response("No upstream body", { status: 502 });
  }

  // Re-emit as NDJSON identical to /api/chat for client reuse
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        controller.close();
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || !line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "delta", text: delta }) + "\n")
            );
          }
          if (json.usage) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "usage", usage: json.usage }) + "\n")
            );
          }
        } catch {
          // skip malformed
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
