importScripts("config.js");

const DEDUPE_STORAGE_KEY = "nb_saved_fingerprints";
const DEDUPE_MAX_ITEMS = 200;
const SCREENSHOT_UPLOAD_TIMEOUT_MS = 30000;
const AI_FORMATTER_TIMEOUT_MS = Number(
  globalThis.CONFIG?.AI_TIMEOUT_MS || 60000,
);
const AI_MAX_TOKENS = Number(globalThis.CONFIG?.AI_MAX_TOKENS || 2000);
const AI_VISION_ENABLED = globalThis.CONFIG?.AI_VISION_ENABLED !== false;
const AI_VISION_MODEL = String(
  globalThis.CONFIG?.AI_VISION_MODEL || "meta/llama-3.2-11b-vision-instruct",
);
const AI_VISION_MAX_TOKENS = Number(
  globalThis.CONFIG?.AI_VISION_MAX_TOKENS || 1024,
);
const AI_VISION_TIMEOUT_MS = Number(
  globalThis.CONFIG?.AI_VISION_TIMEOUT_MS || 10000,
);
const AI_VISION_TEMPERATURE = Number(
  globalThis.CONFIG?.AI_VISION_TEMPERATURE || 0.6,
);
const AI_VISION_ENABLE_THINKING =
  globalThis.CONFIG?.AI_VISION_ENABLE_THINKING === true;
const AI_VISION_OUTPUT_MAX_CHARS = Number(
  globalThis.CONFIG?.AI_VISION_OUTPUT_MAX_CHARS || 500,
);
const AI_VISION_MAX_IMAGE_WIDTH = Number(
  globalThis.CONFIG?.AI_VISION_MAX_IMAGE_WIDTH || 512,
);
const AI_VISION_IMAGE_QUALITY = Number(
  globalThis.CONFIG?.AI_VISION_IMAGE_QUALITY || 25,
);
const AI_FORMATTER_MAX_RETRIES = Number(
  globalThis.CONFIG?.AI_FORMATTER_MAX_RETRIES || 2,
);
const AI_RETRY_BASE_DELAY_MS = Number(
  globalThis.CONFIG?.AI_RETRY_BASE_DELAY_MS || 1200,
);
const AI_FALLBACK_MODELS = Array.isArray(globalThis.CONFIG?.AI_FALLBACK_MODELS)
  ? globalThis.CONFIG.AI_FALLBACK_MODELS.filter(Boolean).map(String)
  : [];
const SCREENSHOT_QUALITY = Number(globalThis.CONFIG?.SCREENSHOT_QUALITY || 55);
const SCREENSHOT_MAX_WIDTH = Number(
  globalThis.CONFIG?.SCREENSHOT_MAX_WIDTH || 1440,
);
const NOTION_WRITE_TIMEOUT_MS = Number(
  globalThis.CONFIG?.NOTION_WRITE_TIMEOUT_MS || 30000,
);
const ACTION_DESTINATIONS =
  typeof globalThis.CONFIG?.ACTION_DESTINATIONS === "object" &&
  globalThis.CONFIG.ACTION_DESTINATIONS !== null
    ? globalThis.CONFIG.ACTION_DESTINATIONS
    : {};
const SAVE_QUEUE_KEY = "nb_save_queue";
const SAVE_QUEUE_MAX = 20;
const DEFAULT_AI_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_AI_MODEL = "meta/llama-3.3-70b-instruct";
const NOTION_API_VERSION = "2022-06-28";
const NOTION_FILE_UPLOAD_VERSION = "2026-03-11";
const DEBUG_LOGS = globalThis.CONFIG?.DEBUG_LOGS !== false;
const DEBUG_LOGS_DB = "NotionBrainDebugLogs";
const DEBUG_LOGS_STORE = "logs";
const DEBUG_LOGS_MAX_ENTRIES = 500;

let _debugLogsDb = null;

async function _openDebugLogsDb() {
  if (_debugLogsDb) return _debugLogsDb;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEBUG_LOGS_DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      _debugLogsDb = req.result;
      resolve(_debugLogsDb);
    };
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DEBUG_LOGS_STORE)) {
        db.createObjectStore(DEBUG_LOGS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
  });
}

async function _persistDebugLog(timestamp, level, event, details) {
  if (!DEBUG_LOGS) return;
  try {
    const db = await _openDebugLogsDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(DEBUG_LOGS_STORE, "readwrite");
      const store = tx.objectStore(DEBUG_LOGS_STORE);
      const req = store.add({ timestamp, level, event, details });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction(DEBUG_LOGS_STORE, "readwrite");
      const store = tx.objectStore(DEBUG_LOGS_STORE);
      const countReq = store.count();
      countReq.onerror = () => reject(countReq.error);
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count <= DEBUG_LOGS_MAX_ENTRIES) {
          resolve();
          return;
        }
        const excess = count - DEBUG_LOGS_MAX_ENTRIES;
        let deleted = 0;
        const cursorReq = store.openCursor();
        cursorReq.onerror = () => reject(cursorReq.error);
        cursorReq.onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (cursor && deleted < excess) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve();
          }
        };
      };
    });
  } catch (err) {
    console.error("[NotionBrain] Debug log DB error:", err);
  }
}

async function getDebugLogs(limit = 100) {
  try {
    const db = await _openDebugLogsDb();
    const tx = db.transaction(DEBUG_LOGS_STORE, "readonly");
    const store = tx.objectStore(DEBUG_LOGS_STORE);

    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const logs = req.result;
        resolve(logs.slice(-limit));
      };
    });
  } catch (err) {
    return [];
  }
}

function debugLog(event, details) {
  if (!DEBUG_LOGS) return;
  const timestamp = new Date().toISOString();
  if (typeof details === "undefined") {
    console.log(`[NotionBrain][background] ${event}`);
  } else {
    console.log(`[NotionBrain][background] ${event}`, details);
  }
  _persistDebugLog(timestamp, "log", event, details);
}

function debugWarn(event, details) {
  if (!DEBUG_LOGS) return;
  const timestamp = new Date().toISOString();
  if (typeof details === "undefined") {
    console.warn(`[NotionBrain][background] ${event}`);
  } else {
    console.warn(`[NotionBrain][background] ${event}`, details);
  }
  _persistDebugLog(timestamp, "warn", event, details);
}

async function fetchWithLog(url, options, label) {
  const method = options?.method || "GET";
  debugLog("HTTP:start", { label, method, url });
  const response = await fetch(url, options);
  debugLog("HTTP:end", { label, status: response.status, ok: response.ok });
  return response;
}

function buildImageBlockFromAttachment(attachment) {
  if (!attachment) {
    return null;
  }

  if (attachment.fileUploadId) {
    return {
      object: "block",
      type: "image",
      image: {
        type: "file_upload",
        file_upload: {
          id: attachment.fileUploadId,
        },
      },
    };
  }

  if (attachment.url) {
    return {
      object: "block",
      type: "image",
      image: {
        type: "external",
        external: {
          url: attachment.url,
        },
      },
    };
  }

  return null;
}

