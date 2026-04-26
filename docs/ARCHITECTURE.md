# Architecture

## Runtime Components

**`content.js`** — injected into every page as a Shadow DOM floating panel
- Handles UI, keyboard shortcuts, quick actions, pinned snippets
- Pre-fills textarea from selected text on panel open
- Suppresses itself during screenshot capture
- Sends messages to `background.js` and receives progress updates

**`background.js`** — MV3 service worker, handles all network calls
- Duplicate fingerprint guard (IndexedDB)
- Screenshot capture → optimize → Notion file upload
- Vision extraction with soft deadline (`Promise.race`)
- AI formatter with retry and fallback model support
- Notion block builder (per action type, with emoji callouts, bookmark sources, to-do blocks)
- Offline save queue — failed writes stored in `chrome.storage.local` and retried
- Polish (LanguageTool) and Enrich (Microlink) handlers
- Optional debug log persistence to IndexedDB

**`styles.js`** — exports `getStyles()` for the Shadow DOM `<style>` tag

**`config.js`** — local secrets, gitignored; `config.example.js` is the committed template

**`debug.html` / `debug-ui.js`** — standalone extension page for viewing and clearing debug logs

## Save Pipeline

```
User submits
  → duplicate fingerprint check
  → screenshot capture + Notion file upload  (if requested)
  → vision extraction with soft deadline      (non-blocking)
  → AI formatter with retry/fallback          (always attempted)
  → Notion block builder
  → Notion API write (page or database)
  → on failure: enqueue for retry
```

All failures (screenshot, vision, AI) are non-blocking — the save always proceeds.

## Message Types

| Message | Direction | Description |
|---|---|---|
| `NOTION_BRAIN_TOGGLE` | background → content | Show/hide panel |
| `NOTION_BRAIN_SCREENSHOT_VISIBILITY` | background → content | Suppress panel for screenshot |
| `NOTION_BRAIN_PROGRESS` | background → content | Pipeline stage label updates |
| `NOTION_BRAIN_SAVE` | content → background | Full save request |
| `NOTION_BRAIN_PREVIEW` | content → background | Run AI formatter only, return preview |
| `NOTION_BRAIN_POLISH` | content → background | LanguageTool polish |
| `NOTION_BRAIN_ENRICH` | content → background | Microlink metadata fetch |
| `GET_DEBUG_LOGS` | content/debug → background | Retrieve stored log entries |
| `CLEAR_DEBUG_LOGS` | content/debug → background | Wipe log store |
| `GET_QUEUE_STATUS` | content → background | Return count of queued saves |
