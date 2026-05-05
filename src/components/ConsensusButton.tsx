"use client";

import { useMemo, useState } from "react";
import { Check, Save, Sparkles, X } from "lucide-react";
import { useChat, useSettings } from "@/lib/store";
import { CONSENSUS_MODEL, getModel, isOllamaModelId } from "@/lib/models";
import { Markdown } from "./Markdown";

export function ConsensusButton({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const saveConsensus = useChat((s) => s.saveConsensus);
  const apiKey = useSettings((s) => s.apiKey);
  const geminiApiKey = useSettings((s) => s.geminiApiKey);
  const ollamaBaseUrl = useSettings((s) => s.ollamaBaseUrl);
  const consensusModel = useSettings((s) => s.consensusModel);
  const setConsensusModel = useSettings((s) => s.setConsensusModel);
  const saveConsensusToChat = useSettings((s) => s.saveConsensusToChat);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localConsensusChoices = useMemo(() => {
    if (!conv) return [];
    return conv.selectedModels
      .filter(isOllamaModelId)
      .map((id) => ({ id, label: getModel(id)?.label ?? id }));
  }, [conv]);

  if (!conv) return null;

  const responses: { model: string; content: string }[] = [];
  let latestPrompt = "";
  for (const modelId of conv.selectedModels) {
    const t = conv.threads[modelId];
    if (!t) continue;
    let lastUser = "";
    let lastAsst = "";
    for (const m of t.messages) {
      if (m.role === "user") lastUser = m.content;
      else if (m.role === "assistant" && !m.pending && !m.error && m.content.trim()) lastAsst = m.content;
    }
    if (lastUser && lastAsst) {
      latestPrompt = lastUser;
      const info = getModel(modelId);
      responses.push({ model: info?.label ?? modelId, content: lastAsst });
    }
  }

  if (responses.length < 2) return null;

  const selectedConsensusModel =
    consensusModel === CONSENSUS_MODEL || localConsensusChoices.some((choice) => choice.id === consensusModel)
      ? consensusModel
      : CONSENSUS_MODEL;
  const fallbackConsensusModel = localConsensusChoices[0]?.id;

  const persistConsensus = (content: string) => {
    if (!content.trim() || saved) return;
    saveConsensus(convId, content, selectedConsensusModel);
    setSaved(true);
  };

  const runConsensus = async () => {
    setLoading(true);
    setError(null);
    setText("");
    setSaved(false);
    setOpen(true);
    let output = "";
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: latestPrompt,
          responses,
          consensusModel: selectedConsensusModel,
          fallbackConsensusModel,
          apiKey,
          geminiApiKey,
          ollamaBaseUrl,
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
              output += obj.text;
              setText((t) => t + obj.text);
            }
          } catch {
            // ignore
          }
        }
      }
      if (saveConsensusToChat) persistConsensus(output);
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

            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-soft)] px-5 py-2">
              <select
                value={selectedConsensusModel}
                onChange={(e) => setConsensusModel(e.target.value)}
                disabled={loading}
                className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg)] outline-none"
              >
                <option value={CONSENSUS_MODEL}>Groq consensus</option>
                {localConsensusChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    Local: {choice.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!text.trim() || loading || saved}
                onClick={() => persistConsensus(text)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg)] hover:border-[var(--border-strong)] disabled:opacity-50"
              >
                {saved ? <Check size={12} /> : <Save size={12} />}
                {saved ? "Saved" : "Save"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="rounded-lg border border-[var(--error)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--error)]">
                  {error}
                </div>
              )}
              {!error && !text && loading && (
                <div className="text-sm text-[var(--fg-muted)]">Synthesizing best answer...</div>
              )}
              {text && <Markdown source={text} />}
              {loading && text && (
                <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--fg)]" />
              )}

              {(conv.consensusMessages?.length ?? 0) > 0 && (
                <div className="mt-5 border-t border-[var(--border)] pt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                    Saved consensus
                  </div>
                  <div className="space-y-3">
                    {conv.consensusMessages!.slice().reverse().slice(0, 3).map((msg) => (
                      <div key={msg.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
                        <Markdown source={msg.content} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