function buildScreenshotBlocks(attachment, includeLabel) {
  const imageBlock = buildImageBlockFromAttachment(attachment);
  if (!imageBlock) {
    return [];
  }

  const blocks = [];
  if (includeLabel) {
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: attachment.url
              ? {
                  content: "Screenshot",
                  link: { url: attachment.url },
                }
              : {
                  content: "Screenshot attached",
                },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "gray",
            },
          },
        ],
      },
    });
  }

  blocks.push(imageBlock);
  return blocks;
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function hashString(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function normalizeText(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractCaptureAction(title) {
  const value = String(title || "").trim();
  const match = value.match(/^\[(bug|idea|read\s*later|quote)\]\s*/i);
  if (!match) {
    return "generic";
  }

  const normalized = String(match[1] || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (normalized === "read-later") return "read-later";
  if (normalized === "bug") return "bug";
  if (normalized === "idea") return "idea";
  if (normalized === "quote") return "quote";
  return "generic";
}

function stripCaptureActionPrefix(title) {
  return String(title || "")
    .replace(/^\[(bug|idea|read\s*later|quote)\]\s*/i, "")
    .trim();
}


function shouldRenderScreenshot({
  screenshotAttachment,
  captureAction,
  noteText,
  aiScreenshotPolicy,
}) {
  if (!screenshotAttachment) {
    return false;
  }

  if (aiScreenshotPolicy === "omit") {
    return false;
  }
  if (aiScreenshotPolicy === "include") {
    return true;
  }

  if (captureAction === "bug" || captureAction === "read-later") {
    return true;
  }

  const visualHints =
    /(screenshot|image|ui|layout|design|visual|error|trace|stack|preview|screen)/i;
  return visualHints.test(String(noteText || ""));
}

function extractSourceUrls(text, primaryUrl) {
  const input = String(text || "");
  const markdownSources = [];
  const rawSources = [];
  const inlinePattern = /https?:\/\/[^\s)\]]+/gi;
  const markdownPattern = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi;

  let markdownMatch = markdownPattern.exec(input);
  while (markdownMatch) {
    markdownSources.push(markdownMatch[1]);
    markdownMatch = markdownPattern.exec(input);
  }

  let inlineMatch = inlinePattern.exec(input);
  while (inlineMatch) {
    rawSources.push(inlineMatch[0]);
    inlineMatch = inlinePattern.exec(input);
  }

  return uniqueStrings([primaryUrl, ...markdownSources, ...rawSources]);
}

function buildSourceBlocks(sources) {
  if (!sources.length) {
    return [];
  }

  return sources.map((source) => ({
    object: "block",
    type: "bookmark",
    bookmark: {
      url: source,
      caption: [],
    },
  }));
}

function buildFingerprint({ type, title, url }) {
  const normalized = `${type}||${normalizeText(title).toLowerCase()}||${String(url || "").toLowerCase()}`;
  return hashString(normalized);
}

async function isDuplicateCapture(payload) {
  const fingerprint = buildFingerprint(payload);
  const result = await storageGet([DEDUPE_STORAGE_KEY]);
  const existing = Array.isArray(result[DEDUPE_STORAGE_KEY])
    ? result[DEDUPE_STORAGE_KEY]
    : [];
  const isDuplicate = existing.includes(fingerprint);
  return { isDuplicate, fingerprint, existing };
}

async function recordFingerprint(fingerprint, existing) {
  const next = [
    fingerprint,
    ...existing.filter((item) => item !== fingerprint),
  ].slice(0, DEDUPE_MAX_ITEMS);
  await storageSet({ [DEDUPE_STORAGE_KEY]: next });
}

function applyLanguageToolSuggestions(text, matches) {
  const sorted = [...matches].sort((a, b) => b.offset - a.offset);
  let output = text;

  for (const match of sorted) {
    const replacement = match?.replacements?.[0]?.value;
    if (!replacement) {
      continue;
    }
    const start = match.offset;
    const end = start + match.length;
    output = `${output.slice(0, start)}${replacement}${output.slice(end)}`;
  }

  return output;
}

function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId,
      {
        format: "jpeg",
        quality: Math.max(10, Math.min(95, SCREENSHOT_QUALITY)),
      },
      (dataUrl) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        if (!dataUrl) {
          reject(new Error("Could not capture screenshot."));
          return;
        }
        resolve(dataUrl);
      },
    );
  });
}

async function optimizeScreenshotDataUrl(dataUrl, options = {}) {
  const qualityPercent = Number(
    typeof options.quality === "number" ? options.quality : SCREENSHOT_QUALITY,
  );
  const maxWidthPx = Number(
    typeof options.maxWidth === "number"
      ? options.maxWidth
      : SCREENSHOT_MAX_WIDTH,
  );
  const quality = Math.max(10, Math.min(95, qualityPercent)) / 100;
  const maxWidth = Math.max(0, Math.floor(maxWidthPx));

  if (
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return dataUrl;
  }

  const sourceBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(sourceBlob);

  const shouldDownscale = maxWidth > 0 && bitmap.width > maxWidth;
  const targetWidth = shouldDownscale ? maxWidth : bitmap.width;
  const targetHeight = shouldDownscale
    ? Math.max(1, Math.round((bitmap.height * targetWidth) / bitmap.width))
    : bitmap.height;

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return dataUrl;
  }

  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const optimizedBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality,
  });

  const optimizedDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || dataUrl));
    reader.onerror = () => reject(new Error("Failed to encode screenshot"));
    reader.readAsDataURL(optimizedBlob);
  });

  return String(optimizedDataUrl || dataUrl);
}

function estimateDataUrlBytes(dataUrl) {
  const value = String(dataUrl || "");
  const comma = value.indexOf(",");
  if (comma < 0) return 0;
  const payload = value.slice(comma + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function summarizeDataUrl(dataUrl) {
  const value = String(dataUrl || "");
  const comma = value.indexOf(",");
  const header = comma >= 0 ? value.slice(0, comma) : "";
  const payload = comma >= 0 ? value.slice(comma + 1) : "";
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mime = mimeMatch?.[1] || "";
  const base64Length = payload.length;
  const likelyBase64 = /^[a-z0-9+/=]+$/i.test(payload.slice(0, 1200));
  return {
    hasDataPrefix: value.startsWith("data:"),
    hasComma: comma >= 0,
    isBase64Header: /;base64$/i.test(header),
    mime,
    base64Length,
    base64LengthMod4: base64Length % 4,
    likelyBase64,
    estimatedBytes: estimateDataUrlBytes(value),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendTabMessage(tabId, payload) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve({ ok: false, reason: "missing_tab_id" });
      return;
    }
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, reason: error.message });
        return;
      }
      resolve({ ok: true, response });
    });
  });
}

function sendProgressToTab(tabId, stage) {
  if (!tabId) return;
  chrome.tabs.sendMessage(
    tabId,
    { type: "NOTION_BRAIN_PROGRESS", stage },
    () => void chrome.runtime.lastError,
  );
}

async function enqueueFailedSave(item) {
  try {
    const result = await storageGet([SAVE_QUEUE_KEY]);
    const queue = Array.isArray(result[SAVE_QUEUE_KEY])
      ? result[SAVE_QUEUE_KEY]
      : [];
    const next = [item, ...queue].slice(0, SAVE_QUEUE_MAX);
    await storageSet({ [SAVE_QUEUE_KEY]: next });
    debugLog("Queue:enqueued", { id: item.id, queueLength: next.length });
  } catch (err) {
    debugWarn("Queue:enqueue_failed", { error: String(err?.message || err) });
  }
}

