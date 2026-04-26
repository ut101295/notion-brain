(() => {
  if (window.__notionBrainInjected) {
    return;
  }
  window.__notionBrainInjected = true;

  if (!document.body) {
    return;
  }

  const MAX_NOTE_LENGTH = 1000;
  const SNIPPETS_STORAGE_KEY = "nb_pinned_snippets";
  const MAX_SNIPPETS = 12;
  const QUICK_ACTIONS = ["Bug", "Idea", "Read Later", "Quote"];
  const DEBUG_LOGS = globalThis.CONFIG?.DEBUG_LOGS !== false;
  const PROGRESS_LABELS = {
    screenshot_start: "Uploading screenshot…",
    screenshot_done: "Screenshot uploaded…",
    vision_start: "Extracting visual context…",
    vision_done: "Visual context ready…",
    ai_start: "Running AI…",
    ai_done: "AI done…",
    notion_write: "Saving to Notion…",
  };

  const debugLog = (...args) => {
    if (!DEBUG_LOGS) return;
    console.log("[NotionBrain][content]", ...args);
  };

  const host = document.createElement("div");
  host.id = "nb-host";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const pageUrl = window.location.href;
  let isVisible = false;
  let isSuppressedForScreenshot = false;
  let snippets = [];
  let capturedSelection = "";
  let toastTimer = null;

  shadow.innerHTML = `
    <style>${globalThis.getStyles()}</style>
    <div id="nb-root">
      <div id="nb-container">
        <div id="nb-header">
          <div id="nb-title-row">
            <div id="nb-title">Notion Brain</div>
            <span id="nb-ai-badge" class="nb-ai-badge nb-ai-on">AI ON</span>
            <span id="nb-queue-badge" class="nb-queue-badge nb-hidden"></span>
          </div>
          <div id="nb-controls">
            <label for="nb-opacity">Opacity</label>
            <input id="nb-opacity" type="range" min="30" max="100" value="92" />
          </div>
        </div>

        <select id="nb-select" class="nb-field">
          <option value="note">Notes</option>
          <option value="todo">To-Do</option>
        </select>

        <button type="button" class="nb-ghost-btn nb-advanced-toggle" id="nb-advanced-toggle">
          Additional options
        </button>

        <div id="nb-advanced-panel" class="nb-advanced-panel nb-advanced-hidden">
          <div id="nb-quick-actions" class="nb-section"></div>

          <div class="nb-section">
            <div class="nb-row-title">Pinned snippets</div>
            <div class="nb-chip-row" id="nb-snippets-row"></div>
            <div id="nb-snippet-add-row" class="nb-inline-actions nb-hidden">
              <input type="text" id="nb-snippet-input" class="nb-field nb-snippet-field" placeholder="Enter snippet…" maxlength="120" />
              <button type="button" class="nb-ghost-btn" id="nb-snippet-confirm">Save</button>
              <button type="button" class="nb-ghost-btn" id="nb-snippet-cancel">Cancel</button>
            </div>
            <div class="nb-inline-actions">
              <button type="button" class="nb-ghost-btn" id="nb-add-snippet">Add snippet</button>
              <button type="button" class="nb-ghost-btn" id="nb-clear-snippets">Clear</button>
            </div>
          </div>

          <label class="nb-check-row" for="nb-with-screenshot">
            <input type="checkbox" id="nb-with-screenshot" />
            <span>Attach page screenshot</span>
          </label>

          <div class="nb-inline-actions" id="nb-assist-actions">
            <button type="button" class="nb-ghost-btn" id="nb-polish">Polish</button>
            <button type="button" class="nb-ghost-btn" id="nb-enrich">Enrich</button>
          </div>

          <button type="button" class="nb-ghost-btn" id="nb-open-debug">Open debug console →</button>
        </div>

        <textarea id="nb-textarea" class="nb-field" maxlength="${MAX_NOTE_LENGTH}" placeholder="Add context, links, or action item (optional if screenshot is on)"></textarea>
        <div id="nb-meta">
          <span id="nb-counter">0 / ${MAX_NOTE_LENGTH}</span>
          <span id="nb-status"></span>
        </div>

        <div id="nb-preview-box" class="nb-preview-box nb-hidden"></div>

        <div class="nb-save-row">
          <button id="nb-preview-btn" type="button" class="nb-ghost-btn nb-preview-btn">Preview</button>
          <button id="nb-submit" type="button">Save to Notion</button>
        </div>
      </div>
    </div>
    <div id="nb-toast" class="nb-toast nb-toast-hidden"></div>
  `;

  const root = shadow.getElementById("nb-root");
  const container = shadow.getElementById("nb-container");
  const header = shadow.getElementById("nb-header");
  const textarea = shadow.getElementById("nb-textarea");
  const counter = shadow.getElementById("nb-counter");
  const status = shadow.getElementById("nb-status");
  const submitButton = shadow.getElementById("nb-submit");
  const opacityInput = shadow.getElementById("nb-opacity");
  const typeSelect = shadow.getElementById("nb-select");
  const quickActions = shadow.getElementById("nb-quick-actions");
  const snippetsRow = shadow.getElementById("nb-snippets-row");
  const addSnippetButton = shadow.getElementById("nb-add-snippet");
  const clearSnippetsButton = shadow.getElementById("nb-clear-snippets");
  const snippetAddRow = shadow.getElementById("nb-snippet-add-row");
  const snippetInput = shadow.getElementById("nb-snippet-input");
  const snippetConfirmButton = shadow.getElementById("nb-snippet-confirm");
  const snippetCancelButton = shadow.getElementById("nb-snippet-cancel");
  const polishButton = shadow.getElementById("nb-polish");
  const enrichButton = shadow.getElementById("nb-enrich");
  const openDebugButton = shadow.getElementById("nb-open-debug");
  const screenshotToggle = shadow.getElementById("nb-with-screenshot");
  const advancedToggle = shadow.getElementById("nb-advanced-toggle");
  const advancedPanel = shadow.getElementById("nb-advanced-panel");
  const previewBtn = shadow.getElementById("nb-preview-btn");
  const previewBox = shadow.getElementById("nb-preview-box");
  const toastEl = shadow.getElementById("nb-toast");
  const queueBadge = shadow.getElementById("nb-queue-badge");

  const applyRenderVisibility = () => {
    host.style.display = isVisible ? "block" : "none";
    root.style.visibility = isSuppressedForScreenshot ? "hidden" : "visible";
    root.style.pointerEvents = isSuppressedForScreenshot ? "none" : "auto";
  };

  const setVisible = (visible) => {
    isVisible = visible;
    applyRenderVisibility();
    if (visible) {
      const sel = window.getSelection()?.toString().trim() || "";
      if (sel && !textarea.value.trim()) {
        capturedSelection = sel;
        textarea.value = sel.slice(0, MAX_NOTE_LENGTH);
        updateCounter();
      }
      updateQueueBadge();
    }
  };

  const setAdvancedOpen = (open) => {
    advancedPanel.classList.toggle("nb-advanced-hidden", !open);
    advancedToggle.textContent = open
      ? "Hide additional options"
      : "Additional options";
  };

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? "#c82a3f" : "#1c7ef7";
    debugLog("Status", { message, isError });
  };

  const showToast = (message, durationMs = 4000) => {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.remove("nb-toast-hidden");
    toastEl.classList.add("nb-toast-visible");
    host.style.display = "block";
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("nb-toast-visible");
      toastEl.classList.add("nb-toast-hidden");
      toastTimer = null;
      if (!isVisible) host.style.display = "none";
    }, durationMs);
  };

  const updateQueueBadge = async () => {
    try {
      const res = await sendRuntimeMessage("GET_QUEUE_STATUS", {});
      if (res.count > 0) {
        queueBadge.textContent = `⏳ ${res.count} queued`;
        queueBadge.classList.remove("nb-hidden");
      } else {
        queueBadge.classList.add("nb-hidden");
      }
    } catch (_err) {
      queueBadge.classList.add("nb-hidden");
    }
  };

  const normalizeTag = (value) => {
    const cleaned = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned ? `#${cleaned}` : "";
  };

  const deriveTagsFromUrl = (url) => {
    const tags = [];
    try {
      const parsed = new URL(url);
      const hostName = parsed.hostname.replace(/^www\./i, "");
      const hostParts = hostName.split(".");
      if (hostParts.length > 1) {
        const domainTag = normalizeTag(hostParts[hostParts.length - 2]);
        if (domainTag) tags.push(domainTag);
      }

      const paths = parsed.pathname.split("/").filter(Boolean);
      for (const part of paths) {
        if (
          ["docs", "pricing", "blog", "api", "readme", "guide"].includes(
            part.toLowerCase(),
          )
        ) {
          const pathTag = normalizeTag(part);
          if (pathTag) tags.push(pathTag);
        }
      }

      if (hostName.includes("youtube")) tags.push("#video");
      if (hostName.includes("github")) tags.push("#code");
    } catch (_error) {
      return [];
    }

    return [...new Set(tags)].slice(0, 6);
  };

  const storageGet = (keys) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result || {});
      });
    });

  const storageSet = (value) =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set(value, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });

  const sendRuntimeMessage = (type, payload) =>
    new Promise((resolve, reject) => {
      debugLog("Message -> background", { type, payload });
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          const message = String(lastError.message || "");
          if (message.includes("Extension context invalidated")) {
            reject(
              new Error(
                "Extension was reloaded. Refresh this tab and try again.",
              ),
            );
            return;
          }
          reject(new Error(message || "Extension message failed"));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Request failed"));
          return;
        }
        debugLog("Message <- background", { type, response });
        resolve(response);
      });
    });

  const updateCounter = () => {
    counter.textContent = `${textarea.value.length} / ${MAX_NOTE_LENGTH}`;
  };

  const insertText = (text) => {
    const current = textarea.value;
    const next = `${current}${current ? "\n" : ""}${text}`.slice(
      0,
      MAX_NOTE_LENGTH,
    );
    textarea.value = next;
    updateCounter();
  };

  const renderQuickActions = () => {
    quickActions.innerHTML = `
      <div class="nb-row-title">Quick actions</div>
      <div class="nb-chip-row" id="nb-quick-row"></div>
    `;
    const row = shadow.getElementById("nb-quick-row");
    QUICK_ACTIONS.forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nb-chip";
      button.textContent = label;
      button.addEventListener("click", () => {
        const token = `[${label}]`;
        const current = textarea.value.trimStart();
        if (current.startsWith(token)) {
          textarea.focus();
          return;
        }
        const next = `${token} `;
        textarea.value = `${next}${textarea.value}`.slice(0, MAX_NOTE_LENGTH);
        updateCounter();
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      });
      row.appendChild(button);
    });
  };

  const renderSnippets = () => {
    snippetsRow.innerHTML = "";
    if (!snippets.length) {
      const empty = document.createElement("span");
      empty.className = "nb-empty";
      empty.textContent = "No snippets yet.";
      snippetsRow.appendChild(empty);
      return;
    }

    snippets.forEach((snippet) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nb-chip";
      button.textContent =
        snippet.length > 26 ? `${snippet.slice(0, 26)}...` : snippet;
      button.title = snippet;
      button.addEventListener("click", () => insertText(`Snippet: ${snippet}`));
      snippetsRow.appendChild(button);
    });
  };

  const loadSnippets = async () => {
    try {
      const result = await storageGet([SNIPPETS_STORAGE_KEY]);
      const existing = Array.isArray(result[SNIPPETS_STORAGE_KEY])
        ? result[SNIPPETS_STORAGE_KEY]
        : [];
      snippets = existing.slice(0, MAX_SNIPPETS);
      renderSnippets();
    } catch (_error) {
      snippets = [];
      renderSnippets();
    }
  };

  const saveSnippets = async () => {
    await storageSet({
      [SNIPPETS_STORAGE_KEY]: snippets.slice(0, MAX_SNIPPETS),
    });
    renderSnippets();
  };

  const syncModeUI = () => {
    const isNote = typeSelect.value === "note";
    quickActions.style.display = isNote ? "block" : "none";
  };

  setVisible(false);
  setAdvancedOpen(false);
  renderQuickActions();
  loadSnippets();
  storageGet(["nb_panel_position"]).then((result) => {
    const pos = result.nb_panel_position;
    if (pos?.left && pos?.top) {
      root.style.left = pos.left;
      root.style.top = pos.top;
      root.style.right = "auto";
    }
  }).catch(() => {});
  syncModeUI();
  updateCounter();
  debugLog("Panel initialized", { pageUrl });

  container.addEventListener("keydown", (e) => e.stopPropagation());

  textarea.addEventListener("input", updateCounter);
  typeSelect.addEventListener("change", syncModeUI);
  advancedToggle.addEventListener("click", () => {
    const open = advancedPanel.classList.contains("nb-advanced-hidden");
    setAdvancedOpen(open);
  });
  opacityInput.addEventListener("input", (event) => {
    container.style.opacity = String(Number(event.target.value) / 100);
  });

  const showSnippetInput = () => {
    snippetAddRow.classList.remove("nb-hidden");
    snippetInput.value = "";
    snippetInput.focus();
  };

  const hideSnippetInput = () => {
    snippetAddRow.classList.add("nb-hidden");
    snippetInput.value = "";
  };

  addSnippetButton.addEventListener("click", showSnippetInput);

  snippetConfirmButton.addEventListener("click", async () => {
    const snippet = snippetInput.value.trim();
    if (!snippet) {
      hideSnippetInput();
      return;
    }
    snippets = [snippet, ...snippets.filter((item) => item !== snippet)].slice(
      0,
      MAX_SNIPPETS,
    );
    hideSnippetInput();
    await saveSnippets();
    setStatus("Snippet pinned");
  });

  snippetCancelButton.addEventListener("click", hideSnippetInput);

  snippetInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") snippetConfirmButton.click();
    if (event.key === "Escape") hideSnippetInput();
  });

  clearSnippetsButton.addEventListener("click", async () => {
    snippets = [];
    await saveSnippets();
    setStatus("Snippets cleared");
  });

  polishButton.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      setStatus("Write text first to polish", true);
      return;
    }
    polishButton.disabled = true;
    setStatus("Polishing...");
    try {
      const response = await sendRuntimeMessage("NOTION_BRAIN_POLISH", {
        text,
      });
      textarea.value = String(response.polishedText || text).slice(
        0,
        MAX_NOTE_LENGTH,
      );
      updateCounter();
      setStatus(`Polished (${response.changes || 0} suggestions)`);
    } catch (error) {
      setStatus(String(error?.message || "Polish failed"), true);
    } finally {
      polishButton.disabled = false;
    }
  });

  enrichButton.addEventListener("click", async () => {
    enrichButton.disabled = true;
    setStatus("Enriching...");
    try {
      const response = await sendRuntimeMessage("NOTION_BRAIN_ENRICH", {
        url: pageUrl,
      });
      const metadata = response.metadata || {};
      const lines = [];
      if (metadata.title) lines.push(`Context: ${metadata.title}`);
      if (metadata.description) lines.push(`About: ${metadata.description}`);
      if (metadata.domain) lines.push(`Domain: ${metadata.domain}`);
      if (lines.length) {
        insertText(lines.join("\n"));
        setStatus("Metadata added");
      } else {
        setStatus("No metadata found");
      }
    } catch (error) {
      setStatus(String(error?.message || "Enrich failed"), true);
    } finally {
      enrichButton.disabled = false;
    }
  });

  openDebugButton.addEventListener("click", () => {
    window.open(chrome.runtime.getURL("debug.html"), "_blank");
  });

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("mousedown", (event) => {
    isDragging = true;
    const rect = root.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    header.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    const maxLeft = Math.max(8, window.innerWidth - root.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - root.offsetHeight - 8);
    const nextLeft = Math.min(Math.max(8, event.clientX - offsetX), maxLeft);
    const nextTop = Math.min(Math.max(8, event.clientY - offsetY), maxTop);
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    header.style.cursor = "grab";
    const left = root.style.left;
    const top = root.style.top;
    if (left && top) {
      storageSet({ nb_panel_position: { left, top } }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "NOTION_BRAIN_TOGGLE") {
      setVisible(!isVisible);
      if (isVisible) textarea.focus();
      sendResponse({ visible: isVisible });
      return;
    }

    if (message?.type === "NOTION_BRAIN_SCREENSHOT_VISIBILITY") {
      isSuppressedForScreenshot = Boolean(message?.hidden);
      applyRenderVisibility();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "NOTION_BRAIN_PROGRESS") {
      const label = PROGRESS_LABELS[message?.stage];
      if (label) setStatus(label);
    }
  });

  const saveCurrent = async () => {
    const rawNote = textarea.value.trim();
    const type = typeSelect.value;

    if (!rawNote && !screenshotToggle.checked) {
      setStatus("Add a note or enable screenshot", true);
      return;
    }

    if (
      !globalThis.CONFIG.NOTION_TOKEN ||
      globalThis.CONFIG.NOTION_TOKEN.includes("YOUR_")
    ) {
      setStatus("Add your Notion token in config.js", true);
      return;
    }

    submitButton.disabled = true;
    debugLog("Save started", {
      type,
      noteLength: rawNote.length,
      includeScreenshot: Boolean(screenshotToggle.checked),
    });
    setStatus(
      screenshotToggle.checked ? "Saving with screenshot..." : "Saving...",
    );

    try {
      const tags = deriveTagsFromUrl(pageUrl);
      const selectionAtSave = capturedSelection;
      capturedSelection = "";
      const saveResponse = await sendRuntimeMessage("NOTION_BRAIN_SAVE", {
        title: rawNote,
        pageTitle: document.title,
        url: pageUrl,
        type,
        tags,
        includeScreenshot: screenshotToggle.checked,
        selectedText: selectionAtSave,
      });

      textarea.value = "";
      updateCounter();
      previewBox.classList.add("nb-hidden");
      previewBox.innerHTML = "";

      const result = saveResponse?.result || {};
      const screenshotResult = result.screenshot;
      const aiResult = result.ai;
      const visionResult = result.vision;
      const wasQueued = Boolean(result.queued);

      if (wasQueued) {
        setStatus("Saved locally — will sync to Notion when connection restores");
        showToast("⏳ Queued — will sync when Notion is reachable", 5000);
        updateQueueBadge();
        return;
      }

      const formatAiReason = (reason) => {
        const cleaned = String(reason || "unknown")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!cleaned) return "unknown";
        return cleaned.length > 96 ? `${cleaned.slice(0, 93)}...` : cleaned;
      };
      const aiSuffix = aiResult?.used ? " (AI formatted)" : "";
      const aiSkippedSuffix = !aiResult?.used
        ? ` (AI skipped: ${formatAiReason(aiResult?.reason)})`
        : "";
      const visionSuffix = visionResult?.used
        ? " (vision context used)"
        : screenshotToggle.checked && visionResult?.reason
          ? ` (vision skipped: ${String(visionResult.reason)})`
          : "";
      if (screenshotToggle.checked) {
        if (screenshotResult?.attached) {
          setStatus(
            `Saved to Notion${aiSuffix}${aiSkippedSuffix}${visionSuffix} (screenshot attached)`,
          );
        } else {
          const reason = screenshotResult?.reason || "unknown reason";
          setStatus(
            `Saved to Notion${aiSuffix}${aiSkippedSuffix}${visionSuffix} (screenshot skipped: ${reason})`,
          );
        }
      } else {
        setStatus(
          `Saved to Notion${aiSuffix}${aiSkippedSuffix}${visionSuffix}`,
        );
      }

      const toastTitle = aiResult?.title;
      if (toastTitle) showToast(`Saved: ${toastTitle}`);

      updateQueueBadge();
      debugLog("Save completed", {
        screenshot: screenshotResult,
        ai: aiResult,
        vision: visionResult,
      });
    } catch (error) {
      debugLog("Save failed", { error: String(error?.message || error) });
      setStatus(String(error?.message || "Could not save to Notion."), true);
    } finally {
      submitButton.disabled = false;
    }
  };

  submitButton.addEventListener("click", saveCurrent);

  previewBtn.addEventListener("click", async () => {
    const rawNote = textarea.value.trim();
    if (!rawNote) {
      setStatus("Add a note to preview AI formatting", true);
      return;
    }
    previewBtn.disabled = true;
    submitButton.disabled = true;
    setStatus("Previewing…");
    try {
      const tags = deriveTagsFromUrl(pageUrl);
      const res = await sendRuntimeMessage("NOTION_BRAIN_PREVIEW", {
        title: rawNote,
        pageTitle: document.title,
        url: pageUrl,
        type: typeSelect.value,
        tags,
      });
      const { title: previewTitle, blockSummaries, totalBlocks } = res.preview || {};
      const typeIcon = { callout: "💡", heading: "📌", paragraph: "📝", bullets: "•" };
      const lines = [
        `<strong>${previewTitle || "(no title)"}</strong>`,
        ...blockSummaries.map(
          (b) => `<span class="nb-preview-block">${typeIcon[b.type] || "▸"} ${b.content || "(empty)"}</span>`,
        ),
        totalBlocks > 3
          ? `<span class="nb-preview-more">+${totalBlocks - 3} more blocks</span>`
          : "",
      ].filter(Boolean);
      previewBox.innerHTML = lines.join("");
      previewBox.classList.remove("nb-hidden");
      setStatus("AI preview ready — click Save to confirm");
    } catch (error) {
      setStatus(String(error?.message || "Preview failed"), true);
    } finally {
      previewBtn.disabled = false;
      submitButton.disabled = false;
    }
  });

  const quickCapture = async () => {
    if (
      !globalThis.CONFIG.NOTION_TOKEN ||
      globalThis.CONFIG.NOTION_TOKEN.includes("YOUR_")
    ) {
      showToast("Notion token not configured", 3000);
      return;
    }
    showToast("Quick saving…", 60000);
    try {
      const tags = deriveTagsFromUrl(pageUrl);
      const saveResponse = await sendRuntimeMessage("NOTION_BRAIN_SAVE", {
        title: document.title,
        pageTitle: document.title,
        url: pageUrl,
        type: "note",
        tags,
        includeScreenshot: false,
      });
      const aiTitle = saveResponse?.result?.ai?.title;
      showToast(aiTitle ? `Quick saved: ${aiTitle}` : "Quick saved!", 3000);
    } catch (error) {
      showToast(`Quick save failed: ${String(error?.message || "unknown")}`, 4000);
    }
  };

  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = String(event.key || "").toLowerCase();

    if (mod && event.shiftKey && key === "s") {
      event.preventDefault();
      setVisible(!isVisible);
      if (isVisible) textarea.focus();
      return;
    }

    if (mod && event.shiftKey && key === "e") {
      event.preventDefault();
      quickCapture();
      return;
    }

    if (mod && key === "enter" && isVisible) {
      event.preventDefault();
      saveCurrent();
    }
  }, true);

})();
