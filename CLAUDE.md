# Notion Brain — AI Agent Context

Backendless Chrome extension (Manifest V3) that captures notes/todos from any webpage and saves them to Notion with AI formatting, screenshot vision, and offline queuing. **No build step. No test suite. No backend.**

---

## File Map

| File | Role |
|---|---|
| `manifest.json` | MV3 definition — permissions, content scripts, background worker |
| `config.example.js` | Committed config template |
| `config.js` | Local secrets — **gitignored, never commit** |
| `background.js` | Service worker — all network: AI, screenshots, Notion writes, queue |
| `content.js` | Content script — Shadow DOM panel UI, shortcuts, messaging |
| `styles.js` | Exports `getStyles()` — used inline in content.js for Shadow DOM `<style>` |
| `debug.html` / `debug-ui.js` | Extension page debug log viewer |

---

## Hard Invariants

1. **Non-blocking failures** — screenshot, vision, and AI failures must never abort the save. Always `try/catch`, log, and continue. The save pipeline always reaches the Notion write.
2. **Shadow DOM isolation** — all UI is inside a shadow root. Use `shadow.getElementById()`, never `document.getElementById()` in content.js.
3. **No inline scripts in extension HTML** — MV3 CSP blocks `<script>` blocks and `onclick=` attributes in `.html` files. All logic goes in external `.js` files.
4. **No `eval`, no dynamic `<script>` injection.**
5. **Content scripts cannot call network APIs** — all fetch calls go through `background.js` via `chrome.runtime.sendMessage`.
6. **Keyboard listener is capture phase** — `document.addEventListener("keydown", handler, true)` in content.js. This fires before page handlers (e.g. GitHub's `j` shortcut). Do not change to bubbling phase.
7. **`stopPropagation` on container** — `container.addEventListener("keydown", e => e.stopPropagation())` prevents typed characters from triggering page shortcuts. Do not remove.

---

## Config System

`globalThis.CONFIG` is populated by `importScripts("config.js")` in the service worker. Content scripts also receive `config.js` via the `content_scripts` manifest array. All constants are read at module load time — **reload extension at `chrome://extensions` after any config change**.

Key fields: `NOTION_TOKEN`, `NOTES_DB_ID`, `TODO_DB_ID`, `NOTES_PARENT_TYPE`, `TODO_PARENT_TYPE`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_IMAGE_API_KEY`, `AI_IMAGE_BASE_URL`, `AI_VISION_MODEL`, `AI_VISION_SOFT_DEADLINE_MS`, `ACTION_DESTINATIONS`, `DEBUG_LOGS`.

---

## Capture Actions

Extracted from `[prefix]` at the start of the note text by `extractCaptureAction()` (line 302). Values: `bug | idea | read-later | quote | generic`.

Todos are not a prefix — they come from `payload.type === "todo"` (the select dropdown). Both capture action and type affect block layout and Notion destination.

`ACTION_DESTINATIONS` in config optionally overrides the Notion parent per action:
```js
ACTION_DESTINATIONS: {
  bug: { parentType: "database", parentId: "..." },
}
```

---

## Save Pipeline (`saveToNotion`, line 1442)

```
isDuplicateCapture
  → captureVisibleTab + optimizeScreenshotDataUrl  (if screenshot requested)
  → uploadScreenshotToNotion
  → callAiImageToText with Promise.race(soft deadline)  (non-blocking vision)
  → callAiFormatter with retry + fallback models
  → buildAiNotionChildren → arrangeContentByCaptureAction
  → Notion API write (page append or database create)
  → on Notion failure: enqueueFailedSave
```

On startup and after each successful write, `processQueue()` (line 580) replays any queued failed saves.

---

## Key Functions

| Function | Line | What it does |
|---|---|---|
| `extractCaptureAction` | 302 | Parses `[Bug]`/`[Idea]`/etc. prefix from note text |
| `buildSourceBlocks` | 374 | Emits Notion `bookmark` blocks for source URLs |
| `enqueueFailedSave` | 566 | Appends a failed write to `chrome.storage.local` queue |
| `processQueue` | 580 | Replays queued saves one at a time |
| `buildAiMessages` | 854 | Builds system + user messages for AI formatter |
| `callAiImageToText` | 895 | Vision call (screenshot → plain text description) |
| `callAiFormatter` | 1041 | Text formatter with retry/fallback, returns parsed JSON |
| `toLeadEmoji` | 1179 | Maps capture action → emoji for callout icon |
| `buildMetadataRibbon` | 1269 | Gray metadata paragraph prepended to every saved page |
| `arrangeContentByCaptureAction` | 1279 | Prepends metadata ribbon; adds quote block for `[Quote]` |
| `buildAiNotionChildren` | 1292 | Converts AI JSON blocks → Notion API block objects |
| `saveToNotion` | 1442 | Full save pipeline entry point |

---

## AI Formatter Schema

**Input** (passed as `JSON.stringify` in the user message):
```json
{
  "type": "note|todo",
  "captureAction": "bug|idea|read-later|quote|generic",
  "note": "cleaned note text",
  "selectedText": "highlighted text if any",
  "url": "page url",
  "domain": "hostname",
  "title": "page title",
  "tags": ["#tag"],
  "screenshot": "has_screenshot|none",
  "screenshotInsight": "vision model output"
}
```

**Output** (JSON, parsed from AI response):
```json
{
  "title": "string (max 120 chars)",
  "screenshotPolicy": "include|omit|auto",
  "blocks": [
    { "type": "callout", "content": "string" },
    { "type": "heading", "content": "string" },
    { "type": "paragraph", "content": "string" },
    { "type": "bullets", "items": ["string"] }
  ],
  "tags": ["string"]
}
```

**Block rendering in `buildAiNotionChildren`:**
- `callout` → Notion callout with `icon: { type: "emoji", emoji: toLeadEmoji(captureAction) }`
- `heading` → `heading_3`
- `paragraph` → Notion paragraph
- `bullets` → `bulleted_list_item` or `to_do` (if action/type is todo)

---

## Message Contracts

### content.js → background.js

| Type | Key payload fields |
|---|---|
| `NOTION_BRAIN_SAVE` | `title, pageTitle, url, type, tags, includeScreenshot, selectedText` |
| `NOTION_BRAIN_PREVIEW` | `title, pageTitle, url, type, tags` |
| `NOTION_BRAIN_POLISH` | `text` |
| `NOTION_BRAIN_ENRICH` | `url` |
| `GET_DEBUG_LOGS` | `limit` |
| `CLEAR_DEBUG_LOGS` | — |
| `GET_QUEUE_STATUS` | — |

All return `{ ok: true, ... }` on success or `{ ok: false, error: "message" }` on failure.

### background.js → content.js (via `chrome.tabs.sendMessage`)

| Type | Payload |
|---|---|
| `NOTION_BRAIN_TOGGLE` | — |
| `NOTION_BRAIN_SCREENSHOT_VISIBILITY` | `{ hidden: bool }` |
| `NOTION_BRAIN_PROGRESS` | `{ stage: "screenshot_start|screenshot_done|vision_start|vision_done|ai_start|ai_done|notion_write" }` |

---

## Pitfalls

- **Never rethrow in the save pipeline** — if a step fails, log with `debugWarn`, set a result flag, and continue.
- **Vision is always a `Promise.race`** — `AI_VISION_SOFT_DEADLINE_MS` (default 6500ms) controls how long vision can delay the formatter. Do not make vision blocking.
- **`config.js` is gitignored** — `config.example.js` is the template. Never commit `config.js`.
- **No `document.getElementById` in content.js** — everything is inside a Shadow DOM; use `shadow.getElementById`.
- **Tags section** — tags are rendered as a gray paragraph at the end of every page. The AI can also suggest tags; both are merged.

---

## Verification

```bash
node --check background.js && node --check content.js && node --check styles.js && node --check debug-ui.js
```

Then reload at `chrome://extensions` and test manually in Chrome.
