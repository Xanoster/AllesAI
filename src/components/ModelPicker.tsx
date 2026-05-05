"use client";

import { useMemo, useState } from "react";
import {
  getProviderGroups,
  getModel,
  isOllamaModelId,
  isCloudOllamaModelId,
  toOllamaModelId,
  toCloudOllamaModelId,
  PRESET_CLOUD_OLLAMA_MODELS,
  type ModelInfo,
} from "@/lib/models";
import { PROVIDERS, PROVIDER_ORDER } from "@/lib/providers";
import { useChat, useSettings, type LocalOllamaModel } from "@/lib/store";
import { ProviderIcon } from "./ProviderIcon";
import { Sliders, X, ChevronDown, RefreshCw, Search, Check } from "lucide-react";

const groups = getProviderGroups();
const orderedGroups = PROVIDER_ORDER.map((p) => groups.find((g) => g.provider === p)).filter(
  Boolean
) as ReturnType<typeof getProviderGroups>;

export function ModelPicker({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const setSelectedModels = useChat((s) => s.setSelectedModels);
  const localEnabled = useSettings((s) => s.localEnabled);
  const cloudOllamaEnabled = useSettings((s) => s.cloudOllamaEnabled);
  const ollamaBaseUrl = useSettings((s) => s.ollamaBaseUrl);
  const ollamaApiKey = useSettings((s) => s.ollamaApiKey);
  const availableLocalModels = useSettings((s) => s.availableLocalModels);
  const setAvailableLocalModels = useSettings((s) => s.setAvailableLocalModels);
  const [open, setOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const [cloudQuery, setCloudQuery] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const refreshLocalModels = async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const params = new URLSearchParams({ baseUrl: ollamaBaseUrl });
      if (ollamaApiKey) params.set("apiKey", ollamaApiKey);
      const res = await fetch(`/api/ollama/models?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        models?: LocalOllamaModel[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAvailableLocalModels(data.models ?? []);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalLoading(false);
    }
  };

  if (!conv) return null;

  const activeByProvider = new Map<string, string>();
  for (const id of conv.selectedModels) {
    const m = getModel(id);
    if (m && !isOllamaModelId(id) && !isCloudOllamaModelId(id)) activeByProvider.set(m.provider, id);
  }

  const setProviderActive = (providerKey: string, newModelId: string | null) => {
    const others = conv.selectedModels.filter((id) => {
      const m = getModel(id);
      return !m || m.provider !== providerKey;
    });
    const next = newModelId ? [...others, newModelId] : others;
    setSelectedModels(convId, next);
  };

  const toggleLocalModel = (modelName: string) => {
    const id = toOllamaModelId(modelName);
    const selected = conv.selectedModels.includes(id);
    const next = selected
      ? conv.selectedModels.filter((modelId) => modelId !== id)
      : [...conv.selectedModels, id];
    setSelectedModels(convId, next);
  };

  const toggleCloudModel = (modelName: string) => {
    const id = toCloudOllamaModelId(modelName);
    const selected = conv.selectedModels.includes(id);
    const next = selected
      ? conv.selectedModels.filter((modelId) => modelId !== id)
      : [...conv.selectedModels, id];
    setSelectedModels(convId, next);
  };

  const selectedLocalCount = conv.selectedModels.filter(isOllamaModelId).length;
  const selectedCloudCount = conv.selectedModels.filter(isCloudOllamaModelId).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--fg)] hover:border-[var(--border-strong)]"
      >
        <Sliders size={12} />
        <span className="hidden sm:inline">Models</span>
        <span className="rounded-full bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">
          {conv.selectedModels.length}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold">AI model preferences</h2>
                <p className="text-xs text-[var(--fg-muted)]">
                  Pick cloud models and optional local Ollama models.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {orderedGroups.map((g) => {
                const allVariants: ModelInfo[] = [
                  ...(g.freeModel ? [g.freeModel] : []),
                  ...g.paidModels,
                ];
                const activeId = activeByProvider.get(g.provider);
                const enabled = !!activeId;
                const provInfo = PROVIDERS[g.provider];
                return (
                  <div
                    key={g.provider}
                    className="mb-1.5 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5"
                  >
                    <ProviderIcon provider={g.provider} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{provInfo.name}</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        {allVariants.length} variant{allVariants.length === 1 ? "" : "s"}
                        {g.freeModel && " - free option available"}
                      </div>
                    </div>

                    <VariantDropdown
                      group={g}
                      activeId={activeId}
                      onPick={(id) => setProviderActive(g.provider, id)}
                    />

                    <Toggle
                      on={enabled}
                      onChange={(v) => {
                        if (v) {
                          const defaultId = g.freeModel?.id ?? allVariants[0]?.id;
                          if (defaultId) setProviderActive(g.provider, defaultId);
                        } else {
                          setProviderActive(g.provider, null);
                        }
                      }}
                    />
                  </div>
                );
              })}

              {localEnabled && (
                <LocalModelsPanel
                  models={availableLocalModels}
                  selectedIds={conv.selectedModels}
                  query={localQuery}
                  setQuery={setLocalQuery}
                  selectedCount={selectedLocalCount}
                  loading={localLoading}
                  error={localError}
                  onRefresh={refreshLocalModels}
                  onToggleModel={toggleLocalModel}
                />
              )}
              {!localEnabled && (
                <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--fg-muted)]">
                  Local Ollama is off. Enable it in Settings to pick installed local models.
                </div>
              )}

              {cloudOllamaEnabled && (
                <CloudModelsPanel
                  models={PRESET_CLOUD_OLLAMA_MODELS}
                  selectedIds={conv.selectedModels}
                  query={cloudQuery}
                  setQuery={setCloudQuery}
                  selectedCount={selectedCloudCount}
                  onToggleModel={toggleCloudModel}
                />
              )}
              {!cloudOllamaEnabled && (
                <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--fg-muted)]">
                  Cloud Ollama is off. Enable it in Settings and add your API key to use ollama.com hosted models.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-soft)] px-5 py-3">
              <span className="text-xs text-[var(--fg-muted)]">
                {selectedLocalCount > 0 && `${selectedLocalCount} local`}
                {selectedLocalCount > 0 && selectedCloudCount > 0 && " · "}
                {selectedCloudCount > 0 && `${selectedCloudCount} cloud Ollama`}
                {selectedLocalCount === 0 && selectedCloudCount === 0 && "No Ollama models selected"}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Local Ollama panel – dynamically fetched models only.
function LocalModelsPanel({
  models,
  selectedIds,
  query,
  setQuery,
  selectedCount,
  loading,
  error,
  onRefresh,
  onToggleModel,
}: {
  models: LocalOllamaModel[];
  selectedIds: string[];
  query: string;
  setQuery: (query: string) => void;
  selectedCount: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onToggleModel: (modelName: string) => void;
}) {
  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((model) => {
      const haystack = [
        model.name,
        model.model,
        model.details?.family,
        model.details?.parameter_size,
        model.details?.quantization_level,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [models, query]);

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5">
      <div className="mb-2 flex items-center gap-3">
        <ProviderIcon provider="ollama" size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Local Ollama</div>
          <div className="text-[11px] text-[var(--fg-muted)]">
            {selectedCount} selected from installed models
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--fg)] hover:border-[var(--border-strong)] disabled:opacity-60"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="relative mb-2">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search installed models"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-7 pr-2 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
        />
      </div>

      {error && (
        <div className="mb-2 rounded border border-[var(--error)]/40 bg-[var(--bg-soft)] px-2 py-1.5 text-[11px] text-[var(--error)]">
          {error}
        </div>
      )}

      {visibleModels.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--fg-muted)]">
          {models.length === 0 ? "Refresh to detect installed Ollama models." : "No local models match your search."}
        </div>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {visibleModels.map((model) => {
            const selected = selectedIds.includes(toOllamaModelId(model.name));
            return (
              <button
                key={model.name}
                onClick={() => onToggleModel(model.name)}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-soft)] " +
                  (selected ? "bg-[var(--bg-soft)]" : "")
                }
              >
                <span
                  className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                    (selected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "border-[var(--border-strong)] text-transparent")
                  }
                >
                  {selected && <Check size={10} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-[var(--fg)]">{model.name}</div>
                  <div className="truncate text-[10px] text-[var(--fg-muted)]">
                    {modelMeta(model)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Cloud Ollama panel – preset list of ollama.com hosted models.
function CloudModelsPanel({
  models,
  selectedIds,
  query,
  setQuery,
  selectedCount,
  onToggleModel,
}: {
  models: typeof PRESET_CLOUD_OLLAMA_MODELS;
  selectedIds: string[];
  query: string;
  setQuery: (query: string) => void;
  selectedCount: number;
  onToggleModel: (modelName: string) => void;
}) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      [m.name, m.paramSize, m.bestFor].join(" ").toLowerCase().includes(q)
    );
  }, [models, query]);

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5">
      <div className="mb-2 flex items-center gap-3">
        <ProviderIcon provider="ollama" size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Cloud Ollama (ollama.com)</div>
          <div className="text-[11px] text-[var(--fg-muted)]">
            {selectedCount} selected · hosted models via API key
          </div>
        </div>
      </div>

      <div className="relative mb-2">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cloud models"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-7 pr-2 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
        />
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {visible.map((model) => {
          const id = toCloudOllamaModelId(model.name);
          const selected = selectedIds.includes(id);
          return (
            <button
              key={model.name}
              onClick={() => onToggleModel(model.name)}
              className={
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-soft)] " +
                (selected ? "bg-[var(--bg-soft)]" : "")
              }
            >
              <span
                className={
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                  (selected
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "border-[var(--border-strong)] text-transparent")
                }
              >
                {selected && <Check size={10} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-[var(--fg)]">{model.name}</div>
                <div className="truncate text-[10px] text-[var(--fg-muted)]">
                  {model.paramSize} · {model.bestFor}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={
        "relative h-5 w-9 shrink-0 rounded-full transition " +
        (on ? "bg-emerald-500" : "bg-[var(--border-strong)]")
      }
      aria-pressed={on}
    >
      <span
        className={
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition " +
          (on ? "left-[18px]" : "left-0.5")
        }
      />
    </button>
  );
}

function VariantDropdown({
  group,
  activeId,
  onPick,
}: {
  group: ReturnType<typeof getProviderGroups>[number];
  activeId?: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const variants: ModelInfo[] = [...(group.freeModel ? [group.freeModel] : []), ...group.paidModels];
  const active = activeId ? getModel(activeId) : undefined;
  const label = active?.shortLabel ?? active?.label ?? "Select";

  if (variants.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--fg)] hover:border-[var(--border-strong)]"
      >
        <span className="max-w-[110px] truncate">{label}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-60 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-xl">
            {variants.map((m) => (
              <VariantRow
                key={m.id}
                m={m}
                active={activeId === m.id}
                onClick={() => {
                  onPick(m.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VariantRow({
  m,
  active,
  onClick,
}: {
  m: ModelInfo;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-soft)] " +
        (active ? "bg-[var(--bg-soft)]" : "")
      }
    >
      <div className="min-w-0">
        <div className="truncate">{m.label}</div>
        <div className="flex gap-1 text-[9px] text-[var(--fg-muted)]">
          {m.context > 0 && (
            <span>
              {m.context >= 1_000_000
                ? `${(m.context / 1_000_000).toFixed(0)}M`
                : `${Math.round(m.context / 1000)}K`}
            </span>
          )}
          {m.vision && <span className="text-blue-500">vision</span>}
          {m.thinking && <span className="text-purple-500">thinking</span>}
          {m.category && <span className="text-emerald-500">{m.category.toLowerCase()}</span>}
        </div>
      </div>
    </button>
  );
}

function modelMeta(model: LocalOllamaModel): string {
  const parts = [
    model.details?.family,
    model.details?.parameter_size,
    model.details?.quantization_level,
    typeof model.size === "number" ? formatBytes(model.size) : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "local model";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