async function processQueue() {
  try {
    const result = await storageGet([SAVE_QUEUE_KEY]);
    const queue = Array.isArray(result[SAVE_QUEUE_KEY])
      ? result[SAVE_QUEUE_KEY]
      : [];
    if (!queue.length) return;

    const item = queue[queue.length - 1];
    debugLog("Queue:processing", { id: item.id, remaining: queue.length });

    const notionHeaders = {
      Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    };

    let writeResponse;
    if (item.parentType === "database") {
      writeResponse = await withTimeout(
        fetchWithLog("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { database_id: item.parentId },
            properties: {
              Name: { title: [{ text: { content: item.queuedTitle } }] },
              URL: { url: item.url || "" },
            },
            children: item.children || [],
          }),
        }, "queue_notion_create"),
        NOTION_WRITE_TIMEOUT_MS,
        "Queue Notion write",
      );
    } else {
      writeResponse = await withTimeout(
        fetchWithLog(
          `https://api.notion.com/v1/blocks/${item.parentId}/children`,
          {
            method: "PATCH",
            headers: notionHeaders,
            body: JSON.stringify({ children: item.children || [] }),
          },
          "queue_notion_patch",
        ),
        NOTION_WRITE_TIMEOUT_MS,
        "Queue Notion write",
      );
    }

    if (!writeResponse.ok) {
      const errorText = await writeResponse.text();
      debugWarn("Queue:write_failed", { status: writeResponse.status, error: errorText });
      return;
    }

    const remaining = queue.slice(0, queue.length - 1);
    await storageSet({ [SAVE_QUEUE_KEY]: remaining });
    debugLog("Queue:flushed", { id: item.id, remaining: remaining.length });
  } catch (err) {
    debugWarn("Queue:process_failed", { error: String(err?.message || err) });
  }
}

async function uploadScreenshotToNotion(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const filename = `notion-brain-${Date.now()}.jpg`;
  const contentType = blob.type || "image/jpeg";

  const createResponse = await fetchWithLog(
    "https://api.notion.com/v1/file_uploads",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_FILE_UPLOAD_VERSION,
      },
      body: JSON.stringify({
        mode: "single_part",
        filename,
        content_type: contentType,
      }),
    },
    "notion_file_upload_create",
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(
      `Notion file upload create failed: ${createResponse.status} ${errorText}`,
    );
  }

  const createData = await createResponse.json();
  const fileUploadId = String(createData?.id || "");
  if (!fileUploadId) {
    throw new Error("Notion file upload create returned no id");
  }

  const formData = new FormData();
  formData.append("file", blob, filename);

  const sendResponse = await fetchWithLog(
    `https://api.notion.com/v1/file_uploads/${fileUploadId}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
        "Notion-Version": NOTION_FILE_UPLOAD_VERSION,
      },
      body: formData,
    },
    "notion_file_upload_send",
  );

  if (!sendResponse.ok) {
    const errorText = await sendResponse.text();
    throw new Error(
      `Notion file upload send failed: ${sendResponse.status} ${errorText}`,
    );
  }

  const sendData = await sendResponse.json();
  const status = String(sendData?.status || "");
  if (status && status !== "uploaded") {
    throw new Error(`Notion file upload did not complete (status=${status})`);
  }

  return {
    fileUploadId,
    status: status || "uploaded",
  };
}

async function withTimeout(promise, ms, label) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function polishTextWithLanguageTool(text) {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("language", "auto");

  const response = await fetchWithLog(
    "https://api.languagetool.org/v2/check",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
    "languagetool_polish",
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LanguageTool failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const polishedText = applyLanguageToolSuggestions(text, matches);

  return {
    polishedText,
    changes: matches.length,
  };
}

async function enrichUrlWithMicrolink(url) {
  const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
  const response = await fetchWithLog(
    endpoint,
    { method: "GET" },
    "microlink_enrich",
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Microlink failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const data = result?.data || {};
  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./i, "");
    } catch (_error) {
      return "";
    }
  })();

  return {
    title: data.title || "",
    description: data.description || "",
    publisher: data.publisher || "",
    domain,
  };
}

function clipText(input, maxLen) {
  const value = String(input || "").trim();
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function isRetryableAiStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function normalizeAiHttpError(status, rawText) {
  const text = String(rawText || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (status === 502) return "upstream gateway error (502)";
  if (status === 503) return "service unavailable (503)";
  if (status === 504) return "upstream timeout (504)";
  if (status === 429) return "rate limited (429)";
  if (!text) return `HTTP ${status}`;
  return clipText(text, 140);
}

function toNotionRichText(content) {
  return [
    {
      type: "text",
      text: {
        content: clipText(content, 1800),
      },
    },
  ];
}

function normalizeInputForAi(payload, screenshotValue, captureAction) {
  const note = String(payload.title || "");
  const cleanNote = stripCaptureActionPrefix(note);
  let domain = "";
  try {
    domain = new URL(String(payload.url || "")).hostname.replace(/^www\./i, "");
  } catch (_error) {
    domain = "";
  }

  return {
    type: payload.type,
    captureAction,
    note: cleanNote || note,
    selectedText: String(payload.selectedText || ""),
    url: String(payload.url || ""),
    domain,
    title: String(payload.pageTitle || ""),
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [],
    screenshot: screenshotValue || null,
    createdAt: new Date().toISOString(),
  };
}

function buildAiMessages(input) {
  const captureAction = String(input?.captureAction || "generic");
  const actionGuidance =
    captureAction === "bug"
      ? "Prefer structure: issue summary, impact, evidence, likely fix direction."
      : captureAction === "idea"
        ? "Prefer structure: concept, why it matters, possible implementation, next steps."
        : captureAction === "read-later"
          ? "Prefer structure: quick abstract, key points, why save this, practical takeaway."
          : captureAction === "quote"
            ? "Prefer structure: quote emphasis, context, interpretation, relevance."
            : captureAction === "todo"
              ? "Prefer structure: clear action, constraints, success criteria, sequencing."
              : "Prefer structure: key insight first, then organized supporting points.";

  const systemContent = [
    "You are a production-grade Notion content designer.",
    "Return valid JSON only. No markdown, no commentary.",
    "Keep output useful, dense, and concise. Avoid generic filler text.",
    "JSON schema:",
    '{"title":"string","screenshotPolicy":"include|omit|auto","blocks":[{"type":"callout|heading|paragraph|bullets","content":"string","items":["string"]}],"tags":["string"]}',
    "Rules:",
    "- Adaptive block count: 2-3 blocks for simple inputs (1-2 sentences), 4-6 for detailed inputs. Never pad.",
    "- Start with ONE callout block capturing the core insight. Do not use multiple callouts.",
    "- Only add a heading block if the content has 2+ genuinely distinct sections worth separating.",
    "- Group related supporting points into ONE bullets block rather than multiple paragraphs.",
    "- Keep each content string under 260 chars.",
    "- Do not include a raw dump of the note.",
    "- Suggest screenshotPolicy=include only if screenshot adds clear context/evidence.",
    "- If input type is todo, use bullets with short actionable items (no headings needed).",
    `- Capture action context: ${captureAction}`,
    `- Action guidance: ${actionGuidance}`,
    "- If screenshotInsight is present, incorporate it only when relevant.",
  ].join("\n");

  return [
    { role: "system", content: systemContent },
    { role: "user", content: JSON.stringify(input) },
  ];
}

async function callAiImageToText(imageDataUrl, input) {
  if (!AI_VISION_ENABLED || !imageDataUrl) {
    return "";
  }

  const apiKey = String(
    globalThis.CONFIG.AI_IMAGE_API_KEY || globalThis.CONFIG.AI_API_KEY || "",
  ).trim();
  if (!apiKey || apiKey.includes("YOUR_")) {
    return "";
  }

  const baseUrl = String(
    globalThis.CONFIG.AI_IMAGE_BASE_URL ||
    globalThis.CONFIG.AI_BASE_URL ||
    DEFAULT_AI_BASE_URL,
  ).replace(/\/$/, "");

  const prompt = [
    "You are extracting helpful screenshot context for a note-taking extension.",
    "Return concise plain text only (no markdown, no JSON).",
    "Focus on text visible in the image, error messages, UI state, and key evidence.",
    `Keep output under ${Math.max(180, AI_VISION_OUTPUT_MAX_CHARS)} characters.`,
    "Do not repeat the user note. Prioritize screenshot-only evidence.",
    `Capture action: ${String(input?.captureAction || "generic")}`,
    `User note: ${clipText(String(input?.note || ""), 240)}`,
  ].join("\n");

  debugLog("AI:vision_request", {
    model: AI_VISION_MODEL,
    baseUrl,
    action: input?.captureAction,
    maxTokens: AI_VISION_MAX_TOKENS,
    timeoutMs: AI_VISION_TIMEOUT_MS,
    image: summarizeDataUrl(imageDataUrl),
  });

  const visionStartedAt = Date.now();
  const visionBody = JSON.stringify({
    model: AI_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: AI_VISION_MAX_TOKENS,
    temperature: AI_VISION_TEMPERATURE,
    top_p: 0.95,
    stream: false,
    ...(AI_VISION_ENABLE_THINKING
      ? { chat_template_kwargs: { enable_thinking: true } }
      : {}),
  });

  let lastVisionError = null;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const response = await withTimeout(
        fetchWithLog(
          `${baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: visionBody,
          },
          "ai_vision_completion",
        ),
        AI_VISION_TIMEOUT_MS,
        "AI vision",
      );

      if (!response.ok) {
        const errorText = await response.text();
        lastVisionError = new Error(
          `AI vision failed: ${response.status} ${errorText}`,
        );
        if (isRetryableAiStatus(response.status) && attempt === 0) {
          await sleep(1500);
          continue;
        }
        break;
      }

      const data = await response.json();
      const visionLatencyMs = Date.now() - visionStartedAt;
      debugLog("AI:vision_response", {
        latencyMs: visionLatencyMs,
        attempt: attempt + 1,
        finishReason: data?.choices?.[0]?.finish_reason || "",
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
        totalTokens: data?.usage?.total_tokens,
      });
      const raw = String(data?.choices?.[0]?.message?.content || "").trim();
      if (!raw) return "";

      const cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      return clipText(cleaned, Math.max(180, AI_VISION_OUTPUT_MAX_CHARS));
    } catch (err) {
      lastVisionError = err;
      const isTransient = /timed out|failed to fetch|network/i.test(
        String(err?.message || ""),
      );
      if (isTransient && attempt === 0) {
        await sleep(1500);
        continue;
      }
      break;
    }
  }

  throw lastVisionError || new Error("AI vision failed");
}

