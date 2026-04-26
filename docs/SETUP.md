# Setup Reference

## Required config keys

| Key | Description |
|---|---|
| `NOTION_TOKEN` | Internal integration token from notion.so/my-integrations |
| `NOTES_PARENT_TYPE` | `"page"` or `"database"` |
| `NOTES_DB_ID` | Target page or database ID for notes |
| `TODO_PARENT_TYPE` | `"page"` or `"database"` |
| `TODO_DB_ID` | Target page or database ID for todos |
| `AI_API_KEY` | API key for the text formatter |

## AI config keys

| Key | Default | Description |
|---|---|---|
| `AI_BASE_URL` | NVIDIA NIM endpoint | Any OpenAI-compatible base URL |
| `AI_MODEL` | `meta/llama-3.3-70b-instruct` | Text formatter model |
| `AI_MAX_TOKENS` | `2000` | Max tokens for formatter response |
| `AI_TIMEOUT_MS` | `60000` | Formatter request timeout |
| `AI_FORMATTER_MAX_RETRIES` | `2` | Retry attempts on transient failure |
| `AI_RETRY_BASE_DELAY_MS` | `1200` | Base delay for exponential backoff |
| `AI_FALLBACK_MODELS` | `[]` | Fallback model IDs tried in order |

## Vision config keys

| Key | Default | Description |
|---|---|---|
| `AI_IMAGE_API_KEY` | Falls back to `AI_API_KEY` | Separate key for vision provider |
| `AI_IMAGE_BASE_URL` | Falls back to `AI_BASE_URL` | Separate base URL for vision provider |
| `AI_VISION_MODEL` | `meta/llama-3.2-11b-vision-instruct` | Vision model ID |
| `AI_VISION_ENABLED` | `true` | Disable to skip vision entirely |
| `AI_VISION_MAX_TOKENS` | `1024` | Max tokens for vision response |
| `AI_VISION_SOFT_DEADLINE_MS` | `6500` | Vision times out and save continues after this |
| `AI_VISION_TIMEOUT_MS` | `10000` | Hard HTTP timeout for vision request |
| `AI_VISION_MAX_IMAGE_WIDTH` | `512` | Image resized before sending to vision |
| `AI_VISION_IMAGE_QUALITY` | `25` | JPEG quality (1–100) for vision payload |
| `AI_VISION_TEMPERATURE` | `0.6` | Vision sampling temperature |
| `AI_VISION_OUTPUT_MAX_CHARS` | `500` | Max chars accepted from vision response |

## Screenshot config keys

| Key | Default | Description |
|---|---|---|
| `SCREENSHOT_QUALITY` | `55` | JPEG quality for the Notion-uploaded screenshot |
| `SCREENSHOT_MAX_WIDTH` | `1440` | Max width before downscaling |

## Routing and write config

| Key | Default | Description |
|---|---|---|
| `NOTION_WRITE_TIMEOUT_MS` | `30000` | Timeout for each Notion API write |
| `ACTION_DESTINATIONS` | `{}` | Per-action overrides for parent page/database |

`ACTION_DESTINATIONS` example:
```js
ACTION_DESTINATIONS: {
  bug:          { parentType: "database", parentId: "YOUR_BUG_DB_ID" },
  idea:         { parentType: "database", parentId: "YOUR_IDEA_DB_ID" },
  "read-later": { parentType: "page",     parentId: "YOUR_READING_PAGE_ID" },
  quote:        { parentType: "page",     parentId: "YOUR_QUOTES_PAGE_ID" },
},
```

## Debug

| Key | Default | Description |
|---|---|---|
| `DEBUG_LOGS` | `false` | Persist background events to IndexedDB |

When `DEBUG_LOGS: true`, open the debug console via **Additional options → Open debug console →** in the panel.

## Troubleshooting

- **Extension context invalidated** — reload extension at `chrome://extensions`, then refresh the tab.
- **`...is a page, not a database`** — parent type and ID don't match; verify in Notion.
- **Vision always skipped** — increase `AI_VISION_SOFT_DEADLINE_MS` (try `8000`) or switch to a faster vision provider (Groq).
- **Screenshot skipped** — note still saves; check debug console for the skip reason.
- **AI formatter fails** — check `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`; enable `DEBUG_LOGS` and inspect the console.
