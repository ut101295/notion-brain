# Notion Brain

A Chrome extension that captures notes and to-dos from any webpage and stores them in Notion.

## Features

- Click extension icon to open/close a floating capture panel
- Two modes: `Notes` and `To-Do`
- Compact default UI with expandable `Additional options`
- Quick actions (`Bug`, `Idea`, `Read Later`, `Quote`)
- Templates (`YouTube`, `GitHub`, `Docs`)
- Pinned snippets (stored in `chrome.storage.local`)
- Auto-tags from URL/domain
- Duplicate guard for repeated submissions
- Optional screenshot attach (with panel hidden during capture)
- `Polish` button (LanguageTool)
- `Enrich` button (Microlink metadata)
- Keyboard shortcuts:
  - `Cmd/Ctrl+Shift+S` -> toggle panel
  - `Cmd/Ctrl+Enter` -> save

## Project Structure

- `manifest.json` - Chrome MV3 manifest
- `content.js` - UI, interactions, keyboard shortcuts, and messaging
- `background.js` - Notion write pipeline, screenshot upload, polish/enrich APIs, duplicate guard
- `styles.js` - Shadow DOM UI styles
- `config.example.js` - committed config template
- `config.js` - local Notion configuration (gitignored)
- `docs/README.md` - documentation index

## Quick Setup

1. Create local config:
   - `cp config.example.js config.js`
2. Update `config.js` with your Notion token and target parent IDs.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked` and select this project root.
6. Open any page and click the extension icon.

## Security Note

This is intentionally backendless for a pet project. Your Notion token is present in the extension bundle at runtime, so avoid using production or shared workspace secrets.
