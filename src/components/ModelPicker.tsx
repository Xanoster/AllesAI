"use client";

import { useState } from "react";
import { getProviderGroups, getModel, type ModelInfo } from "@/lib/models";
import { PROVIDERS, PROVIDER_ORDER } from "@/lib/providers";
import { useChat } from "@/lib/store";
import { ProviderIcon } from "./ProviderIcon";
import { Sliders, X, ChevronDown } from "lucide-react";

const groups = getProviderGroups();
const orderedGroups = PROVIDER_ORDER.map((p) => groups.find((g) => g.provider === p)).filter(
  Boolean
) as ReturnType<typeof getProviderGroups>;

export function ModelPicker({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const setSelectedModels = useChat((s) => s.setSelectedModels);
  const [open, setOpen] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);

  if (!conv) return null;
  const selected = new Set(conv.selectedModels);

  // For each provider, the user picks ONE active variant (free by default).
  // We track which model from each provider is currently active.
  const activeByProvider = new Map<string, string>();
  for (const id of conv.selectedModels) {
    const m = getModel(id);
    if (m) activeByProvider.set(m.provider, id);
  }

  const setProviderActive = (providerKey: string, newModelId: string | null) => {
    // Remove any other model from same provider, add the new one (if any)
    const others = conv.selectedModels.filter((id) => {
      const m = getModel(id);
      return !m || m.provider !== providerKey;
    });
    const next = newModelId ? [...others, newModelId] : others;
    setSelectedModels(convId, next);
  };

  const togglePaid = (modelId: string) => {
    if (selected.has(modelId)) {
      setSelectedModels(
        convId,
        conv.selectedModels.filter((m) => m !== modelId)
      );
    } else {
      const m = getModel(modelId);
      if (!m) return;
      // Replace any existing model from same provider
      setProviderActive(m.provider, modelId);
    }
  };

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
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold">AI model preferences</h2>
                <p className="text-xs text-[var(--fg-muted)]">
                  One model per provider. Pick a variant from the dropdown.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-soft)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Provider rows */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {orderedGroups.map((g) => {
                const allVariants: ModelInfo[] = [
                  ...(g.freeModel ? [g.freeModel] : []),
                  ...g.paidModels,
                ];
                const activeId = activeByProvider.get(g.provider);
                const activeModel = activeId ? getModel(activeId) : undefined;
                const enabled = !!activeId;
                const provInfo = PROVIDERS[g.provider];
                return (
                  <div
                    key={g.provider}
                    className="mb-1.5 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5"
                  >
                    <ProviderIcon provider={g.provider} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{provInfo.name}</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        {allVariants.length} variant{allVariants.length === 1 ? "" : "s"}
                        {g.freeModel && " · free option available"}
                      </div>
                    </div>

                    <VariantDropdown
                      group={g}
                      activeId={activeId}
                      onPick={(id) => setProviderActive(g.provider, id)}
                      paidOnly={paidOnly}
                    />

                    <Toggle
                      on={enabled}
                      onChange={(v) => {
                        if (v) {
                          // Default to free model, else cheapest paid
                          const defaultId =
                            g.freeModel?.id ?? allVariants[0]?.id;
                          if (defaultId) setProviderActive(g.provider, defaultId);
                        } else {
                          setProviderActive(g.provider, null);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-soft)] px-5 py-3">
              <button
                onClick={() => setPaidOnly((v) => !v)}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {paidOnly ? "Show all variants" : "Hide free defaults"}
              </button>
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
  paidOnly,
}: {
  group: ReturnType<typeof getProviderGroups>[number];
  activeId?: string;
  onPick: (id: string) => void;
  paidOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const variants: ModelInfo[] = paidOnly
    ? group.paidModels
    : [...(group.freeModel ? [group.freeModel] : []), ...group.paidModels];

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
            {group.freeModel && !paidOnly && (
              <div className="mb-1 px-2 pt-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
                Free
              </div>
            )}
            {group.freeModel && !paidOnly && (
              <VariantRow
                m={group.freeModel}
                active={activeId === group.freeModel.id}
                onClick={() => {
                  onPick(group.freeModel!.id);
                  setOpen(false);
                }}
              />
            )}
            {group.paidModels.length > 0 && (
              <div className="mb-1 mt-1.5 px-2 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500">
                Paid
              </div>
            )}
            {group.paidModels.map((m) => (
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
          {m.context && (
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
