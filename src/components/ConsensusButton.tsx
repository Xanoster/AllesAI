"use client";

import { useMemo, useState } from "react";
import { Sparkles, Users, X } from "lucide-react";
import {
  filterEnabledModelIds,
  useChat,
  useSettings,
  type ProviderToggleSettings,
} from "@/lib/store";
import {
  getCloudOllamaModelName,
  getModel,
  isCloudOllamaModelId,
  toOllamaModelId,
} from "@/lib/models";
import {
  CONSENSUS_PRIORITY_MODEL_IDS,
  COUNCIL_FALLBACK_MODEL_IDS,
  COUNCIL_PRIMARY_MODEL_IDS,
  canUseModelForConsensus,
  getModelAlias,
  hasProviderAccessForConsensus,
} from "@/lib/model-rules";
import { API_PROVIDERS } from "@/lib/providers";
import { Markdown } from "./Markdown";
import { SharedResultCard } from "./SharedResultsLane";

type ConsensusChoice = {
  id: string;
  model: NonNullable<ReturnType<typeof getModel>>;
};

type ConsensusMode = "single" | "council";

type ConsensusStreamEvent =
  | { type: "delta"; text?: string }
  | { type: "status"; modelId?: string; model?: string; status?: string; round?: string; message?: string; replacementModelId?: string; replacementModel?: string }
  | { type: "round_start"; round?: string; title?: string }
  | { type: "council_note"; round?: string; roundTitle?: string; modelId?: string; model?: string; text?: string }
  | { type: "error"; message?: string }
  | { type: "done" };

