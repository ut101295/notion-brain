importScripts("config.js");

const DEDUPE_STORAGE_KEY = "nb_saved_fingerprints";
const DEDUPE_MAX_ITEMS = 200;
const SCREENSHOT_UPLOAD_TIMEOUT_MS = 30000;
const SCREENSHOT_UPLOAD_TARGETS = ["0x0", "catbox"];

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
  return String(input || "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
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

  const heading = {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: {
            content: "Sources"
          },
          annotations: {
            bold: true,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "gray"
          }
        }
      ]
    }
  };

  const items = sources.map((source, index) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Link ${index + 1}`,
            link: { url: source }
          }
        }
      ]
    }
  }));

  return [heading, ...items];
}

function buildFingerprint({ type, title, url }) {
  const normalized = `${type}||${normalizeText(title).toLowerCase()}||${String(url || "").toLowerCase()}`;
  return hashString(normalized);
}

async function isDuplicateCapture(payload) {
  const fingerprint = buildFingerprint(payload);
  const result = await storageGet([DEDUPE_STORAGE_KEY]);
  const existing = Array.isArray(result[DEDUPE_STORAGE_KEY]) ? result[DEDUPE_STORAGE_KEY] : [];
  const isDuplicate = existing.includes(fingerprint);
  return { isDuplicate, fingerprint, existing };
}

async function recordFingerprint(fingerprint, existing) {
  const next = [fingerprint, ...existing.filter((item) => item !== fingerprint)].slice(0, DEDUPE_MAX_ITEMS);
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
    chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 70 }, (dataUrl) => {
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
    });
  });
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

async function uploadTo0x0(blob) {
  const formData = new FormData();
  formData.append("file", blob, `notion-brain-${Date.now()}.jpg`);

  const response = await fetch("https://0x0.st", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Screenshot upload failed: ${response.status} ${errorText}`);
  }

  const url = (await response.text()).trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Screenshot upload returned invalid URL.");
  }

  return url;
}

