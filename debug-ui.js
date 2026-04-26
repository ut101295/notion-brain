async function fetchLogs() {
  const status = document.getElementById("status");
  try {
    const limit = parseInt(document.getElementById("logLimit").value) || 100;
    status.className = "status loading";
    status.textContent = "Fetching logs...";

    const response = await chrome.runtime.sendMessage({
      type: "GET_DEBUG_LOGS",
      payload: { limit },
    });

    if (!response.ok) {
      throw new Error(response.error || "Failed to fetch logs");
    }

    renderLogs(response.logs || []);
    status.className = "status success";
    status.textContent = `✓ Loaded ${response.logs.length} log entries`;
  } catch (error) {
    status.className = "status error";
    status.textContent = `✗ Error: ${error.message}`;
    console.error(error);
  }
}

function renderLogs(logs) {
  const container = document.getElementById("logEntries");
  if (!logs.length) {
    container.innerHTML = '<div class="log-entry">No logs found.</div>';
    return;
  }

  container.innerHTML = logs
    .map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const detailsStr = log.details
        ? JSON.stringify(log.details, null, 0).substring(0, 300)
        : "";
      return `<div class="log-entry ${log.level}">
        <span class="log-time">${time}</span>
        <span class="log-level">${log.level.toUpperCase()}</span>
        <span class="log-event">${log.event}</span>
        ${detailsStr ? `<span class="log-details">${escapeHtml(detailsStr)}</span>` : ""}
      </div>`;
    })
    .join("");
}

async function clearAllLogs() {
  if (!confirm("Are you sure you want to clear all debug logs?")) return;
  try {
    await chrome.runtime.sendMessage({ type: "CLEAR_DEBUG_LOGS" });
    fetchLogs();
  } catch (error) {
    console.error("Failed to clear logs:", error);
  }
}

function copyLogsToClipboard() {
  const entries = document.querySelectorAll(".log-entry");
  let text = "Notion Brain Debug Logs\n=======================\n\n";
  entries.forEach((entry) => {
    const children = entry.querySelectorAll("span");
    if (children.length > 0) {
      text += Array.from(children).map((s) => s.textContent).join(" ") + "\n";
    }
  });
  navigator.clipboard.writeText(text);
  alert("Logs copied to clipboard!");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-refresh").addEventListener("click", fetchLogs);
  document.getElementById("btn-clear").addEventListener("click", clearAllLogs);
  document.getElementById("btn-copy").addEventListener("click", copyLogsToClipboard);
  fetchLogs();
  setInterval(fetchLogs, 5000);
});
