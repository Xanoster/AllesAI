import { NextRequest } from "next/server";

export const runtime = "nodejs";

type RequestBody = {
  query?: string;
  apiKey?: string;
};

type JsonRpcResponse<T = unknown> = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type McpTool = {
  name: string;
};

type ToolsListResult = {
  tools?: McpTool[];
};

type ToolCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

type TavilyResult = {
  title?: string;
  url?: string;
  uri?: string;
  link?: string;
  content?: string;
  snippet?: string;
  raw_content?: string;
  published_date?: string;
  score?: number;
};

type SearchResult = {
  title: string;
  uri: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
  score?: number;
};

type SearchPayload = {
  answer?: string;
  results: SearchResult[];
};

const DEFAULT_TAVILY_MCP_URL = "https://mcp.tavily.com/mcp/";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_EXCLUDED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "threads.net",
];
const HIGH_AUTHORITY_DOMAINS = [
  "apnews.com",
  "bbc.com",
  "bloomberg.com",
  "cnbc.com",
  "ft.com",
  "github.com",
  "gov",
  "microsoft.com",
  "nvidia.com",
  "openai.com",
  "reuters.com",
  "theverge.com",
  "techcrunch.com",
  "wsj.com",
];

function getEnvTavilyApiKey() {
  return (
    process.env.TAVILY_API_KEY ||
    process.env.TAVILY_APIKEY ||
    process.env.tavilyApiKey ||
    ""
  );
}

function getEnvTavilyMcpUrl() {
  return (
    process.env.TAVILY_MCP_URL ||
    process.env.TAVILY_MCP_SERVER_URL ||
    process.env.tavilyMcpUrl ||
    ""
  );
}

function resolveTavilyMcpUrl(apiKey?: string) {
  const rawUrl = getEnvTavilyMcpUrl() || DEFAULT_TAVILY_MCP_URL;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.searchParams.has("tavilyApiKey") && apiKey) {
      url.searchParams.set("tavilyApiKey", apiKey);
    }
    if (!url.searchParams.has("tavilyApiKey")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mcpHeaders(sessionId?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  return headers;
}

async function readJsonRpc<T>(res: Response): Promise<JsonRpcResponse<T>> {
  const text = await res.text();
  if (!text.trim()) return {};

  if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
    const events = text.split(/\r?\n\r?\n/);
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n")
        .trim();
      if (!data || data === "[DONE]") continue;
      try {
        return JSON.parse(data) as JsonRpcResponse<T>;
      } catch {
        /* keep looking */
      }
    }
    throw new Error("Tavily MCP returned an unreadable event stream.");
  }

  try {
    return JSON.parse(text) as JsonRpcResponse<T>;
  } catch {
    throw new Error(text || "Tavily MCP returned an unreadable response.");
  }
}

async function postMcp<T>(
  url: string,
  sessionId: string | undefined,
  payload: Record<string, unknown>
) {
  const res = await fetch(url, {
    method: "POST",
    headers: mcpHeaders(sessionId),
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    throw new Error(
      `Tavily MCP is unreachable. ${err instanceof Error ? err.message : String(err)}`
    );
  });

  const json = await readJsonRpc<T>(res);
  if (!res.ok) {
    throw new Error(json.error?.message || `Tavily MCP returned HTTP ${res.status}.`);
  }
  if (json.error) {
    throw new Error(json.error.message || "Tavily MCP returned an error.");
  }

  return {
    json,
    sessionId: res.headers.get("mcp-session-id") || sessionId,
  };
}

async function requestMcp<T>(
  url: string,
  sessionId: string | undefined,
  id: number,
  method: string,
  params?: Record<string, unknown>
) {
  return postMcp<T>(url, sessionId, {
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  });
}

async function notifyInitialized(url: string, sessionId?: string) {
  if (!sessionId) return;
  await fetch(url, {
    method: "POST",
    headers: mcpHeaders(sessionId),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  }).catch(() => undefined);
}

