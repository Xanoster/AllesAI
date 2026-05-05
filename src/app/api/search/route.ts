import { NextRequest } from "next/server";

export const runtime = "edge";

type RequestBody = {
  query?: string;
  apiKey?: string;
  searchEngineId?: string;
};

type GoogleSearchResponse = {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    displayLink?: string;
  }>;
  error?: {
    message?: string;
  };
};

function getEnvSearchKey() {
  return process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || "";
}

function getEnvSearchEngineId() {
  return (
    process.env.GOOGLE_CSE_ID ||
    process.env.GOOGLE_SEARCH_ENGINE_ID ||
    process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID ||
    ""
  );
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return Response.json({ error: "Missing search query." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || getEnvSearchKey();
  const searchEngineId = body.searchEngineId?.trim() || getEnvSearchEngineId();

  if (!apiKey || !searchEngineId) {
    return Response.json(
      {
        error:
          "Google Custom Search needs a Google Search API key and Search engine ID in Settings or .env.local.",
      },
      { status: 401 }
    );
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", searchEngineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");
  url.searchParams.set("safe", "off");

  const upstream = await fetch(url, {
    headers: { Accept: "application/json" },
  }).catch((err: unknown) => {
    return new Response(
      JSON.stringify({
        error: `Google Custom Search is unreachable. ${
          err instanceof Error ? err.message : String(err)
        }`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  });

  const payload = (await upstream.json().catch(() => ({}))) as GoogleSearchResponse;
  if (!upstream.ok) {
    return Response.json(
      { error: payload.error?.message || `Google Custom Search returned HTTP ${upstream.status}.` },
      { status: upstream.status }
    );
  }

  const results = (payload.items ?? [])
    .filter((item) => item.link)
    .slice(0, 5)
    .map((item) => ({
      title: item.title || item.displayLink || item.link!,
      uri: item.link!,
      snippet: item.snippet || "",
    }));

  return Response.json(
    { query, results },
    { headers: { "Cache-Control": "no-store" } }
  );
}
