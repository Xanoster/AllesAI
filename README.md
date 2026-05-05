# Alles AI — Compare LLMs side-by-side

**Alles AI** sends a single prompt to multiple AI models (GPT-4o, Claude 3.5, Gemini, Llama, DeepSeek, Qwen, Mistral, Grok, …) and streams their responses **side-by-side** in real time. Built as a portfolio project.

![status](https://img.shields.io/badge/status-active-brightgreen)
![next](https://img.shields.io/badge/Next.js-16-black)
![ts](https://img.shields.io/badge/TypeScript-5-blue)

## Features

- **Multi-model side-by-side chat** — fan a prompt out to N models in parallel
- **Token-by-token streaming** for every column independently (no head-of-line blocking)
- **Bring-Your-Own-Key (BYOK)** — your OpenRouter key is stored only in your browser's `localStorage`
- **100+ models** via [OpenRouter](https://openrouter.ai/) — including free-tier ones
- **Per-column multi-turn** — each model keeps its own thread; you can keep chatting after the first prompt
- **Markdown + syntax highlighting** for code-heavy responses
- **Vision input** — attach an image; vision-capable models receive it
- **Cost & token tracking** per response
- **Persistent history** in `localStorage` (sidebar with conversations)
- **Local Ollama mode** — flip a switch in Settings to route to `http://localhost:11434` instead of OpenRouter
- **Stop / regenerate / favorite / copy** controls per response

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **lucide-react** icons
- **Zustand** (with `persist`) for client state and chat history
- **react-markdown** + **rehype-highlight** for rendering
- **OpenRouter** unified chat completions API (Edge runtime SSE → NDJSON proxy)
- **Optional**: Ollama for local models

## Quick start

```bash
cd app
npm install
npm run dev
```

Open <http://localhost:3000>, click **Settings**, paste your OpenRouter key (get one at <https://openrouter.ai/keys>), then start chatting.

### Optional: server-side key

Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY` to provide a fallback key (so visitors don't need their own). Otherwise BYOK is required.

### Optional: Ollama

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull llama3.2:3b`
2. Open Settings → toggle **Use local Ollama**
3. In the model picker, **Add custom model id** with the local model name (e.g. `llama3.2:3b`)

## Architecture

```
Browser (Next.js page)
  ├── Zustand store (conversations, threads, settings) → localStorage
  └── For each selected model:
        POST /api/chat  ──────────────► OpenRouter / Ollama (SSE)
                       ◄── NDJSON ─── (delta / usage / done)
```

The `/api/chat` Edge route translates upstream SSE into a simple NDJSON stream the client parses line-by-line, updating the corresponding model's column in the Zustand store as deltas arrive.

## Roadmap

- [x] Phase 1 — Multi-model side-by-side streaming, BYOK, model picker
- [x] Phase 2 — Persistent multi-turn history, voting/favorites, copy, cost tracker, markdown
- [x] Phase 3 — Image input, Ollama toggle, conversation sidebar
- [ ] Supabase auth + cloud sync (optional)
- [ ] Shareable conversation links
- [ ] Diff / compare mode

## License

MIT