function extractJsonObjectFromText(content) {
  const text = String(content || "").trim();
  if (!text) {
    throw new Error("AI returned empty content");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;

  try {
    return JSON.parse(candidate);
  } catch (_parseError) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("AI did not return valid JSON");
  }
}

async function callAiFormatter(input) {
  const apiKey = String(globalThis.CONFIG.AI_API_KEY || "").trim();
  if (!apiKey || apiKey.includes("YOUR_")) {
    throw new Error("AI API key missing");
  }

  const baseUrl = String(
    globalThis.CONFIG.AI_BASE_URL || DEFAULT_AI_BASE_URL,
  ).replace(/\/$/, "");
  const primaryModel = String(globalThis.CONFIG.AI_MODEL || DEFAULT_AI_MODEL);
  const modelCandidates = uniqueStrings([primaryModel, ...AI_FALLBACK_MODELS]);

  let lastError = null;

  for (const model of modelCandidates) {
    for (let attempt = 0; attempt <= AI_FORMATTER_MAX_RETRIES; attempt += 1) {
      const isRetryAttempt = attempt > 0;
      debugLog("AI:request", {
        model,
        baseUrl,
        inputType: input.type,
        noteLength: String(input.note || "").length,
        hasScreenshot: Boolean(input.screenshot),
        attempt: attempt + 1,
        maxAttempts: AI_FORMATTER_MAX_RETRIES + 1,
      });

      try {
        const response = await withTimeout(
          fetchWithLog(
            `${baseUrl}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                model,
                messages: buildAiMessages(input),
                temperature: 0.2,
                top_p: 0.7,
                max_tokens: AI_MAX_TOKENS,
                stream: false,
              }),
            },
            "ai_chat_completion",
          ),
          AI_FORMATTER_TIMEOUT_MS,
          "AI formatter",
        );

        if (!response.ok) {
          const errorText = await response.text();
          const normalizedError = normalizeAiHttpError(
            response.status,
            errorText,
          );
          const retryable = isRetryableAiStatus(response.status);
          debugWarn("AI:request_failed", {
            model,
            status: response.status,
            retryable,
            attempt: attempt + 1,
            error: normalizedError,
          });

          if (retryable && attempt < AI_FORMATTER_MAX_RETRIES) {
            const waitMs = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            await sleep(waitMs);
            continue;
          }

          lastError = new Error(
            `AI formatter failed: ${normalizedError}${isRetryAttempt ? " after retry" : ""}`,
          );
          break;
        }

        const data = await response.json();
        const content = String(data?.choices?.[0]?.message?.content || "");
        const parsed = extractJsonObjectFromText(content);
        const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];

        if (!blocks.length) {
          throw new Error("AI formatter returned no blocks");
        }

        return {
          title: clipText(parsed?.title || input.note || "Untitled", 120),
          blocks,
          screenshotPolicy:
            parsed?.screenshotPolicy === "include" ||
            parsed?.screenshotPolicy === "omit"
              ? parsed.screenshotPolicy
              : "auto",
          tags: Array.isArray(parsed?.tags)
            ? parsed.tags.filter(Boolean).slice(0, 12)
            : [],
          model,
        };
      } catch (error) {
        const message = String(error?.message || error);
        const isTransient = /timed out|failed to fetch|network/i.test(message);
        const canRetry = isTransient && attempt < AI_FORMATTER_MAX_RETRIES;
        debugWarn("AI:request_exception", {
          model,
          attempt: attempt + 1,
          canRetry,
          message,
        });
        if (canRetry) {
          const waitMs = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(waitMs);
          continue;
        }
        lastError =
          error instanceof Error
            ? error
            : new Error(String(error || "ai_failed"));
        break;
      }
    }
  }

  throw lastError || new Error("AI formatter failed: unknown error");
}

function toActionLabel(captureAction) {
  if (captureAction === "read-later") return "Read Later";
  if (captureAction === "bug") return "Bug";
  if (captureAction === "idea") return "Idea";
  if (captureAction === "quote") return "Quote";
  if (captureAction === "todo") return "Todo";
  return "Note";
}

function toLeadEmoji(captureAction) {
  if (captureAction === "bug") return "🐛";
  if (captureAction === "idea") return "💡";
  if (captureAction === "read-later") return "📚";
  if (captureAction === "quote") return "❝";
  if (captureAction === "todo") return "✅";
  return "🧠";
}

function buildDividerBlock() {
  return { object: "block", type: "divider", divider: {} };
}

function buildCaptureSeparatorBlock(captureAction, title) {
  const label = `${toActionLabel(captureAction)} capture`;
  return [
    buildDividerBlock(),
    buildParagraphBlock(`${label} • ${clipText(title, 110)}`, "gray"),
  ];
}

function buildParagraphBlock(text, color) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: {
            content: clipText(text, 1800),
          },
          annotations: color
            ? {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color,
              }
            : undefined,
        },
      ],
    },
  };
}

function buildCalloutBlock(text, emoji) {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: toNotionRichText(text),
      icon: {
        type: "emoji",
        emoji,
      },
    },
  };
}

function buildQuoteBlock(text) {
  return {
    object: "block",
    type: "quote",
    quote: {
      rich_text: toNotionRichText(text),
    },
  };
}

function getFirstContentLine(blocks, fallbackText) {
  for (const block of blocks) {
    if (block?.type === "paragraph") {
      const line = block?.paragraph?.rich_text?.[0]?.text?.content;
      if (line) return String(line);
    }
    if (block?.type === "callout") {
      const line = block?.callout?.rich_text?.[0]?.text?.content;
      if (line) return String(line);
    }
    if (block?.type === "bulleted_list_item") {
      const line = block?.bulleted_list_item?.rich_text?.[0]?.text?.content;
      if (line) return String(line);
    }
  }
  return String(fallbackText || "");
}

function buildMetadataRibbon(input, captureAction) {
  const chips = [
    `Type: ${toActionLabel(captureAction)}`,
    input?.domain ? `Domain: ${input.domain}` : "",
    input?.type === "todo" ? "Mode: Todo" : "Mode: Note",
  ].filter(Boolean);

  return buildParagraphBlock(chips.join("  |  "), "gray");
}

function arrangeContentByCaptureAction(contentBlocks, input, captureAction) {
  const arranged = [];
  arranged.push(buildMetadataRibbon(input, captureAction));

  if (captureAction === "quote") {
    const summary = clipText(getFirstContentLine(contentBlocks, input.note), 220);
    arranged.push(buildQuoteBlock(summary));
  }

  arranged.push(...contentBlocks);
  return arranged;
}

function buildAiNotionChildren(
  aiOutput,
  input,
  sources,
  tags,
  screenshotAttachment,
  captureAction,
  includeScreenshot,
) {
  const contentBlocks = [];

  aiOutput.blocks.slice(0, 16).forEach((block) => {
    const type = String(block?.type || "").toLowerCase();
    const content = String(block?.content || "").trim();

    if (type === "callout" && content) {
      contentBlocks.push({
        object: "block",
        type: "callout",
        callout: {
          rich_text: toNotionRichText(content),
          icon: { type: "emoji", emoji: toLeadEmoji(captureAction) },
        },
      });
      return;
    }

    if (type === "heading" && content) {
      contentBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: toNotionRichText(content),
        },
      });
      return;
    }

    if (type === "paragraph" && content) {
      contentBlocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: toNotionRichText(content),
        },
      });
      return;
    }

    if (type === "bullets") {
      const isTodo = captureAction === "todo" || input?.type === "todo";
      const items = Array.isArray(block?.items) ? block.items : [];
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 24)
        .forEach((item) => {
          if (isTodo) {
            contentBlocks.push({
              object: "block",
              type: "to_do",
              to_do: {
                rich_text: toNotionRichText(item),
                checked: false,
              },
            });
          } else {
            contentBlocks.push({
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: toNotionRichText(item),
              },
            });
          }
        });
    }
  });

  if (!contentBlocks.length && input.note) {
    contentBlocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: toNotionRichText(input.note),
      },
    });
  }

  const children = arrangeContentByCaptureAction(
    contentBlocks,
    input,
    captureAction,
  );

  if (includeScreenshot) {
    const screenshotBlocks = buildScreenshotBlocks(screenshotAttachment, true);
    const insertIndex =
      captureAction === "bug"
        ? Math.min(3, children.length)
        : captureAction === "read-later"
          ? Math.min(2, children.length)
          : captureAction === "quote"
            ? Math.min(2, children.length)
            : children.length;
    children.splice(insertIndex, 0, ...screenshotBlocks);
  }

  if (sources.length > 0) {
    children.push({ object: "block", type: "divider", divider: {} });
    children.push(...buildSourceBlocks(sources));
  }

  const mergedTags = uniqueStrings([
    ...(aiOutput.tags || []),
    ...(tags || []),
  ]).slice(0, 12);
  if (mergedTags.length > 0) {
    children.push(buildDividerBlock());
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Tags: ${mergedTags.join(" ")}`,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "gray",
            },
          },
        ],
      },
    });
  }

  return children.slice(0, 80);
}