async function uploadToCatbox(blob) {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", blob, `notion-brain-${Date.now()}.jpg`);

  const response = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Catbox upload failed: ${response.status} ${errorText}`);
  }

  const url = (await response.text()).trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Catbox upload returned invalid URL.");
  }
  return url;
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

async function uploadScreenshotDataUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const errors = [];

  for (const target of SCREENSHOT_UPLOAD_TARGETS) {
    try {
      if (target === "0x0") {
        return await withTimeout(uploadTo0x0(blob), SCREENSHOT_UPLOAD_TIMEOUT_MS, "0x0 upload");
      }
      if (target === "catbox") {
        return await withTimeout(uploadToCatbox(blob), SCREENSHOT_UPLOAD_TIMEOUT_MS, "catbox upload");
      }
    } catch (error) {
      errors.push(`${target}: ${String(error?.message || error)}`);
    }
  }

  throw new Error(`All screenshot uploads failed (${errors.join(" | ")})`);
}

async function polishTextWithLanguageTool(text) {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("language", "auto");

  const response = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LanguageTool failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const polishedText = applyLanguageToolSuggestions(text, matches);

  return {
    polishedText,
    changes: matches.length
  };
}

async function enrichUrlWithMicrolink(url) {
  const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { method: "GET" });

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
    domain
  };
}

async function saveToNotion(payload, senderTab) {
  const isTodo = payload.type === "todo";
  const parentType = isTodo ? globalThis.CONFIG.TODO_PARENT_TYPE : globalThis.CONFIG.NOTES_PARENT_TYPE;
  const parentId = isTodo ? globalThis.CONFIG.TODO_DB_ID : globalThis.CONFIG.NOTES_DB_ID;
  const title = payload.title;
  const url = payload.url;
  const tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
  const sources = extractSourceUrls(title, url);
  const shouldCaptureScreenshot = Boolean(payload.includeScreenshot);
  let screenshotUrl = "";
  const screenshot = {
    requested: shouldCaptureScreenshot,
    attached: false,
    reason: shouldCaptureScreenshot ? "pending" : "not_requested",
    url: ""
  };
  const isDatabaseParent = parentType === "database";
  const isPageTodo = !isDatabaseParent && isTodo;
  const isPageNote = !isDatabaseParent && !isTodo;
  const noteLines = String(title || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (shouldCaptureScreenshot) {
    let wasSuppressed = false;
    try {
      if (senderTab?.id) {
        const hideResult = await sendTabMessage(senderTab.id, {
          type: "NOTION_BRAIN_SCREENSHOT_VISIBILITY",
          hidden: true
        });
        if (hideResult.ok) {
          wasSuppressed = true;
          await sleep(120);
        }
      }

      const dataUrl = await withTimeout(
        captureVisibleTab(senderTab?.windowId),
        10000,
        "Screenshot capture"
      );
      screenshotUrl = await uploadScreenshotDataUrl(dataUrl);
      screenshot.attached = true;
      screenshot.reason = "ok";
      screenshot.url = screenshotUrl;
    } catch (error) {
      screenshot.reason = String(error?.message || "capture_failed");
      console.warn("Screenshot capture skipped:", screenshot.reason);
    } finally {
      if (wasSuppressed && senderTab?.id) {
        await sendTabMessage(senderTab.id, {
          type: "NOTION_BRAIN_SCREENSHOT_VISIBILITY",
          hidden: false
        });
      }
    }
  }

  if (isPageTodo) {
    const todoRichText = [
      {
        type: "text",
        text: {
          content: title
        }
      }
    ];

    if (sources[0]) {
      todoRichText.push({
        type: "text",
        text: {
          content: " (source)",
          link: { url: sources[0] }
        }
      });
    }

    if (screenshotUrl) {
      todoRichText.push({
        type: "text",
        text: {
          content: " (screenshot)",
          link: { url: screenshotUrl }
        }
      });
    }

    const todoResponse = await fetch(`https://api.notion.com/v1/blocks/${parentId}/children`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        children: [
          {
            object: "block",
            type: "to_do",
            to_do: {
              rich_text: todoRichText,
              checked: false
            }
          },
          ...buildSourceBlocks(sources.slice(1)),
          ...(screenshotUrl
            ? [
                {
                  object: "block",
                  type: "image",
                  image: {
                    type: "external",
                    external: {
                      url: screenshotUrl
                    }
                  }
                }
              ]
            : [])
        ]
      })
    });

    if (!todoResponse.ok) {
      const errorText = await todoResponse.text();
      throw new Error(`Notion request failed: ${todoResponse.status} ${errorText}`);
    }

    return { screenshot };
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
                    content: line
                  },
                  annotations: isSnippet
                    ? {
                        bold: true,
                        italic: false,
                        strikethrough: false,
                        underline: false,
                        code: false,
                        color: "yellow_background"
                      }
                    : undefined
                }
              ]
            }
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
                    content: title
                  }
                }
              ]
            }
          }
        ];

    noteChildren.push(...buildSourceBlocks(sources));

    if (screenshotUrl) {
      noteChildren.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "Screenshot",
                link: { url: screenshotUrl }
              },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "gray"
              }
            }
          ]
        }
      });
      noteChildren.push({
        object: "block",
        type: "image",
        image: {
          type: "external",
          external: {
            url: screenshotUrl
          }
        }
      });
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
                content: `Tags: ${tags.join(" ")}`
              },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "gray"
              }
            }
          ]
        }
      });
    }

    const noteResponse = await fetch(`https://api.notion.com/v1/blocks/${parentId}/children`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        children: noteChildren
      })
    });

    if (!noteResponse.ok) {
      const errorText = await noteResponse.text();
      throw new Error(`Notion request failed: ${noteResponse.status} ${errorText}`);
    }

    return { screenshot };
  }

  const body = {
    parent: isDatabaseParent ? { database_id: parentId } : { page_id: parentId },
    properties: {
      Name: {
        title: [{ text: { content: title } }]
      },
      URL: {
        url
      }
    }
  };

  const detailChildren = [];
  detailChildren.push(...buildSourceBlocks(sources));
  if (screenshotUrl) {
    detailChildren.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Screenshot",
              link: { url: screenshotUrl }
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "gray"
            }
          }
        ]
      }
    });
    detailChildren.push({
      object: "block",
      type: "image",
      image: {
        type: "external",
        external: {
          url: screenshotUrl
        }
      }
    });
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
              content: `Tags: ${tags.join(" ")}`
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "gray"
            }
          }
        ]
      }
    });
  }
  if (detailChildren.length > 0) {
    body.children = detailChildren;
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${globalThis.CONFIG.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion request failed: ${response.status} ${errorText}`);
  }

  return { screenshot };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Notion Brain installed");
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "NOTION_BRAIN_TOGGLE"
    },
    () => void chrome.runtime.lastError
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "NOTION_BRAIN_SAVE") {
        const payload = message.payload || {};
        const duplicateCheck = await isDuplicateCapture(payload);

        if (duplicateCheck.isDuplicate) {
          sendResponse({
            ok: false,
            error: "Duplicate capture prevented: same content already saved for this URL."
          });
          return;
        }

        const result = await saveToNotion(payload, sender?.tab);
        await recordFingerprint(duplicateCheck.fingerprint, duplicateCheck.existing);
        sendResponse({ ok: true, result: result || {} });
        return;
      }

      if (message?.type === "NOTION_BRAIN_POLISH") {
        const text = String(message?.payload?.text || "");
        const result = await polishTextWithLanguageTool(text);
        sendResponse({
          ok: true,
          polishedText: result.polishedText,
          changes: result.changes
        });
        return;
      }

      if (message?.type === "NOTION_BRAIN_ENRICH") {
        const url = String(message?.payload?.url || "");
        const metadata = await enrichUrlWithMicrolink(url);
        sendResponse({
          ok: true,
          metadata
        });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type." });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || "Unknown error"
      });
    }
  })();

  return true;
});