function textFromToolResult(result: ToolCallResult) {
  return (result.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n\n");
}

function cleanText(text?: string) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function limitText(text: string | undefined, maxLength: number) {
  const cleaned = cleanText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).replace(/\s+\S*$/, "").trim() + "...";
}

function resultFromUnknown(value: unknown): SearchResult | null {
  if (!value || typeof value !== "object") return null;
  const item = value as TavilyResult;
  const uri = item.url || item.uri || item.link;
  if (!uri) return null;
  return {
    title: item.title || uri,
    uri,
    snippet: limitText(item.content || item.snippet || item.raw_content, 500),
    content: limitText(item.raw_content, 1600),
    publishedDate: item.published_date,
    score: item.score,
  };
}

function structuredResults(value: unknown): SearchResult[] {
  if (!value || typeof value !== "object") return [];
  const maybeResults = (value as { results?: unknown }).results;
  if (!Array.isArray(maybeResults)) return [];
  return maybeResults
    .map(resultFromUnknown)
    .filter((result): result is SearchResult => Boolean(result));
}

function answerFromUnknown(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const answer = (value as { answer?: unknown }).answer;
  return typeof answer === "string" ? limitText(answer, 1200) : undefined;
}

function jsonPayloadFromText(text: string): SearchPayload {
  try {
    const parsed = JSON.parse(text) as unknown;
    return {
      answer: answerFromUnknown(parsed),
      results: structuredResults(parsed),
    };
  } catch {
    return { results: [] };
  }
}

function answerFromFormattedText(text: string) {
  const match = text.match(/^Answer:\s*([\s\S]*?)(?:\r?\nDetailed Results:|$)/);
  return match ? limitText(match[1], 1200) : undefined;
}

function formattedResultsFromText(text: string): SearchResult[] {
  const results: SearchResult[] = [];
  const pattern = /Title:\s*(.+?)\r?\nURL:\s*(https?:\/\/\S+)\r?\nContent:\s*([\s\S]*?)(?=\r?\nTitle:|\r?\nImages:|$)/g;

  for (const match of text.matchAll(pattern)) {
    const body = match[3]
      .replace(/\r?\nFavicon:\s*[\s\S]+$/, "")
      .trim();
    const rawMarker = body.match(/\r?\nRaw Content:\s*/);
    const snippet = rawMarker
      ? body.slice(0, rawMarker.index).trim()
      : body;
    const content = rawMarker
      ? body.slice((rawMarker.index ?? 0) + rawMarker[0].length).trim()
      : "";
    results.push({
      title: match[1].trim(),
      uri: match[2].trim(),
      snippet: limitText(snippet, 500),
      content: limitText(content, 1600),
    });
  }

  return results;
}

function normalizeToolResults(result: ToolCallResult): SearchPayload {
  const text = textFromToolResult(result);
  const jsonPayload = jsonPayloadFromText(text);
  const results = [
    ...structuredResults(result.structuredContent),
    ...jsonPayload.results,
    ...formattedResultsFromText(text),
  ]
    .filter((item, index, all) => all.findIndex((other) => other.uri === item.uri) === index)
    .sort((a, b) => rankResult(b) - rankResult(a))
    .slice(0, 8);

  return {
    answer:
      answerFromUnknown(result.structuredContent) ||
      jsonPayload.answer ||
      answerFromFormattedText(text),
    results,
  };
}

function needsFreshSearch(query: string) {
  return /\b(latest|today|current|currently|recent|news|new|now|this week|this month|202[5-9])\b/i.test(query);
}

function timeRangeForQuery(query: string): "day" | "week" | "month" | undefined {
  if (/\b(today|now|breaking)\b/i.test(query)) return "day";
  if (/\b(this week|past week|last week)\b/i.test(query)) return "week";
  if (/\b(latest|current|currently|recent|news|new|this month)\b/i.test(query)) return "month";
  return undefined;
}

function topicForQuery(query: string): "news" | undefined {
  return /\b(news|breaking|today|headlines|latest)\b/i.test(query) ? "news" : undefined;
}