function prefixCaptureSeparator(children, captureAction, title) {
  return [...buildCaptureSeparatorBlock(captureAction, title), ...children];
}

async function saveToNotion(payload, senderTab) {
  const isTodo = payload.type === "todo";
  const baseParentType = isTodo
    ? globalThis.CONFIG.TODO_PARENT_TYPE
    : globalThis.CONFIG.NOTES_PARENT_TYPE;
  const baseParentId = isTodo
    ? globalThis.CONFIG.TODO_DB_ID
    : globalThis.CONFIG.NOTES_DB_ID;
  const rawTitle = String(payload.title || "");
  const parsedCaptureAction = extractCaptureAction(rawTitle);
  const captureAction =
    parsedCaptureAction === "generic" && isTodo ? "todo" : parsedCaptureAction;
  const actionOverride = ACTION_DESTINATIONS[captureAction] || {};
  const parentType = String(actionOverride.parentType || baseParentType || "page");
  const parentId = String(actionOverride.parentId || baseParentId || "");
  const title = stripCaptureActionPrefix(rawTitle) || rawTitle;
  const url = payload.url;
  const tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
  const sources = extractSourceUrls(title, url);
  const shouldCaptureScreenshot = Boolean(payload.includeScreenshot);
  const shouldUseAiFormatting = true;
  let screenshotAttachment = null;
  let screenshotDataUrl = "";
  let visionImageDataUrl = "";
  let screenshotInsight = "";
  let visionResult = {
    used: false,
    reason: "not_requested",
    model: AI_VISION_MODEL,
    chars: 0,
  };
  const screenshot = {
    requested: shouldCaptureScreenshot,
    attached: false,
    reason: shouldCaptureScreenshot ? "pending" : "not_requested",
    url: "",
    fileUploadId: "",
  };
  const isDatabaseParent = parentType === "database";
  const isPageTodo = !isDatabaseParent && isTodo;
  const isPageNote = !isDatabaseParent && !isTodo;
  const noteLines = String(title || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let aiResult = {
    used: false,
    reason: "not_configured",
    model: "",
    title: "",
    screenshotPolicy: "auto",
    children: [],
  };
  debugLog("Save:start", {
    type: payload.type,
    parentType,
    shouldCaptureScreenshot,
    shouldUseAiFormatting,
    url,
    noteLength: String(title || "").length,
    tagsCount: tags.length,
  });

  if (shouldCaptureScreenshot) {
    sendProgressToTab(senderTab?.id, "screenshot_start");
    let wasSuppressed = false;
    try {
      debugLog("Screenshot:start", {
        tabId: senderTab?.id,
        windowId: senderTab?.windowId,
      });
      if (senderTab?.id) {
        const hideResult = await sendTabMessage(senderTab.id, {
          type: "NOTION_BRAIN_SCREENSHOT_VISIBILITY",
          hidden: true,
        });
        if (hideResult.ok) {
          wasSuppressed = true;
          await sleep(120);
        }
      }

      const dataUrl = await withTimeout(
        captureVisibleTab(senderTab?.windowId),
        10000,
        "Screenshot capture",
      );
      const captureSummary = summarizeDataUrl(dataUrl);
      debugLog("Screenshot:capture_result", {
        widthCap: SCREENSHOT_MAX_WIDTH,
        quality: SCREENSHOT_QUALITY,
        ...captureSummary,
      });
      if (
        !captureSummary.hasDataPrefix ||
        !captureSummary.hasComma ||
        !captureSummary.isBase64Header
      ) {
        debugWarn("Screenshot:capture_format_warning", captureSummary);
      }

      const originalBytes = estimateDataUrlBytes(dataUrl);
      const optimizeStartedAt = Date.now();
      screenshotDataUrl = await withTimeout(
        optimizeScreenshotDataUrl(dataUrl, {
          quality: SCREENSHOT_QUALITY,
          maxWidth: SCREENSHOT_MAX_WIDTH,
        }),
        12000,
        "Screenshot optimize",
      );
      const optimizeLatencyMs = Date.now() - optimizeStartedAt;
      const optimizedBytes = estimateDataUrlBytes(screenshotDataUrl);
      const optimizedSummary = summarizeDataUrl(screenshotDataUrl);
      if (originalBytes > 0 && optimizedBytes > 0) {
        const reductionPercent = Math.max(
          0,
          Math.round((1 - optimizedBytes / originalBytes) * 100),
        );
        debugLog("Screenshot:optimize", {
          latencyMs: optimizeLatencyMs,
          originalBytes,
          optimizedBytes,
          reductionPercent,
          optimizedMime: optimizedSummary.mime,
          optimizedBase64LengthMod4: optimizedSummary.base64LengthMod4,
        });
      }

      const uploadResult = await withTimeout(
        uploadScreenshotToNotion(screenshotDataUrl),
        SCREENSHOT_UPLOAD_TIMEOUT_MS,
        "Notion screenshot upload",
      );
      screenshotAttachment = { fileUploadId: uploadResult.fileUploadId };
      screenshot.attached = true;
      screenshot.reason = "ok";
      screenshot.fileUploadId = uploadResult.fileUploadId;
      debugLog("Screenshot:attached", {
        fileUploadId: uploadResult.fileUploadId,
      });
      sendProgressToTab(senderTab?.id, "screenshot_done");

      let visionDataUrl = screenshotDataUrl;
      const visionOptimizeStartedAt = Date.now();
      visionDataUrl = await withTimeout(
        optimizeScreenshotDataUrl(screenshotDataUrl, {
          quality: AI_VISION_IMAGE_QUALITY,
          maxWidth: AI_VISION_MAX_IMAGE_WIDTH,
        }),
        8000,
        "Vision image optimize",
      );
      const visionOptimizeLatencyMs = Date.now() - visionOptimizeStartedAt;
      const visionBytes = estimateDataUrlBytes(visionDataUrl);
      if (visionBytes > 0) {
        debugLog("Screenshot:vision_payload", {
          latencyMs: visionOptimizeLatencyMs,
          bytes: visionBytes,
          maxWidth: AI_VISION_MAX_IMAGE_WIDTH,
          quality: AI_VISION_IMAGE_QUALITY,
        });
      }
      visionImageDataUrl = visionDataUrl;
    } catch (error) {
      screenshot.reason = String(error?.message || "capture_failed");
      debugWarn("Screenshot:skipped", { reason: screenshot.reason });
    } finally {
      if (wasSuppressed && senderTab?.id) {
        await sendTabMessage(senderTab.id, {
          type: "NOTION_BRAIN_SCREENSHOT_VISIBILITY",
          hidden: false,
        });
      }
    }
  }

  try {
    const baseAiInput = normalizeInputForAi(
      payload,
      screenshotAttachment?.fileUploadId
        ? "attached"
        : screenshotAttachment?.url || "",
      captureAction,
    );

    const noteIsSufficient = String(title || "").length >= 150;
    if ((visionImageDataUrl || screenshotDataUrl) && !noteIsSufficient) {
      sendProgressToTab(senderTab?.id, "vision_start");
      const VISION_SOFT_DEADLINE_MS = Number(globalThis.CONFIG?.AI_VISION_SOFT_DEADLINE_MS || 6500);
      const visionStartedAt = Date.now();
      const visionCallPromise = callAiImageToText(
        visionImageDataUrl || screenshotDataUrl,
        { captureAction, note: title },
      ).then((text) => ({ ok: true, text: text || "" })).catch((err) => ({ ok: false, error: err }));
      const visionSoftDeadline = new Promise((resolve) =>
        setTimeout(() => resolve(null), VISION_SOFT_DEADLINE_MS),
      );
      const visionRace = await Promise.race([visionCallPromise, visionSoftDeadline]);
      const visionLatencyMs = Date.now() - visionStartedAt;
      if (visionRace !== null && visionRace.ok && visionRace.text) {
        screenshotInsight = visionRace.text;
        visionResult = { used: true, reason: "ok", model: AI_VISION_MODEL, chars: screenshotInsight.length };
        debugLog("AI:vision_success", { chars: screenshotInsight.length, latencyMs: visionLatencyMs });
      } else if (visionRace !== null && !visionRace.ok) {
        visionResult = { used: false, reason: String(visionRace.error?.message || "vision_failed"), model: AI_VISION_MODEL, chars: 0 };
        debugWarn("AI:vision_skipped", { reason: visionResult.reason, latencyMs: visionLatencyMs });
      } else {
        visionResult = { used: false, reason: "soft_deadline", model: AI_VISION_MODEL, chars: 0 };
        debugLog("AI:vision_skipped", { reason: `soft_deadline_${VISION_SOFT_DEADLINE_MS}ms`, latencyMs: visionLatencyMs });
      }
    } else if (noteIsSufficient && (visionImageDataUrl || screenshotDataUrl)) {
      visionResult = { used: false, reason: "note_sufficient", model: AI_VISION_MODEL, chars: 0 };
      debugLog("AI:vision_skipped", { reason: "note_sufficient", noteLength: String(title || "").length });
    }

    const input = {
      ...baseAiInput,
      screenshotInsight,
    };
    sendProgressToTab(senderTab?.id, "ai_start");
    const formatted = await callAiFormatter(input);
    const includeScreenshot =
      shouldCaptureScreenshot && screenshotAttachment
        ? true
        : shouldRenderScreenshot({
            screenshotAttachment,
            captureAction,
            noteText: `${title}\n${screenshotInsight}`,
            aiScreenshotPolicy: formatted.screenshotPolicy,
          });
    if (screenshotAttachment && !includeScreenshot) {
      screenshot.attached = false;
      screenshot.reason = "omitted_by_layout_policy";
    }
    aiResult = {
      used: true,
      reason: "ok",
      model: formatted.model,
      title: formatted.title,
      screenshotPolicy: formatted.screenshotPolicy,
      children: buildAiNotionChildren(
        formatted,
        input,
        sources,
        tags,
        screenshotAttachment,
        captureAction,
        includeScreenshot,
      ),
    };
    sendProgressToTab(senderTab?.id, "ai_done");
    debugLog("AI:success", {
      model: aiResult.model,
      blocks: aiResult.children.length,
      title: aiResult.title,
      hasScreenshotInsight: Boolean(screenshotInsight),
    });
  } catch (error) {
    aiResult = {
      used: false,
      reason: String(error?.message || "ai_failed"),
      model: "",
      title: "",
      screenshotPolicy: "auto",
      children: [],
    };
    debugWarn("AI:skipped", { reason: aiResult.reason });
  }

  const fallbackIncludeScreenshot =
    shouldCaptureScreenshot && screenshotAttachment
      ? true
      : shouldRenderScreenshot({
          screenshotAttachment,
          captureAction,
          noteText: title,
          aiScreenshotPolicy: "auto",
        });
  if (!aiResult.used && screenshotAttachment && !fallbackIncludeScreenshot) {
    screenshot.attached = false;
    screenshot.reason = "omitted_by_layout_policy";
  }

  if (isPageTodo) {
    const todoRichText = [{ type: "text", text: { content: title } }];
    const fallbackChildren = [
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: todoRichText,
          checked: false,
        },
      },
      ...buildSourceBlocks(sources),
      ...(fallbackIncludeScreenshot
        ? buildScreenshotBlocks(screenshotAttachment, false)
        : []),
    ];
    const baseChildren =
      aiResult.used && aiResult.children.length > 0
        ? aiResult.children
        : fallbackChildren;
    const children = prefixCaptureSeparator(baseChildren, captureAction, title);

    debugLog("Notion:write_children", {
      mode: "todo_page",
      parentId,
      blocks: children.length,
    });
    sendProgressToTab(senderTab?.id, "notion_write");
    let todoResponse;
    try {
      todoResponse = await withTimeout(
        fetchWithLog(
          `https://api.notion.com/v1/blocks/${parentId}/children`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
              "Content-Type": "application/json",
              "Notion-Version": NOTION_API_VERSION,
            },
            body: JSON.stringify({ children }),
          },
          "notion_patch_children_todo",
        ),
        NOTION_WRITE_TIMEOUT_MS,
        "Notion write",
      );
    } catch (writeErr) {
      await enqueueFailedSave({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        parentId,
        parentType,
        url: String(url || ""),
        queuedTitle: title,
        children,
      });
      debugLog("Save:done", { mode: "todo_page", aiUsed: aiResult.used, queued: true });
      return {
        screenshot,
        ai: { used: aiResult.used, reason: aiResult.reason, model: aiResult.model, title: aiResult.title, screenshotPolicy: aiResult.screenshotPolicy },
        vision: visionResult,
        queued: true,
      };
    }

    if (!todoResponse.ok) {
      const errorText = await todoResponse.text();
      await enqueueFailedSave({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        parentId,
        parentType,
        url: String(url || ""),
        queuedTitle: title,
        children,
      });
      debugLog("Save:done", { mode: "todo_page", aiUsed: aiResult.used, queued: true, status: todoResponse.status });
      return {
        screenshot,
        ai: { used: aiResult.used, reason: aiResult.reason, model: aiResult.model, title: aiResult.title, screenshotPolicy: aiResult.screenshotPolicy },
        vision: visionResult,
        queued: true,
      };
    }

    processQueue().catch(() => {});
    debugLog("Save:done", {
      mode: "todo_page",
      aiUsed: aiResult.used,
      screenshotAttached: screenshot.attached,
    });
    return {
      screenshot,
      ai: {
        used: aiResult.used,
        reason: aiResult.reason,
        model: aiResult.model,
        title: aiResult.title,
        screenshotPolicy: aiResult.screenshotPolicy,
      },
      vision: visionResult,
    };
  }

  if (isPageNote) {
    const noteChildren = noteLines.length
      ? noteLines.map((line) => {
          const isSnippet = /^snippet:\s*/i.test(line);
          return {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: line,
                  },
                  annotations: isSnippet
                    ? {
                        bold: true,
                        italic: false,
                        strikethrough: false,
                        underline: false,
                        code: false,
                        color: "yellow_background",
                      }
                    : undefined,
                },
              ],
            },
          };
        })
      : [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: title,
                  },
                },
              ],
            },
          },
        ];

    if (fallbackIncludeScreenshot) {
      noteChildren.push(...buildScreenshotBlocks(screenshotAttachment, true));
    }

    if (sources.length > 0) {
      noteChildren.push({ object: "block", type: "divider", divider: {} });
      noteChildren.push(...buildSourceBlocks(sources));
    }

    if (tags.length > 0) {
      noteChildren.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `Tags: ${tags.join(" ")}`,
              },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "gray",
              },
            },
          ],
        },
      });
    }

    const children =
      aiResult.used && aiResult.children.length > 0
        ? aiResult.children
        : noteChildren;
    const separatedChildren = prefixCaptureSeparator(
      children,
      captureAction,
      title,
    );

    debugLog("Notion:write_children", {
      mode: "note_page",
      parentId,
      blocks: separatedChildren.length,
    });
    sendProgressToTab(senderTab?.id, "notion_write");
    let noteResponse;
    try {
      noteResponse = await withTimeout(
        fetchWithLog(
          `https://api.notion.com/v1/blocks/${parentId}/children`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
              "Content-Type": "application/json",
              "Notion-Version": NOTION_API_VERSION,
            },
            body: JSON.stringify({ children: separatedChildren }),
          },
          "notion_patch_children_note",
        ),
        NOTION_WRITE_TIMEOUT_MS,
        "Notion write",
      );
    } catch (writeErr) {
      await enqueueFailedSave({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        parentId,
        parentType,
        url: String(url || ""),
        queuedTitle: title,
        children: separatedChildren,
      });
      return {
        screenshot,
        ai: { used: aiResult.used, reason: aiResult.reason, model: aiResult.model, title: aiResult.title, screenshotPolicy: aiResult.screenshotPolicy },
        vision: visionResult,
        queued: true,
      };
    }

    if (!noteResponse.ok) {
      const errorText = await noteResponse.text();
      await enqueueFailedSave({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        parentId,
        parentType,
        url: String(url || ""),
        queuedTitle: title,
        children: separatedChildren,
      });
      return {
        screenshot,
        ai: { used: aiResult.used, reason: aiResult.reason, model: aiResult.model, title: aiResult.title, screenshotPolicy: aiResult.screenshotPolicy },
        vision: visionResult,
        queued: true,
      };
    }

    processQueue().catch(() => {});
    debugLog("Save:done", {
      mode: "note_page",
      aiUsed: aiResult.used,
      screenshotAttached: screenshot.attached,
    });
    return {
      screenshot,
      ai: {
        used: aiResult.used,
        reason: aiResult.reason,
        model: aiResult.model,
        title: aiResult.title,
        screenshotPolicy: aiResult.screenshotPolicy,
      },
      vision: visionResult,
    };
  }

  const body = {
    parent: isDatabaseParent
      ? { database_id: parentId }
      : { page_id: parentId },
    properties: {
      Name: {
        title: [
          {
            text: { content: aiResult.used ? aiResult.title || title : title },
          },
        ],
      },
      URL: {
        url,
      },
    },
  };

  const detailChildren =
    aiResult.used && aiResult.children.length > 0 ? [...aiResult.children] : [];
  if (!detailChildren.length) {
    if (fallbackIncludeScreenshot) {
      detailChildren.push(...buildScreenshotBlocks(screenshotAttachment, true));
    }
    if (sources.length > 0) {
      detailChildren.push({ object: "block", type: "divider", divider: {} });
      detailChildren.push(...buildSourceBlocks(sources));
    }
    if (tags.length > 0) {
      detailChildren.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `Tags: ${tags.join(" ")}`,
              },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "gray",
              },
            },
          ],
        },
      });
    }
  }
  if (detailChildren.length > 0) {
    body.children = detailChildren;
  }

  debugLog("Notion:create_page", {
    mode: "database_or_page_child",
    parentType,
    parentId,
    blocks: detailChildren.length,
    aiUsed: aiResult.used,
  });
  sendProgressToTab(senderTab?.id, "notion_write");
  let response;
  try {
    response = await withTimeout(
      fetchWithLog(
        "https://api.notion.com/v1/pages",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
            "Content-Type": "application/json",
            "Notion-Version": NOTION_API_VERSION,
          },
          body: JSON.stringify(body),
        },
        "notion_create_page",
      ),
      NOTION_WRITE_TIMEOUT_MS,
      "Notion write",
    );
  } catch (writeErr) {
    await enqueueFailedSave({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      parentId,
      parentType,
      url: String(url || ""),
      queuedTitle: title,
      children: detailChildren,
    });
    return {
      screenshot,
      ai: { used: aiResult.used, reason: aiResult.reason, model: aiResult.model, title: aiResult.title, screenshotPolicy: aiResult.screenshotPolicy },
      vision: visionResult,
      queued: true,
    };
  }

  if (!response.ok) {
    const errorText = await response.text();
    await enqueueFailedSave({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      parentId,
      parentType,
      url: String(url || ""),
      queuedTitle: title,
      children: detailChildren,
    });
    return {
      screenshot,
      ai: { used: aiResult.used, reason: aiResult.reason, model: aiResult.model, title: aiResult.title, screenshotPolicy: aiResult.screenshotPolicy },
      vision: visionResult,
      queued: true,
    };
  }

  processQueue().catch(() => {});
  debugLog("Save:done", {
    mode: "database_or_page_child",
    aiUsed: aiResult.used,
    screenshotAttached: screenshot.attached,
  });
  return {
    screenshot,
    ai: {
      used: aiResult.used,
      reason: aiResult.reason,
      model: aiResult.model,
      title: aiResult.title,
      screenshotPolicy: aiResult.screenshotPolicy,
    },
    vision: visionResult,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  debugLog("Extension installed");
});

