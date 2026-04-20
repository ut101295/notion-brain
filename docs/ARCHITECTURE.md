# Architecture

## Runtime Components

- `content.js`
  - renders floating panel in Shadow DOM
  - handles quick actions, templates, snippets, shortcuts
  - sends save/polish/enrich requests to background worker
  - hides UI during screenshot capture when requested by background worker

- `background.js`
  - processes all save requests
  - writes structured blocks/pages to Notion API
  - handles duplicate guard (`chrome.storage.local`)
  - calls third-party APIs:
    - LanguageTool (`Polish`)
    - Microlink (`Enrich`)
    - screenshot upload (`0x0`, fallback `catbox`)

- `styles.js`
  - visual system for compact panel + expandable advanced options

- `config.js`
  - local constants for Notion auth and parent routing

## Message Types

- `NOTION_BRAIN_SAVE`
- `NOTION_BRAIN_POLISH`
- `NOTION_BRAIN_ENRICH`
- `NOTION_BRAIN_TOGGLE`
- `NOTION_BRAIN_SCREENSHOT_VISIBILITY`

## Save Pipeline Summary

1. Content script collects input and options.
2. Background script checks duplicate fingerprint.
3. Optional screenshot capture/upload runs.
4. Notion payload is generated based on mode + parent type.
5. Save response includes screenshot diagnostics for UI status.
