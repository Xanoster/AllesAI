"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useChat, useSettings } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar";
import { ModelColumn } from "@/components/ModelColumn";
import { Composer } from "@/components/Composer";
import { HeroComposer } from "@/components/HeroComposer";
import { ConsensusButton } from "@/components/ConsensusButton";
import { ModelPicker } from "@/components/ModelPicker";
import { ThemeApplier, ThemeToggle } from "@/components/ThemeToggle";
import { KeyRound } from "lucide-react";
import { isOllamaModelId } from "@/lib/models";

export default function Home() {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const setSelectedModels = useChat((s) => s.setSelectedModels);
  const dragSrc = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const conversations = useChat((s) => s.conversations);
  const activeId = useChat((s) => s.activeId);
  const newConversation = useChat((s) => s.newConversation);
  const apiKey = useSettings((s) => s.apiKey);
  const geminiApiKey = useSettings((s) => s.geminiApiKey);

  const handleDragStart = (id: string) => {
    dragSrc.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragSrc.current && dragSrc.current !== id) setDragOverId(id);
  };

  const handleDrop = (targetId: string) => {
    const src = dragSrc.current;
    dragSrc.current = null;
    setDragOverId(null);
    if (!src || src === targetId || !conv) return;
    const order = [...conv.selectedModels];
    const from = order.indexOf(src);
    const to = order.indexOf(targetId);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, src);
    setSelectedModels(conv.id, order);
  };

  // Auto-create a conversation if none exists.
  useEffect(() => {
    if (!mounted) return;
    if (!activeId || !conversations[activeId]) {
      newConversation();
    }
  }, [mounted, activeId, conversations, newConversation]);

  if (!mounted) return null;

  const conv = activeId ? conversations[activeId] : null;
  const needsGroqKey =
    !!conv &&
    !apiKey &&
    conv.selectedModels.some((id) => !id.startsWith("gemini") && !isOllamaModelId(id));
  const needsGeminiKey =
    !!conv &&
    !geminiApiKey &&
    conv.selectedModels.some((id) => id.startsWith("gemini"));

  // Determine if the conversation has any messages yet - if not, show the hero
  const hasMessages = !!conv && conv.selectedModels.some(
    (id) => (conv.threads[id]?.messages.length ?? 0) > 0
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <ThemeApplier />
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-soft)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <img src="/AllesAI.png" alt="Alles AI" className="h-7 w-auto object-contain mix-blend-multiply scale-[2.0] origin-left" />
          </div>
          <div className="hidden min-w-0 items-baseline gap-2 md:flex">
            <h1 className="truncate text-base font-semibold text-[var(--fg)]">
              {conv?.title ?? "Alles AI"}
            </h1>
            <span className="truncate text-xs text-[var(--fg-muted)]">
              {conv
                ? conv.focusedModel
                  ? "- Focused on 1 model"
                  : `- ${conv.selectedModels.length} model${conv.selectedModels.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {conv && <ModelPicker convId={conv.id} />}
            <div className="md:hidden">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {(needsGroqKey || needsGeminiKey) && (
          <div className="flex items-center gap-2 border-b border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-300">
            <KeyRound size={14} />
            <span>
              Add your {needsGroqKey && needsGeminiKey ? "Groq and Gemini API keys" : needsGroqKey ? "Groq API key" : "Gemini API key"} in Settings to use selected cloud models.
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
            <div className="flex min-h-0 flex-1 divide-x divide-[var(--border)] overflow-x-auto">
              {(conv.focusedModel
                ? [conv.focusedModel]
                : conv.selectedModels
              ).map((id) => (
                <ModelColumn
                  key={id}
                  convId={conv.id}
                  modelId={id}
                  onDragStart={() => handleDragStart(id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDrop={() => handleDrop(id)}
                  isDragOver={dragOverId === id}
                />
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
