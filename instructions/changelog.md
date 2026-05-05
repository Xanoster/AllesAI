# Changelog

This file is maintained by the agent. After every task that changes code, config, or project files, append a new entry at the top.

## Entry format

```
## [YYYY-MM-DD] <short title>
**Changed:** <what files/components were touched>
**Why:** <what the task was>
**Summary:** <what was actually done in 1-3 sentences>
```

---

## [2026-05-05] Browser OOM fix via non-persisted stream drafts
**Changed:** `src/lib/stream-drafts.ts` (new), `src/lib/chat-client.ts`, `src/components/ModelColumn.tsx`
**Why:** Streaming token deltas were being written to persisted chat history on every token, causing browser memory exhaustion.
**Summary:** Added a lightweight in-memory draft store for live stream output. Token deltas now write only to the draft store; a single commit to persisted history happens on finish/abort/error. Pending responses render as plain text instead of re-parsing Markdown every token.

## [2026-05-05] Agent instruction files setup
**Changed:** `.github/copilot-instructions.md` (new), `AGENTS.md` (new), `instructions/agent-behavior.md` (new), `instructions/commit-rules.md` (new)
**Why:** Establish consistent agent behavior rules across Copilot and Codex.
**Summary:** Created `instructions/` folder with behavior and commit rules. Set up auto-load entry points for GitHub Copilot (`.github/copilot-instructions.md`) and OpenAI Codex (`AGENTS.md`). Removed old root-level `.agent-commit-rules.md`.