export function ConsensusButton({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const saveConsensus = useChat((s) => s.saveConsensus);
  const startSharedResult = useChat((s) => s.startSharedResult);
  const appendSharedResultContent = useChat((s) => s.appendSharedResultContent);
  const finishSharedResult = useChat((s) => s.finishSharedResult);
  const startCouncilRound = useChat((s) => s.startCouncilRound);
  const upsertCouncilStatus = useChat((s) => s.upsertCouncilStatus);
  const addCouncilNote = useChat((s) => s.addCouncilNote);
  const apiKey = useSettings((s) => s.apiKey);
  const groqEnabled = useSettings((s) => s.groqEnabled);
  const geminiApiKey = useSettings((s) => s.geminiApiKey);
  const geminiEnabled = useSettings((s) => s.geminiEnabled);
  const ollamaBaseUrl = useSettings((s) => s.ollamaBaseUrl);
  const ollamaApiKey = useSettings((s) => s.ollamaApiKey);
  const ollamaCloudBaseUrl = useSettings((s) => s.ollamaCloudBaseUrl);
  const localEnabled = useSettings((s) => s.localEnabled);
  const cloudOllamaEnabled = useSettings((s) => s.cloudOllamaEnabled);
  const availableLocalModels = useSettings((s) => s.availableLocalModels);
  const consensusModel = useSettings((s) => s.consensusModel);
  const setConsensusModel = useSettings((s) => s.setConsensusModel);
  const saveConsensusToChat = useSettings((s) => s.saveConsensusToChat);

  const enabledSettings = useMemo<ProviderToggleSettings>(
    () => ({
      groqEnabled,
      geminiEnabled,
      cloudOllamaEnabled,
      localEnabled,
    }),
    [cloudOllamaEnabled, geminiEnabled, groqEnabled, localEnabled]
  );
  const accessSettings = useMemo(
    () => ({
      apiKey,
      groqEnabled,
      geminiApiKey,
      geminiEnabled,
      ollamaApiKey,
      cloudOllamaEnabled,
      localEnabled,
    }),
    [apiKey, cloudOllamaEnabled, geminiApiKey, geminiEnabled, groqEnabled, localEnabled, ollamaApiKey]
  );

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<ConsensusMode>("single");
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const activeResult = useChat((s) =>
    activeResultId
      ? s.conversations[convId]?.sharedResults?.find((result) => result.id === activeResultId)
      : undefined
  );

  const localModelNames = useMemo(
    () =>
      new Set(
        availableLocalModels.map((model) => stripLatest(model.name).toLowerCase())
      ),
    [availableLocalModels]
  );

  const consensusChoices = useMemo<ConsensusChoice[]>(() => {
    const ids = CONSENSUS_PRIORITY_MODEL_IDS.map((id) =>
      resolvePreferredRoute(id, accessSettings, localModelNames)
    ).filter((id): id is string => Boolean(id));
    return unique(ids)
      .map((id) => getEligibleChoice(id, accessSettings))
      .filter((choice): choice is ConsensusChoice => Boolean(choice));
  }, [accessSettings, localModelNames]);

  const councilPrimaryIds = useMemo(
    () =>
      unique(
        COUNCIL_PRIMARY_MODEL_IDS.map((id) =>
          resolvePreferredRoute(id, accessSettings, localModelNames)
        ).filter((id): id is string => Boolean(id))
      ),
    [accessSettings, localModelNames]
  );
  const councilFallbackIds = useMemo(
    () =>
      unique(
        COUNCIL_FALLBACK_MODEL_IDS.map((id) =>
          resolvePreferredRoute(id, accessSettings, localModelNames)
        ).filter((id): id is string => Boolean(id))
      ),
    [accessSettings, localModelNames]
  );

  if (!conv) return null;

  const disabled = new Set(conv.disabledModels ?? []);
  const activeCandidateIds = (conv.focusedModel ? [conv.focusedModel] : conv.selectedModels).filter(
    (id) => !disabled.has(id)
  );
  const activeModelIds = filterEnabledModelIds(activeCandidateIds, enabledSettings);
  const hasPendingModels = activeModelIds.some((modelId) =>
    conv.threads[modelId]?.messages.some((message) => message.role === "assistant" && message.pending)
  );

  const selectedConsensusModel = consensusChoices.some((choice) => choice.id === consensusModel)
    ? consensusModel
    : consensusChoices[0]?.id ?? "";
  const consensusInfo = getModel(selectedConsensusModel);
  const consensusSource = consensusInfo ? API_PROVIDERS[consensusInfo.apiProvider] : undefined;

  const responses: { model: string; content: string }[] = [];
  let latestPrompt = "";
  for (const modelId of activeModelIds) {
    const t = conv.threads[modelId];
    if (!t) continue;
    let lastUser = "";
    let lastAsst = "";
    for (const m of t.messages) {
      if (m.role === "user") lastUser = m.content;
      else if (m.role === "assistant" && !m.pending && !m.error && m.content.trim()) {
        lastAsst = m.content;
      }
    }
    if (lastUser && lastAsst) {
      latestPrompt = lastUser;
      const info = getModel(modelId);
      responses.push({ model: info ? getModelAlias(info) : getModelAlias(modelId), content: lastAsst });
    }
  }

  const hasEnoughResponses = responses.length >= 2;
  const hasConsensusSource = Boolean(
    consensusInfo &&
      hasProviderAccessForConsensus(consensusInfo.apiProvider, accessSettings) &&
      canUseModelForConsensus(consensusInfo)
  );
  const canRunConsensus = hasEnoughResponses && hasConsensusSource && !hasPendingModels;
  const canRunCouncil = hasEnoughResponses && !hasPendingModels && councilPrimaryIds.length >= 2;
  const disabledReason = hasPendingModels
    ? "Waiting for all models to finish"
    : !hasEnoughResponses
      ? "Need at least two completed answers"
      : !selectedConsensusModel
        ? "No eligible consensus model"
        : !hasConsensusSource && consensusSource
          ? `Add ${consensusSource.name} key or enable provider`
          : "Consensus unavailable";

  const persistConsensus = (content: string) => {
    const modelId = runMode === "council" ? "model-council" : selectedConsensusModel;
    if (!content.trim() || saved || !modelId) return;
    saveConsensus(convId, content, modelId);
    setSaved(true);
  };

  const runConsensus = async (mode: ConsensusMode = "single") => {
    setRunMode(mode);
    setError(null);
    setText("");
    setSaved(false);
    setOpen(true);

    if (hasPendingModels) {
      setError("Waiting for all models to finish.");
      return;
    }
    if (!hasEnoughResponses) {
      setError("Need at least two completed answers.");
      return;
    }
    if (mode === "single" && !selectedConsensusModel) {
      setError("No eligible consensus model is selected.");
      return;
    }
    if (mode === "single" && !hasConsensusSource) {
      setError(
        consensusSource
          ? `Add ${consensusSource.name} key or enable it in Settings.`
          : "Consensus model is unavailable."
      );
      return;
    }
    if (mode === "council" && councilPrimaryIds.length < 2) {
      setError("Model council needs at least two available council models.");
      return;
    }

    setLoading(true);
    let output = "";
    let resultId: string | null = null;
    let streamError: string | null = null;
    try {
      resultId = startSharedResult(convId, {
        type: mode === "council" ? "council" : "consensus",
        title: mode === "council" ? "Model council" : "Consensus answer",
        modelId: mode === "council" ? "model-council" : selectedConsensusModel,
        content: "",
        pending: true,
        participants: mode === "council" ? councilPrimaryIds.map((id) => getModelAlias(id)) : undefined,
        statuses:
          mode === "council"
            ? councilPrimaryIds.map((id) => ({
                modelId: id,
                model: getModelAlias(id),
                status: "queued",
                updatedAt: Date.now(),
              }))
            : undefined,
        rounds: mode === "council" ? [] : undefined,
        notes: mode === "council" ? [] : undefined,
      });
      setActiveResultId(resultId);

      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt: latestPrompt,
          responses,
          consensusModel: selectedConsensusModel,
          candidateModels: mode === "council" ? councilPrimaryIds : undefined,
          fallbackModels:
            mode === "council"
              ? councilFallbackIds
              : consensusChoices
                  .map((choice) => choice.id)
                  .filter((id) => id !== selectedConsensusModel),
          apiKey,
          geminiApiKey,
          ollamaBaseUrl,
          ollamaApiKey,
          ollamaCloudBaseUrl,
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw new Error(formatConsensusError(errText, res.status));
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
            const obj = JSON.parse(line) as ConsensusStreamEvent;
            if (obj.type === "delta" && obj.text) {
              output += obj.text;
              setText((t) => t + obj.text);
              if (resultId) appendSharedResultContent(convId, resultId, obj.text);
            } else if (obj.type === "round_start" && resultId && isCouncilRound(obj.round)) {
              startCouncilRound(convId, resultId, {
                id: obj.round,
                title: obj.title || roundTitle(obj.round),
                startedAt: Date.now(),
              });
            } else if (obj.type === "status" && resultId && obj.modelId && obj.model && isCouncilStatus(obj.status)) {
              upsertCouncilStatus(convId, resultId, {
                modelId: obj.modelId,
                model: obj.model,
                status: obj.status,
                round: isCouncilRound(obj.round) ? obj.round : undefined,
                message: obj.message,
                replacementModelId: obj.replacementModelId,
                replacementModel: obj.replacementModel,
              });
            } else if (
              obj.type === "council_note" &&
              resultId &&
              obj.modelId &&
              obj.model &&
              obj.text &&
              isCouncilRound(obj.round)
            ) {
              addCouncilNote(convId, resultId, {
                round: obj.round,
                roundTitle: obj.roundTitle || roundTitle(obj.round),
                modelId: obj.modelId,
                model: obj.model,
                content: obj.text,
              });
            } else if (obj.type === "error") {
              streamError = obj.message || "Consensus stream failed.";
              setError(streamError);
              if (resultId) finishSharedResult(convId, resultId, { error: streamError });
            }
          } catch {
            // ignore malformed stream events
          }
        }
      }
      if (streamError) return;
      if (resultId) {
        finishSharedResult(convId, resultId, {
          content: output,
          finalAnswer: mode === "council" ? output : undefined,
        });
      }
      if (saveConsensusToChat) persistConsensus(output);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      if (resultId) finishSharedResult(convId, resultId, { error: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={!canRunConsensus || loading}
        onClick={() => runConsensus("single")}
        className={
          "fixed bottom-24 right-6 z-30 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg transition " +
          (canRunConsensus
            ? "bg-gradient-to-r from-purple-500 to-blue-500 shadow-purple-500/30 hover:scale-105"
            : "cursor-not-allowed bg-[var(--fg-muted)] opacity-70 shadow-black/10")
        }
        title={
          canRunConsensus
            ? `Synthesize with ${consensusInfo ? getModelAlias(consensusInfo) : "the consensus model"}`
            : disabledReason
        }
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
                  {runMode === "council" ? <Users size={14} /> : <Sparkles size={14} />}
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {runMode === "council" ? "Model council" : "Consensus answer"}
                  </div>
                  <div className="text-[11px] text-[var(--fg-muted)]">
                    Synthesized from {responses.length} answers
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)]"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-soft)] px-5 py-2">
              <select
                value={selectedConsensusModel}
                onChange={(e) => setConsensusModel(e.target.value)}
                disabled={loading || consensusChoices.length === 0}
                className="min-w-0 max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg)] outline-none"
                title="Consensus model"
              >
                {consensusChoices.length === 0 && <option value="">No eligible model</option>}
                {consensusChoices.map(({ id, model }) => (
                  <option key={id} value={id}>
                    {getModelAlias(model)}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || !canRunConsensus}
                  onClick={() => runConsensus("single")}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  Rerun
                </button>
                <button
                  type="button"
                  disabled={loading || !canRunCouncil}
                  onClick={() => runConsensus("council")}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg)] hover:border-[var(--border-strong)] disabled:opacity-50"
                  title={
                    canRunCouncil
                      ? "Run Gemini 2.5, Gemma 4, and Llama 4 as a model council"
                      : "Model council is available after consensus when at least two council models are available"
                  }
                >
                  <Users size={12} />
                  Council
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="rounded-lg border border-[var(--error)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--error)]">
                  {error}
                </div>
              )}
              {!error && !text && loading && (
                <div className="text-sm text-[var(--fg-muted)]">
                  {runMode === "council" ? "Running model council..." : "Synthesizing best answer..."}
                </div>
              )}
              {activeResult ? (
                <SharedResultCard result={activeResult} compact />
              ) : (
                text && <Markdown source={text} />
              )}
              {loading && (text || activeResult) && (
                <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--fg)]" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getEligibleChoice(
  id: string,
  settings: Parameters<typeof hasProviderAccessForConsensus>[1]
): ConsensusChoice | null {
  const model = getModel(id);
  if (!model) return null;
  if (!canUseModelForConsensus(model)) return null;
  if (!hasProviderAccessForConsensus(model.apiProvider, settings)) return null;
  return { id, model };
}