function domainRoot(domain: string) {
  return domain.replace(/^www\./, "").split(".")[0];
}

function excludedDomainsForQuery(query: string) {
  const haystack = query.toLowerCase();
  return DEFAULT_EXCLUDED_DOMAINS.filter((domain) => !haystack.includes(domainRoot(domain)));
}

function hostnameFor(uri: string) {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function rankResult(result: SearchResult) {
  const hostname = hostnameFor(result.uri);
  let rank = result.score ?? 0;

  if (HIGH_AUTHORITY_DOMAINS.some((domain) => domainMatches(hostname, domain) || hostname.endsWith(`.${domain}`))) {
    rank += 0.5;
  }
  if (DEFAULT_EXCLUDED_DOMAINS.some((domain) => domainMatches(hostname, domain))) {
    rank -= 2;
  }
  if (result.content && result.content.length > 500) {
    rank += 0.15;
  }
  if (/\b(login|sign in|watch|photo|popular)\b/i.test(result.title)) {
    rank -= 0.5;
  }

  return rank;
}

async function tavilySearch(url: string, query: string) {
  const initialized = await requestMcp<{
    protocolVersion?: string;
  }>(url, undefined, 1, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "alles-ai",
      version: "0.1.0",
    },
  });

  let sessionId = initialized.sessionId;
  await notifyInitialized(url, sessionId);

  let toolName = "tavily_search";
  const listed = await requestMcp<ToolsListResult>(url, sessionId, 2, "tools/list").catch(() => null);
  sessionId = listed?.sessionId || sessionId;
  const tools = listed?.json.result?.tools ?? [];
  toolName =
    tools.find((tool) => tool.name === "tavily_search")?.name ||
    tools.find((tool) => tool.name === "tavily-search")?.name ||
    tools.find((tool) => /tavily.*search/i.test(tool.name))?.name ||
    toolName;

  const baseArguments = {
      query,
      max_results: 8,
      search_depth: "advanced",
      include_images: false,
      include_raw_content: true,
      exclude_domains: excludedDomainsForQuery(query),
    };
  const plans = needsFreshSearch(query)
    ? [
        {
          ...baseArguments,
          topic: topicForQuery(query),
          time_range: timeRangeForQuery(query) || "month",
        },
        baseArguments,
      ]
    : [baseArguments];

  const merged: SearchPayload = { results: [] };
  let requestId = 3;
  let lastError: unknown;

  for (const args of plans) {
    try {
      const called = await requestMcp<ToolCallResult>(url, sessionId, requestId++, "tools/call", {
        name: toolName,
        arguments: args,
      });
      sessionId = called.sessionId || sessionId;

      const result = called.json.result;
      if (!result) throw new Error("Tavily MCP returned no tool result.");
      if (result.isError) {
        throw new Error(textFromToolResult(result) || "Tavily MCP search failed.");
      }

      const payload = normalizeToolResults(result);
      if (!merged.answer) merged.answer = payload.answer;
      merged.results.push(...payload.results);
    } catch (err) {
      lastError = err;
    }
  }

  if (merged.results.length === 0 && lastError) throw lastError;

  merged.results = merged.results
    .filter((item, index, all) => all.findIndex((other) => other.uri === item.uri) === index)
    .sort((a, b) => rankResult(b) - rankResult(a))
    .slice(0, 8);

  return merged;
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

  const apiKey = body.apiKey?.trim() || getEnvTavilyApiKey();
  const mcpUrl = resolveTavilyMcpUrl(apiKey);
  if (!mcpUrl) {
    return Response.json(
      {
        error:
          "Tavily MCP needs a Tavily API key in Settings or TAVILY_API_KEY/tavilyApiKey in .env.local.",
      },
      { status: 401 }
    );
  }

  try {
    const { answer, results } = await tavilySearch(mcpUrl, query);
    if (results.length === 0) {
      return Response.json(
        { error: "Tavily MCP returned no source URLs." },
        { status: 502 }
      );
    }

    return Response.json(
      { query, answer, results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
