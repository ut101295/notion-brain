# Setup

## 1. Configure Notion

Create local config from template:

```bash
cp config.example.js config.js
```

Then edit `config.js`:

- `NOTION_TOKEN`: your internal integration token
- `NOTES_PARENT_TYPE`: `"page"` or `"database"`
- `NOTES_DB_ID`: ID for notes target parent
- `TODO_PARENT_TYPE`: `"page"` or `"database"`
- `TODO_DB_ID`: ID for todo target parent

Important:

- `config.js` is local-only and gitignored.
- If parent type is `"page"`, the ID must be a page ID.
- If parent type is `"database"`, the ID must be a database ID.
- Share those pages/databases with your Notion integration.

## 2. Load Extension

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project root

## 3. Use

1. Click extension icon to toggle panel
2. Enter note/todo content
3. Optionally open `Additional options`
4. Click `Save to Notion`

## 4. Helpful shortcuts

- `Cmd/Ctrl+Shift+S` -> toggle panel
- `Cmd/Ctrl+Enter` -> save current entry

## 5. Troubleshooting

- `Extension context invalidated`: reload extension and refresh current tab.
- `...is a page, not a database`: parent type and ID do not match.
- Screenshot skipped: free uploader may be blocked/timed out; note still saves.
