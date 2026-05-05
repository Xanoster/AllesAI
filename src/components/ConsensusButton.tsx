"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useChat, useSettings } from "@/lib/store";
import { CONSENSUS_MODEL, getModel } from "@/lib/models";
import { Markdown } from "./Markdown";

export function ConsensusButton({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const apiKey = useSettings((s) => s.apiKey);
  const geminiApiKey = useSettings((s) => s.geminiApiKey);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!conv) return null;

  // Find the latest user prompt and corresponding assistant responses
  const responses: { model: string; content: string }[] = [];
  let latestPrompt = "";
  for (const modelId of conv.selectedModels) {
    const t = conv.threads[modelId];
    if (!t) continue;
    // Get last user msg + last assistant msg from this thread
    let lastUser = "";
    let lastAsst = "";
    for (const m of t.messages) {
      if (m.role === "user") lastUser = m.content;
      else if (m.role === "assistant") lastAsst = m.content;
    }
    if (lastUser && lastAsst) {
      latestPrompt = lastUser;
      const info = getModel(modelId);
      responses.push({ model: info?.label ?? modelId, content: lastAsst });
    }
  }

  // Show only when at least 2 models have answered
  if (responses.length < 2) return null;

  const runConsensus = async () => {
    setLoading(true);
    setError(null);
    setText("");
    setOpen(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: latestPrompt,
          responses,
          consensusModel: CONSENSUS_MODEL,
          apiKey,
          geminiApiKey,
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.type === "delta" && obj.text) {
              setText((t) => t + obj.text);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={runConsensus}
        className="fixed bottom-24 right-6 z-30 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/30 transition hover:scale-105"
        title="Synthesize the best answer from all models"
      >
        <Sparkles size={14} />
        Consensus
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 p-1.5 text-white">
                  <Sparkles size={14} />
                </div>
                <div>
                  <div className="text-sm font-semibold">Consensus answer</div>
                  <div className="text-[11px] text-[var(--fg-muted)]">
                    Synthesized from {responses.length} models
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="rounded-lg border border-[var(--error)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--error)]">
                  {error}
                </div>
              )}
              {!error && !text && loading && (
                <div className="text-sm text-[var(--fg-muted)]">Synthesizing best answer…</div>
              )}
              {text && <Markdown source={text} />}
              {loading && text && (
                <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--fg)]" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
