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

## [2026-05-14] Fix duplicate score key collisions
**Changed:** `src/components/SharedResultsLane.tsx`
**Why:** Address PR review feedback about potentially colliding React keys in the quality score badges.
**Summary:** Updated score badge rendering to include the array index in the key string, preventing collisions when duplicate label/value pairs appear in the scorecard.

## [2026-05-12] Improve consensus and council quality
**Changed:** `src/app/api/consensus/route.ts`, `src/components/ConsensusButton.tsx`, `src/components/SharedResultsLane.tsx`, `src/lib/store.ts`, `src/lib/models.ts`, `README.md`
**Why:** Make consensus/council more useful by adding quality modes, better council moderation, clearer UX access, and current documentation.
**Summary:** Added quick/deep synthesis prompts with a quality rubric, dedicated council moderator routing, separate Consensus and Council actions, and stored confidence/score metadata. Updated the default synthesis model and README wording to match the current eligible-model behavior.

## [2026-05-12] Prepare remaining local changes for push
**Changed:** `AGENTS.md`, `instructions/commit-rules.md`, `src/app/page.tsx`
**Why:** Publish the remaining local changes without committing secret details or whitespace-only noise.
**Summary:** Replaced a PAT-specific note with a general secret-handling rule, corrected the feature-branch push rule wording, and removed trailing whitespace from the page entrypoint.

## [2026-05-12] Update direct dependencies
**Changed:** `package.json`, `package-lock.json`
**Why:** Bring the app's direct dependencies up to the latest npm releases.
**Summary:** Updated outdated runtime and dev dependencies, including React, Lucide, Tailwind, Zustand, TypeScript, and Node types. Refreshed the npm lockfile after installation, keeping ESLint on the latest compatible v9 release because ESLint 10 crashes with the current Next ESLint config.

## [2026-05-12] Make npm run dev the local-safe default
**Changed:** `package.json`, `README.md`
**Why:** Keep the normal developer command while avoiding the local freeze issue.
**Summary:** Updated `npm run dev` to use the local stability flags directly and removed the need to run a separate `dev:safe` command. Updated README instructions so the documented startup path is the standard `npm run dev`.

## [2026-05-12] Clarify safe run instructions
**Changed:** `README.md`
**Why:** Make the laptop-safe local run command the first documented path.
**Summary:** Updated Quick start to recommend `npm run dev:safe` from `app/` and moved `npm install` into a conditional step for missing or changed dependencies.

## [2026-05-12] Add low-impact local run guardrails
**Changed:** `.vscode/settings.json` (new), `package.json`, `tsconfig.json`, `README.md`
**Why:** Reduce VS Code and dev-server freeze risk on the user's laptop.
**Summary:** Added VS Code watcher/search exclusions for generated and dependency folders. Added a safer Webpack-based dev script bound to localhost, TypeScript watch exclusions, and README guidance for avoiding repeated installs and runaway local Node processes.

## [2026-05-05] Browser OOM fix via non-persisted stream drafts
**Changed:** `src/lib/stream-drafts.ts` (new), `src/lib/chat-client.ts`, `src/components/ModelColumn.tsx`
**Why:** Streaming token deltas were being written to persisted chat history on every token, causing browser memory exhaustion.
**Summary:** Added a lightweight in-memory draft store for live stream output. Token deltas now write only to the draft store; a single commit to persisted history happens on finish/abort/error. Pending responses render as plain text instead of re-parsing Markdown every token.

## [2026-05-05] Agent instruction files setup
**Changed:** `.github/copilot-instructions.md` (new), `AGENTS.md` (new), `instructions/agent-behavior.md` (new), `instructions/commit-rules.md` (new)
**Why:** Establish consistent agent behavior rules across Copilot and Codex.
**Summary:** Created `instructions/` folder with behavior and commit rules. Set up auto-load entry points for GitHub Copilot (`.github/copilot-instructions.md`) and OpenAI Codex (`AGENTS.md`). Removed old root-level `.agent-commit-rules.md`.
