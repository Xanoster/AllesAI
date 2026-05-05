"use client";

import { useMemo, useRef, useState } from "react";
import { useChat, type Conversation } from "@/lib/store";
import {
  Download,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { SettingsDialog } from "./SettingsDialog";

const STORAGE_WARN_BYTES = 4 * 1024 * 1024;

function dayBucket(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  if (ts >= todayStart) return "Today";
  if (ts >= yesterdayStart) return "Yesterday";
  if (ts >= weekStart) return "Previous 7 days";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function approximateBytes(value: unknown) {
  return new Blob([JSON.stringify(value)]).size;
}

export function Sidebar() {
  const conversations = useChat((s) => s.conversations);
  const activeId = useChat((s) => s.activeId);
  const setActive = useChat((s) => s.setActive);
  const newConversation = useChat((s) => s.newConversation);
  const deleteConversation = useChat((s) => s.deleteConversation);
  const clearConversations = useChat((s) => s.clearConversations);
  const importConversations = useChat((s) => s.importConversations);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const arr = Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query.trim()) return arr;
    const q = query.toLowerCase();
    return arr.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const c of list) {
      const k = dayBucket(c.updatedAt);
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [list]);

  const storageBytes = useMemo(() => approximateBytes(conversations), [conversations]);
  const showStorageWarning = storageBytes > STORAGE_WARN_BYTES;

  const exportChats = () => {
    const payload = {
      app: "Alles AI",
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `alles-ai-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importChats = (file?: File) => {
    setImportError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          conversations?: Record<string, Conversation>;
        };
        const incoming = parsed.conversations;
        if (!incoming || typeof incoming !== "object") {
          throw new Error("That file does not contain Alles AI conversations.");
        }
        importConversations(incoming);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
      } finally {
        if (importRef.current) importRef.current.value = "";
      }
    };
    reader.onerror = () => setImportError("Could not read that file.");
    reader.readAsText(file);
  };

  const confirmDelete = (id: string, title: string) => {
    if (window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      deleteConversation(id);
    }
  };

  const confirmClear = () => {
    if (window.confirm("Clear all conversations? This cannot be undone.")) {
      clearConversations();
    }
  };

  return (
    <aside
      className={
        "hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-soft)] transition-all duration-200 md:flex " +
        (collapsed ? "w-12" : "w-72")
      }
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 py-3">
          <button
            onClick={() => setCollapsed(false)}
            className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
          <button
            onClick={() => newConversation()}
            className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
            title="New chat"
          >
            <MessageSquarePlus size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
            <img src="/AllesAI.png" alt="Alles AI" className="h-8 w-auto origin-left scale-[2.0] object-contain mix-blend-multiply" />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                onClick={() => setCollapsed(true)}
                className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
          </div>

          <div className="px-2 pt-2">
            <button
              onClick={() => newConversation()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--border-strong)]"
            >
              <MessageSquarePlus size={13} /> New chat
            </button>
          </div>

          <div className="px-2 pt-2">
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-7 pr-2 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--border-strong)]"
              />
            </div>
          </div>

          {showStorageWarning && (
            <div className="mx-2 mt-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-700 dark:text-yellow-300">
              History is getting large. Export or clear old image-heavy chats soon.
            </div>
          )}
          {importError && (
            <div className="mx-2 mt-2 rounded-md border border-[var(--error)]/40 bg-[var(--bg)] px-2 py-1.5 text-[11px] text-[var(--error)]">
              {importError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 pb-2 pt-3">
            {list.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-[var(--fg-subtle)]">
                {query ? "No matches" : "No chats yet"}
              </p>
            )}
            {grouped.map(([bucket, items]) => (
              <div key={bucket} className="mb-3">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {bucket}
                </div>
                {items.map((c) => (
                  <div
                    key={c.id}
                    className={
                      "group mb-0.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--bg-elevated)] " +
                      (activeId === c.id ? "bg-[var(--bg-elevated)]" : "")
                    }
                  >
                    <button
                      onClick={() => setActive(c.id)}
                      className="min-w-0 flex-1 truncate text-left text-xs text-[var(--fg)]"
                      title={c.title}
                    >
                      {c.title}
                    </button>
                    <button
                      onClick={() => confirmDelete(c.id, c.title)}
                      className="rounded p-1 text-[var(--fg-subtle)] opacity-0 hover:bg-[var(--bg-soft)] hover:text-[var(--error)] group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-[var(--border)] px-3 py-3">
            <div className="flex gap-1">
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => importChats(e.target.files?.[0])}
              />
              <button
                onClick={exportChats}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--fg)] hover:border-[var(--border-strong)]"
              >
                <Download size={12} /> Export
              </button>
              <button
                onClick={() => importRef.current?.click()}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--fg)] hover:border-[var(--border-strong)]"
              >
                <Upload size={12} /> Import
              </button>
              <button
                onClick={confirmClear}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--error)]"
                title="Clear all chats"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <SettingsDialog />
          </div>
        </>
      )}
    </aside>
  );
}
