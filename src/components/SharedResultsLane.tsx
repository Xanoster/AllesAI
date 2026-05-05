"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  useChat,
  type CouncilMemberStatus,
  type CouncilRoundId,
  type SharedResult,
  type SharedResultType,
} from "@/lib/store";
import { Markdown } from "./Markdown";

const ROUND_ORDER: CouncilRoundId[] = ["opening", "critique", "convergence"];
const ROUND_TITLES: Record<CouncilRoundId, string> = {
  opening: "Opening",
  critique: "Critique",
  convergence: "Convergence",
  synthesis: "Final synthesis",
};

export function SharedResultsLane({ convId }: { convId: string }) {
  const conv = useChat((s) => s.conversations[convId]);
  const [tab, setTab] = useState<SharedResultType>("consensus");

  const results = useMemo(
    () => [...(conv?.sharedResults ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [conv?.sharedResults]
  );
  const consensusCount = results.filter((result) => result.type === "consensus").length;
  const councilCount = results.filter((result) => result.type === "council").length;
  const activeTab =
    tab === "consensus" && consensusCount === 0 && councilCount > 0
      ? "council"
      : tab === "council" && councilCount === 0 && consensusCount > 0
        ? "consensus"
        : tab;
  const visibleResults = results.filter((result) => result.type === activeTab).slice(0, 3);

  if (!conv || results.length === 0) return null;

  return (
    <section className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
          <TabButton
            active={activeTab === "consensus"}
            disabled={consensusCount === 0}
            icon={<Sparkles size={12} />}
            label={`Consensus ${consensusCount || ""}`.trim()}
            onClick={() => setTab("consensus")}
          />
          <TabButton
            active={activeTab === "council"}
            disabled={councilCount === 0}
            icon={<Users size={12} />}
            label={`Council ${councilCount || ""}`.trim()}
            onClick={() => setTab("council")}
          />
        </div>
        <div className="hidden items-center gap-1.5 text-[11px] text-[var(--fg-muted)] sm:flex">
          <Clock3 size={12} />
          Shared results
        </div>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-2">
        {visibleResults.map((result) => (
          <SharedResultCard key={result.id} result={result} />
        ))}
      </div>
    </section>
  );
}

export function SharedResultCard({
  result,
  compact = false,
}: {
  result: SharedResult;
  compact?: boolean;
}) {
  const isCouncil = result.type === "council";
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-[var(--bg-soft)] p-1 text-[var(--fg-muted)]">
            {isCouncil ? <Users size={13} /> : <Sparkles size={13} />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[var(--fg)]">
              {result.title}
            </div>
            <div className="text-[10px] text-[var(--fg-muted)]">
              {formatTime(result.createdAt)}
            </div>
          </div>
        </div>
        <ResultState result={result} />
      </div>

      <div className={compact ? "space-y-3 px-3 py-2" : "space-y-3 p-3"}>
        {result.error && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--error)]/40 bg-[var(--bg-soft)] px-2 py-1.5 text-xs text-[var(--error)]">
            <AlertCircle size={13} />
            {result.error}
          </div>
        )}

        {isCouncil ? <CouncilDebate result={result} /> : <ConsensusResult result={result} />}
      </div>
    </article>
  );
}

function TabButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition " +
        (active
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] disabled:opacity-40")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function ResultState({ result }: { result: SharedResult }) {
  if (result.pending) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">
        <Loader2 size={10} className="animate-spin" />
        running
      </span>
    );
  }
  if (result.error) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[var(--error)]/40 px-1.5 py-0.5 text-[10px] text-[var(--error)]">
        <AlertCircle size={10} />
        issue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 size={10} />
      done
    </span>
  );
}

function ConsensusResult({ result }: { result: SharedResult }) {
  if (!result.content.trim() && result.pending) {
    return <div className="text-xs text-[var(--fg-muted)]">Synthesizing best answer...</div>;
  }
  return <Markdown source={result.content} />;
}

function CouncilDebate({ result }: { result: SharedResult }) {
  return (
    <>
      {(result.statuses?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.statuses!.map((status) => (
            <span
              key={status.modelId}
              className={
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] " +
                statusClass(status.status)
              }
              title={status.message}
            >
              {status.model}
              <span className="text-[var(--fg-subtle)]">{statusLabel(status.status)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {ROUND_ORDER.map((round) => (
          <CouncilRoundBlock key={round} result={result} round={round} />
        ))}
      </div>

      {(result.content.trim() || result.pending) && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
            Final verdict
          </div>
          {result.content.trim() ? (
            <Markdown source={result.content} />
          ) : (
            <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
              <Loader2 size={13} className="animate-spin" />
              Synthesizing final verdict...
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CouncilRoundBlock({
  result,
  round,
}: {
  result: SharedResult;
  round: CouncilRoundId;
}) {
  const notes = (result.notes ?? []).filter((note) => note.round === round);
  const started = (result.rounds ?? []).some((entry) => entry.id === round);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-2 py-1.5">
        <div className="text-[11px] font-semibold text-[var(--fg)]">
          {ROUND_TITLES[round]}
        </div>
        {started && result.pending && notes.length === 0 && (
          <Loader2 size={12} className="animate-spin text-[var(--fg-muted)]" />
        )}
      </div>
      <div className="space-y-2 px-2 py-2">
        {notes.length === 0 ? (
          <div className="text-[11px] text-[var(--fg-muted)]">
            {started ? "Waiting for council notes..." : "Not started yet."}
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="border-l-2 border-[var(--border-strong)] pl-2">
              <div className="mb-1 text-[11px] font-semibold text-[var(--fg-muted)]">
                {note.model}
              </div>
              <div className="text-xs">
                <Markdown source={note.content} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function statusLabel(status: CouncilMemberStatus): string {
  if (status === "queued") return "queued";
  if (status === "running") return "reviewing";
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  return "replaced";
}

function statusClass(status: CouncilMemberStatus): string {
  if (status === "running") return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (status === "done") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "border-[var(--error)]/40 bg-[var(--bg-soft)] text-[var(--error)]";
  if (status === "replaced") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-[var(--border)] bg-[var(--bg-soft)] text-[var(--fg-muted)]";
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
