// Copy this file to `config.js` and fill in your values.
// Do not commit `config.js`.
globalThis.CONFIG = Object.freeze({
  NOTION_TOKEN: "YOUR_NOTION_TOKEN",
  NOTES_PARENT_TYPE: "page", // "page" or "database"
  NOTES_DB_ID: "YOUR_NOTES_PARENT_ID",
  TODO_PARENT_TYPE: "page", // "page" or "database"
  TODO_DB_ID: "YOUR_TODO_PARENT_ID",
  // --- Text formatter (NVIDIA NIM, or any OpenAI-compatible endpoint) ---
  AI_API_KEY: "YOUR_NVIDIA_API_KEY",
  AI_BASE_URL: "https://integrate.api.nvidia.com/v1",
  AI_MODEL: "meta/llama-3.3-70b-instruct",
  AI_FALLBACK_MODELS: [],
  AI_TIMEOUT_MS: 60000,
  AI_MAX_TOKENS: 2000,
  AI_FORMATTER_MAX_RETRIES: 2,
  AI_RETRY_BASE_DELAY_MS: 1200,

  // --- Vision / screenshot-to-text (can use a different provider than the formatter) ---
  // Option A – Google Gemini Flash-Lite (recommended: 1,000 req/day free, fastest)
  //   AI_IMAGE_API_KEY: "YOUR_GOOGLE_AI_STUDIO_KEY",  // aistudio.google.com/apikey
  //   AI_IMAGE_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
  //   AI_VISION_MODEL: "gemini-2.5-flash-lite",  // or "gemini-2.5-flash" for better quality (250 RPD)
  // Option B – Groq (14,400 req/day free, very fast)
  //   AI_IMAGE_API_KEY: "YOUR_GROQ_API_KEY",
  //   AI_IMAGE_BASE_URL: "https://api.groq.com/openai/v1",
  //   AI_VISION_MODEL: "meta-llama/llama-4-scout-17b-16e-instruct",
  // Option C – Same provider as the formatter (default if AI_IMAGE_BASE_URL is omitted)
  AI_IMAGE_API_KEY: "YOUR_VISION_API_KEY",
  // AI_IMAGE_BASE_URL: "",  // omit to share AI_BASE_URL
  AI_VISION_ENABLED: true,
  AI_VISION_MODEL: "meta/llama-3.2-11b-vision-instruct",
  AI_VISION_MAX_TOKENS: 1024,
  AI_VISION_SOFT_DEADLINE_MS: 6500,
  AI_VISION_TIMEOUT_MS: 10000,
  AI_VISION_TEMPERATURE: 0.6,
  AI_VISION_ENABLE_THINKING: false,
  AI_VISION_OUTPUT_MAX_CHARS: 500,
  AI_VISION_MAX_IMAGE_WIDTH: 512,
  AI_VISION_IMAGE_QUALITY: 25,
  SCREENSHOT_QUALITY: 55,
  SCREENSHOT_MAX_WIDTH: 1440,
  NOTION_WRITE_TIMEOUT_MS: 30000,
  // Per-action Notion destinations (optional — falls back to NOTES/TODO parent above).
  // Uncomment and fill in to route specific capture actions to different pages/databases.
  // ACTION_DESTINATIONS: {
  //   bug:          { parentType: "database", parentId: "YOUR_BUG_DB_ID" },
  //   idea:         { parentType: "database", parentId: "YOUR_IDEA_DB_ID" },
  //   "read-later": { parentType: "page",     parentId: "YOUR_READING_PAGE_ID" },
  //   quote:        { parentType: "page",     parentId: "YOUR_QUOTES_PAGE_ID" },
  // },
  DEBUG_LOGS: false,
});
