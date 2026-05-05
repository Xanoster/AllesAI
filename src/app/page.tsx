"use client";

import { useEffect, useState } from "react";
import { useChat, useSettings } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar";
import { ModelColumn } from "@/components/ModelColumn";
import { Composer } from "@/components/Composer";
import { ModelPicker } from "@/components/ModelPicker";
import { HeroComposer } from "@/components/HeroComposer";
import { ConsensusButton } from "@/components/ConsensusButton";
import { ThemeApplier, ThemeToggle } from "@/components/ThemeToggle";
import { KeyRound, Sparkles } from "lucide-react";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const conversations = useChat((s) => s.conversations);
  const activeId = useChat((s) => s.activeId);
  const newConversation = useChat((s) => s.newConversation);
  const apiKey = useSettings((s) => s.apiKey);
  const useOllama = useSettings((s) => s.useOllama);

  // Auto-create a conversation if none exists.
  useEffect(() => {
    if (!mounted) return;
    if (!activeId || !conversations[activeId]) {
      newConversation();
    }
  }, [mounted, activeId, conversations, newConversation]);

  if (!mounted) return null;

  const conv = activeId ? conversations[activeId] : null;
  const needsKey = !useOllama && !apiKey;

  // Determine if the conversation has any messages yet — if not, show the hero
  const hasMessages = !!conv && conv.selectedModels.some(
    (id) => (conv.threads[id]?.messages.length ?? 0) > 0
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <ThemeApplier />
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-soft)] px-4 py-2">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <div className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 p-1 text-white">
              <Sparkles size={12} />
            </div>
            <span className="text-sm font-semibold">Alles AI</span>
          </div>
          <div className="hidden min-w-0 md:block">
            <h1 className="truncate text-sm font-semibold text-[var(--fg)]">
              {conv?.title ?? "Alles AI"}
            </h1>
            <p className="truncate text-[11px] text-[var(--fg-muted)]">
              {conv
                ? conv.focusedModel
                  ? "Focused on 1 model"
                  : `${conv.selectedModels.length} model${conv.selectedModels.length === 1 ? "" : "s"} side-by-side`
                : "Multi-model chat"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {conv && <ModelPicker convId={conv.id} />}
            <div className="md:hidden">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {needsKey && (
          <div className="flex items-center gap-2 border-b border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-300">
            <KeyRound size={14} />
            <span>
              Add your OpenRouter API key in Settings to start chatting. Free models still require a key.
            </span>
          </div>
        )}

        {conv && conv.selectedModels.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--fg-muted)]">
            No models selected. Open <strong className="mx-1">Models</strong> above to pick some.
          </div>
        )}

        {conv && conv.selectedModels.length > 0 && !hasMessages && (
          <HeroComposer convId={conv.id} />
        )}

        {conv && conv.selectedModels.length > 0 && hasMessages && (
          <>
            <div className="flex flex-1 gap-3 overflow-x-auto p-3">
              {(conv.focusedModel
                ? [conv.focusedModel]
                : conv.selectedModels
              ).map((id) => (
                <ModelColumn key={id} convId={conv.id} modelId={id} />
              ))}
              {/* When focused, show ghost preview of others as small read-only column? Skip for now. */}
            </div>
            <Composer convId={conv.id} />
            <ConsensusButton convId={conv.id} />
          </>
        )}
      </main>
    </div>
  );
}
