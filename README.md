# Notion Brain

A backendless Chrome extension that captures notes and to-dos from any webpage and saves them to Notion — with AI formatting, screenshot support, and vision extraction.

## Demo

[Watch on YouTube](https://youtu.be/kpVwF9gMHN8)

## Features

- Floating capture panel with two modes: **Notes** and **To-Do**
- **AI formatting** — every save is structured by an LLM into clean Notion blocks (callout, headings, bullets, to-do checkboxes)
- **Action prefixes** — `[Bug]`, `[Idea]`, `[Read Later]`, `[Quote]` route and style content differently
- **Per-action destinations** — route each action type to a different Notion page or database
- **Screenshot attach** — captures the visible page, uploads to Notion, runs vision extraction for layout context
- **Vision extraction** — a separate vision model reads the screenshot and injects context into the AI formatter
- **Preview** — run AI formatting before saving to review the output
- **Pinned snippets** — reusable text fragments stored in extension storage
- **Quick capture** — `Cmd/Ctrl+Shift+E` saves the current page title to Notion without opening the panel
- **Selected text capture** — opening the panel pre-fills the textarea with any highlighted text
- **Polish** — LanguageTool grammar and style fixes
- **Enrich** — Microlink metadata fetch (title, description, domain)
- **Offline queue** — failed Notion writes are queued and retried on next save
- **Duplicate guard** — repeated identical saves are blocked

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+S` | Toggle panel |
| `Cmd/Ctrl+Enter` | Save current entry |
| `Cmd/Ctrl+Shift+E` | Quick-capture page title (no panel) |

## Setup

### 1. Create your Notion integration

Go to [notion.so/my-integrations](https://www.notion.so/my-integrations), create an internal integration, and copy the token.  
Share each target page or database with the integration.

### 2. Configure

```bash
cp config.example.js config.js
```

Edit `config.js` — at minimum:

```js
NOTION_TOKEN: "secret_...",
NOTES_PARENT_TYPE: "page",   // or "database"
NOTES_DB_ID: "your-page-or-db-id",
TODO_PARENT_TYPE: "page",
TODO_DB_ID: "your-page-or-db-id",
AI_API_KEY: "your-api-key",
```

`config.js` is gitignored and never committed.

### 3. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this project root
4. Click the extension icon on any page

## AI Provider Setup

The extension uses two separate AI calls: one for formatting (text-only) and one for vision (screenshot reading). They can use different providers.

**Text formatter** — any OpenAI-compatible endpoint. Default config uses [NVIDIA NIM](https://build.nvidia.com/):
```js
AI_BASE_URL: "https://integrate.api.nvidia.com/v1",
AI_MODEL: "meta/llama-3.3-70b-instruct",
```

**Vision** — recommended options (see `config.example.js` for full snippets):
- **Google Gemini Flash-Lite** — 1,000 req/day free, ~5-6s response
- **Groq** — 14,400 req/day free, very fast
- Same provider as formatter (default fallback)

## Project Structure

```
manifest.json       Chrome MV3 manifest
config.example.js   Config template (commit this)
config.js           Local secrets (gitignored)
background.js       Save pipeline: AI, screenshots, Notion writes, queue
content.js          Floating panel UI, shortcuts, messaging
styles.js           Shadow DOM styles
debug.html          Debug console (open via panel → Additional options)
debug-ui.js         Debug console logic
docs/
  SETUP.md          Detailed config reference
  ARCHITECTURE.md   Component and message reference
```

## External APIs

| API | Purpose |
|---|---|
| Notion API | Create pages and structured blocks |
| OpenAI-compatible LLM | AI formatter and vision extraction |
| LanguageTool | Polish action (grammar/style) |
| Microlink | Enrich action (page metadata) |

Screenshots are uploaded directly to Notion's file upload API — no third-party image hosts.

## Security Note

This is intentionally backendless. Your Notion token lives in the local `config.js` at runtime. Do not use a token scoped to a production or shared workspace.
