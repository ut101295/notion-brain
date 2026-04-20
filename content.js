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

  const host = document.createElement("div");
  host.id = "nb-host";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const pageUrl = window.location.href;
  let isVisible = false;
  let isSuppressedForScreenshot = false;
  let snippets = [];

  shadow.innerHTML = `
    <style>${globalThis.getStyles()}</style>
    <div id="nb-root">
      <div id="nb-container">
        <div id="nb-header">
          <div id="nb-title">Notion Brain</div>
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
            <div class="nb-row-title">Templates</div>
            <div class="nb-chip-row" id="nb-template-row">
              <button type="button" class="nb-chip" data-template="youtube">YouTube</button>
              <button type="button" class="nb-chip" data-template="github">GitHub</button>
              <button type="button" class="nb-chip" data-template="docs">Docs</button>
            </div>
          </div>

          <div class="nb-section">
            <div class="nb-row-title">Pinned snippets</div>
            <div class="nb-chip-row" id="nb-snippets-row"></div>
            <div class="nb-inline-actions">
              <button type="button" class="nb-ghost-btn" id="nb-add-snippet">Add snippet</button>
              <button type="button" class="nb-ghost-btn" id="nb-clear-snippets">Clear</button>
            </div>
          </div>

          <input id="nb-url-input" class="nb-field" value="" disabled />

          <label class="nb-check-row" for="nb-with-screenshot">
            <input type="checkbox" id="nb-with-screenshot" />
            <span>Attach page screenshot</span>
          </label>

          <div class="nb-inline-actions" id="nb-assist-actions">
            <button type="button" class="nb-ghost-btn" id="nb-polish">Polish</button>
            <button type="button" class="nb-ghost-btn" id="nb-enrich">Enrich</button>
          </div>
        </div>

        <textarea id="nb-textarea" class="nb-field" maxlength="${MAX_NOTE_LENGTH}" placeholder="Capture your note..."></textarea>
        <div id="nb-meta">
          <span id="nb-counter">0 / ${MAX_NOTE_LENGTH}</span>
          <span id="nb-status"></span>
        </div>

        <button id="nb-submit" type="button">Save to Notion</button>
      </div>
    </div>
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
  const urlInput = shadow.getElementById("nb-url-input");
  const quickActions = shadow.getElementById("nb-quick-actions");
  const templateRow = shadow.getElementById("nb-template-row");
  const snippetsRow = shadow.getElementById("nb-snippets-row");
  const addSnippetButton = shadow.getElementById("nb-add-snippet");
  const clearSnippetsButton = shadow.getElementById("nb-clear-snippets");
  const polishButton = shadow.getElementById("nb-polish");
  const enrichButton = shadow.getElementById("nb-enrich");
  const screenshotToggle = shadow.getElementById("nb-with-screenshot");
  const advancedToggle = shadow.getElementById("nb-advanced-toggle");
  const advancedPanel = shadow.getElementById("nb-advanced-panel");

  urlInput.value = pageUrl;

  const applyRenderVisibility = () => {
    host.style.display = isVisible ? "block" : "none";
    root.style.visibility = isSuppressedForScreenshot ? "hidden" : "visible";
    root.style.pointerEvents = isSuppressedForScreenshot ? "none" : "auto";
  };

  const setVisible = (visible) => {
    isVisible = visible;
    applyRenderVisibility();
  };

  const setAdvancedOpen = (open) => {
    advancedPanel.classList.toggle("nb-advanced-hidden", !open);
    advancedToggle.textContent = open ? "Hide additional options" : "Additional options";
  };

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? "#c82a3f" : "#1c7ef7";
  };

  const detectSiteType = (url) => {
    const value = String(url || "").toLowerCase();
    if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
    if (value.includes("github.com")) return "github";
    if (value.includes("/docs") || value.includes("readthedocs") || value.includes("developer.")) return "docs";
    return "";
  };

  const templates = {
    youtube: "Summary:\nKey moment:\nAction item:\n",
    github: "Context:\nIssue:\nProposed fix:\n",
    docs: "What I learned:\nImportant detail:\nNext step:\n"
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
        if (["docs", "pricing", "blog", "api", "readme", "guide"].includes(part.toLowerCase())) {
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
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          const message = String(lastError.message || "");
          if (message.includes("Extension context invalidated")) {
            reject(new Error("Extension was reloaded. Refresh this tab and try again."));
            return;
          }
          reject(new Error(message || "Extension message failed"));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Request failed"));
          return;
        }
        resolve(response);
      });
    });

  const updateCounter = () => {
    counter.textContent = `${textarea.value.length} / ${MAX_NOTE_LENGTH}`;
  };

  const insertText = (text) => {
    const current = textarea.value;
    const next = `${current}${current ? "\n" : ""}${text}`.slice(0, MAX_NOTE_LENGTH);
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
      button.textContent = snippet.length > 26 ? `${snippet.slice(0, 26)}...` : snippet;
      button.title = snippet;
      button.addEventListener("click", () => insertText(`Snippet: ${snippet}`));
      snippetsRow.appendChild(button);
    });
  };

  const loadSnippets = async () => {
    try {
      const result = await storageGet([SNIPPETS_STORAGE_KEY]);
      const existing = Array.isArray(result[SNIPPETS_STORAGE_KEY]) ? result[SNIPPETS_STORAGE_KEY] : [];
      snippets = existing.slice(0, MAX_SNIPPETS);
      renderSnippets();
    } catch (_error) {
      snippets = [];
      renderSnippets();
    }
  };

  const saveSnippets = async () => {
    await storageSet({ [SNIPPETS_STORAGE_KEY]: snippets.slice(0, MAX_SNIPPETS) });
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
  syncModeUI();
  updateCounter();

  textarea.addEventListener("input", updateCounter);
  typeSelect.addEventListener("change", syncModeUI);
  advancedToggle.addEventListener("click", () => {
    const open = advancedPanel.classList.contains("nb-advanced-hidden");
    setAdvancedOpen(open);
  });

  opacityInput.addEventListener("input", (event) => {
    container.style.opacity = String(Number(event.target.value) / 100);
  });

  templateRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-template]");
    if (!button) return;
    templateRow.querySelectorAll(".nb-chip-active").forEach((el) => el.classList.remove("nb-chip-active"));
    button.classList.add("nb-chip-active");
    const key = String(button.getAttribute("data-template") || "");
    const template = templates[key];
    if (!template) return;
    textarea.value = template.slice(0, MAX_NOTE_LENGTH);
    updateCounter();
    textarea.focus();
    setStatus(`Applied ${button.textContent} template`);
  });

  addSnippetButton.addEventListener("click", async () => {
    const value = window.prompt("Add a reusable snippet:");
    const snippet = String(value || "").trim();
    if (!snippet) return;
    snippets = [snippet, ...snippets.filter((item) => item !== snippet)].slice(0, MAX_SNIPPETS);
    await saveSnippets();
    setStatus("Snippet pinned");
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
      const response = await sendRuntimeMessage("NOTION_BRAIN_POLISH", { text });
      textarea.value = String(response.polishedText || text).slice(0, MAX_NOTE_LENGTH);
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
      const response = await sendRuntimeMessage("NOTION_BRAIN_ENRICH", { url: pageUrl });
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
    const nextLeft = Math.max(8, event.clientX - offsetX);
    const nextTop = Math.max(8, event.clientY - offsetY);
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    header.style.cursor = "grab";
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
    }
  });

  const saveCurrent = async () => {
    const rawNote = textarea.value.trim();
    const type = typeSelect.value;

    if (!rawNote) {
      setStatus("Note required", true);
      return;
    }

    if (!globalThis.CONFIG.NOTION_TOKEN || globalThis.CONFIG.NOTION_TOKEN.includes("YOUR_")) {
      setStatus("Add your Notion token in config.js", true);
      return;
    }

    submitButton.disabled = true;
    setStatus(screenshotToggle.checked ? "Saving with screenshot..." : "Saving...");

    try {
      const tags = type === "note" ? deriveTagsFromUrl(pageUrl) : [];
      const saveResponse = await sendRuntimeMessage("NOTION_BRAIN_SAVE", {
        title: rawNote,
        url: pageUrl,
        type,
        tags,
        includeScreenshot: screenshotToggle.checked
      });

      textarea.value = "";
      updateCounter();

      const screenshotResult = saveResponse?.result?.screenshot;
      if (screenshotToggle.checked) {
        if (screenshotResult?.attached) {
          setStatus("Saved to Notion (screenshot attached)");
        } else {
          const reason = screenshotResult?.reason || "unknown reason";
          setStatus(`Saved to Notion (screenshot skipped: ${reason})`);
        }
      } else {
        setStatus("Saved to Notion");
      }
    } catch (error) {
      setStatus(String(error?.message || "Could not save to Notion."), true);
    } finally {
      submitButton.disabled = false;
    }
  };

  submitButton.addEventListener("click", saveCurrent);

  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = String(event.key || "").toLowerCase();

    if (mod && event.shiftKey && key === "s") {
      event.preventDefault();
      setVisible(!isVisible);
      if (isVisible) textarea.focus();
      return;
    }

    if (mod && key === "enter" && isVisible) {
      event.preventDefault();
      saveCurrent();
    }
  });

  const detectedType = detectSiteType(pageUrl);
  const detectedTemplateButton = detectedType ? templateRow.querySelector(`[data-template="${detectedType}"]`) : null;
  if (detectedTemplateButton) {
    detectedTemplateButton.classList.add("nb-chip-active");
  }
})();
