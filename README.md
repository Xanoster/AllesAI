# Alles AI — Compare LLMs side-by-side

**Alles AI** sends a single prompt to multiple free AI models and streams their responses **side-by-side** in real time.

![status](https://img.shields.io/badge/status-active-brightgreen)
![next](https://img.shields.io/badge/Next.js-16-black)
![ts](https://img.shields.io/badge/TypeScript-5-blue)

## Models

| Model | Provider | Context | Notes |
|---|---|---|---|
| GPT-OSS 120B | OpenAI (via Groq) | 128K | General |
| Llama 4 Scout 17B | Meta (via Groq) | 128K | Vision |
| Qwen3 32B | Qwen (via Groq) | 128K | General |
| Gemini 2.5 Flash Lite | Google | 1M | Vision |

All models are **free**. Groq models require a [Groq API key](https://console.groq.com). Gemini requires a [Google AI Studio key](https://aistudio.google.com/api-keys).

## Features

- **Multi-model side-by-side chat** — fan a prompt out to all selected models in parallel
- **Token-by-token streaming** per column independently
- **BYOK** — API keys stored only in your browser's `localStorage`, never on a server
- **Per-column multi-turn** — each model keeps its own conversation thread
- **Focus mode** — click the focus icon on any column to direct further prompts to one model only
- **Pause / resume columns** — toggle individual models on/off without losing their history
- **Drag to reorder** columns
- **Consensus answer** — synthesizes all model responses into one best answer (powered by Llama 3.3 70B on Groq)
- **Thinking block** — collapsible `<think>` reasoning display for models that support it
- **Markdown + syntax highlighting** for code-heavy responses
- **Vision input** — attach an image; vision-capable models receive it
- **Persistent history** in `localStorage` — full conversation sidebar with search
- **Dark / light theme**
- **Stop streaming** per-column or globally

## Tech stack

- **Next.js 16** (App Router, Edge runtime) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **lucide-react** icons
- **Zustand 5** (with `persist`) for client state and chat history
- **react-markdown** + **remark-gfm** + **rehype-highlight** for rendering
- **Groq** chat completions API (OpenAI-compatible, SSE → NDJSON proxy)
- **Google Gemini** native streaming API (SSE → NDJSON proxy)

## Quick start

```bash
cd app
npm install
npm run dev
```

Open <http://localhost:3000>, click **Settings**, add your API keys, then start chatting.

### Environment variables (optional server-side keys)

Create `.env.local` in the `app/` folder:

```env
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
```

If set, these act as fallback keys so visitors don't need their own. Client-provided keys (from Settings) always take priority.

## Architecture

```
Browser (Next.js page)
  ├── Zustand store (conversations, threads, settings) → localStorage
  └── For each selected model:
        POST /api/chat  ──────────────► Groq / Gemini (SSE)
                       ◄── NDJSON ─── (delta | usage | done | error)

  Consensus:
        POST /api/consensus ──────────► Groq: llama-3.3-70b-versatile (SSE)
                            ◄── NDJSON (delta | done)
```

- `/api/chat` — routes to Groq (OpenAI-compatible) or Gemini native API based on model ID prefix
- `/api/consensus` — takes all model responses, synthesizes a best answer via Llama 3.3 70B

## Project structure

```
src/
  app/
    page.tsx              # Main UI shell
    layout.tsx            # Root layout + fonts
    globals.css           # Theme tokens + markdown styles
    api/
      chat/route.ts       # Streaming proxy → Groq / Gemini
      consensus/route.ts  # Consensus synthesis endpoint
  components/
    Composer.tsx          # Bottom chat input bar
    HeroComposer.tsx      # First-prompt landing screen
    ConsensusButton.tsx   # Floating consensus trigger + panel
    ModelColumn.tsx       # Per-model response column
    ModelPicker.tsx       # Model selection dialog
    ProviderIcon.tsx      # Brand icon tiles
    SettingsDialog.tsx    # API key + system prompt settings
    Sidebar.tsx           # Conversation history sidebar
    ThemeToggle.tsx       # Dark/light toggle + applier
    Markdown.tsx          # Memoized markdown renderer
  lib/
    models.ts             # Model catalog + provider groups
    providers.ts          # Provider metadata
    store.ts              # Zustand store (settings + chat state)
    chat-client.ts        # Streaming fetch logic + abort control
    utils.ts              # cn() + uid()
```

## License

MIT