function resolvePreferredRoute(
  preferredId: string,
  settings: Parameters<typeof hasProviderAccessForConsensus>[1],
  localModelNames: Set<string>
): string | null {
  const cloudFirst = getEligibleChoice(preferredId, settings);
  if (cloudFirst) return cloudFirst.id;

  if (isCloudOllamaModelId(preferredId)) {
    const cloudName = getCloudOllamaModelName(preferredId);
    const localName = findLocalModelName(cloudName, localModelNames);
    if (localName) {
      const localId = toOllamaModelId(localName);
      return getEligibleChoice(localId, settings)?.id ?? null;
    }
  }

  return null;
}

function stripLatest(name: string): string {
  return name.replace(/:latest$/, "");
}

function findLocalModelName(cloudModelName: string, localNames: Set<string>): string | null {
  const normalized = stripLatest(cloudModelName).toLowerCase();
  if (localNames.has(normalized)) return normalized;
  if (normalized === "gemma4:31b" && localNames.has("gemma4:31b")) return "gemma4:31b";
  if (normalized === "cogito-2.1:671b" && localNames.has("cogito-2.1:671b")) return "cogito-2.1:671b";
  if (normalized === "nemotron-3-super" && localNames.has("nemotron-3-super")) return "nemotron-3-super";
  return null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isCouncilRound(value: unknown): value is "opening" | "critique" | "convergence" | "synthesis" {
  return value === "opening" || value === "critique" || value === "convergence" || value === "synthesis";
}

function isCouncilStatus(value: unknown): value is "queued" | "running" | "done" | "failed" | "replaced" {
  return value === "queued" || value === "running" || value === "done" || value === "failed" || value === "replaced";
}

function roundTitle(round: "opening" | "critique" | "convergence" | "synthesis"): string {
  if (round === "opening") return "Opening";
  if (round === "critique") return "Critique";
  if (round === "convergence") return "Convergence";
  return "Final synthesis";
}

function extractApiError(raw: string): string {
  if (!raw) return "";
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

function formatConsensusError(raw: string, status: number): string {
  const parsed = extractApiError(raw) || `HTTP ${status}`;
  if (/requires?\s+(an?\s+)?subscription|upgrade\s+for\s+access/i.test(parsed)) {
    return "Ollama says this model requires a subscription. Choose another model/source, or upgrade at https://ollama.com/upgrade.";
  }
  return parsed;
}