chrome.runtime.onStartup.addListener(() => {
  processQueue().catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "NOTION_BRAIN_TOGGLE",
    },
    () => void chrome.runtime.lastError,
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      debugLog("Message:received", {
        type: message?.type || "unknown",
        tabId: sender?.tab?.id,
        url: sender?.tab?.url,
      });
      if (message?.type === "NOTION_BRAIN_SAVE") {
        const payload = message.payload || {};
        const duplicateCheck = await isDuplicateCapture(payload);
        debugLog("Duplicate:checked", {
          isDuplicate: duplicateCheck.isDuplicate,
          fingerprint: duplicateCheck.fingerprint,
        });

        if (duplicateCheck.isDuplicate) {
          debugWarn("Duplicate:blocked", {
            url: payload?.url,
            type: payload?.type,
          });
          sendResponse({
            ok: false,
            error:
              "Duplicate capture prevented: same content already saved for this URL.",
          });
          return;
        }

        const result = await saveToNotion(payload, sender?.tab);
        await recordFingerprint(
          duplicateCheck.fingerprint,
          duplicateCheck.existing,
        );
        debugLog("Duplicate:recorded", {
          fingerprint: duplicateCheck.fingerprint,
        });
        sendResponse({ ok: true, result: result || {} });
        return;
      }

      if (message?.type === "NOTION_BRAIN_POLISH") {
        const text = String(message?.payload?.text || "");
        const result = await polishTextWithLanguageTool(text);
        sendResponse({
          ok: true,
          polishedText: result.polishedText,
          changes: result.changes,
        });
        return;
      }

      if (message?.type === "NOTION_BRAIN_ENRICH") {
        const url = String(message?.payload?.url || "");
        const metadata = await enrichUrlWithMicrolink(url);
        sendResponse({
          ok: true,
          metadata,
        });
        return;
      }

      if (message?.type === "GET_DEBUG_LOGS") {
        const limit = Number(message?.payload?.limit || 100);
        const logs = await getDebugLogs(limit);
        sendResponse({
          ok: true,
          logs,
        });
        return;
      }

      if (message?.type === "CLEAR_DEBUG_LOGS") {
        try {
          const db = await _openDebugLogsDb();
          const tx = db.transaction(DEBUG_LOGS_STORE, "readwrite");
          const store = tx.objectStore(DEBUG_LOGS_STORE);
          await new Promise((resolve, reject) => {
            const req = store.clear();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve();
          });
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error?.message || "Failed to clear logs",
          });
        }
        return;
      }

      if (message?.type === "NOTION_BRAIN_PREVIEW") {
        const payload = message.payload || {};
        const apiKey = String(globalThis.CONFIG.AI_API_KEY || "").trim();
        if (!apiKey || apiKey.includes("YOUR_")) {
          sendResponse({ ok: false, error: "AI API key missing" });
          return;
        }
        const captureActionForPreview = extractCaptureAction(
          String(payload.title || ""),
        );
        const previewInput = normalizeInputForAi(payload, "", captureActionForPreview);
        const formatted = await callAiFormatter(previewInput);
        const blockSummaries = formatted.blocks.slice(0, 3).map((b) => ({
          type: String(b?.type || "paragraph"),
          content: clipText(
            String(
              b?.content ||
                (Array.isArray(b?.items) ? b.items[0] : "") ||
                "",
            ),
            120,
          ),
        }));
        sendResponse({
          ok: true,
          preview: {
            title: formatted.title,
            blockSummaries,
            totalBlocks: formatted.blocks.length,
            screenshotPolicy: formatted.screenshotPolicy,
          },
        });
        return;
      }

      if (message?.type === "GET_QUEUE_STATUS") {
        const result = await storageGet([SAVE_QUEUE_KEY]);
        const queue = Array.isArray(result[SAVE_QUEUE_KEY])
          ? result[SAVE_QUEUE_KEY]
          : [];
        sendResponse({ ok: true, count: queue.length });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type." });
    } catch (error) {
      debugWarn("Message:error", {
        type: message?.type || "unknown",
        error: String(error?.message || error),
      });
      sendResponse({
        ok: false,
        error: error?.message || "Unknown error",
      });
    }
  })();

  return true;
});
