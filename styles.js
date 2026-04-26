globalThis.getStyles = function getStyles() {
  return `
    :host {
      --nb-bg-top: #f9fcff;
      --nb-bg-bottom: #e8f1ff;
      --nb-border: rgba(26, 50, 80, 0.16);
      --nb-text: #16263c;
      --nb-muted: #5f7391;
      --nb-accent: #146ff2;
      --nb-accent-2: #0bb0e8;
      --nb-error: #c82a3f;
      --nb-chip: #f2f7ff;
    }

    :host {
      all: initial;
    }

    #nb-root,
    #nb-root * {
      box-sizing: border-box;
    }

    #nb-root {
      position: fixed;
      top: 96px;
      right: 20px;
      width: min(380px, calc(100vw - 24px));
      z-index: 2147483647;
      color: var(--nb-text);
      font-family: "Trebuchet MS", "Avenir Next", "Segoe UI", sans-serif;
      animation: nb-fade-in 180ms ease-out;
    }

    #nb-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px 16px 14px;
      border-radius: 20px;
      background:
        radial-gradient(circle at 92% -34%, rgba(20, 111, 242, 0.2), rgba(20, 111, 242, 0)),
        linear-gradient(180deg, var(--nb-bg-top), var(--nb-bg-bottom));
      box-shadow: 0 20px 46px rgba(7, 28, 58, 0.24);
      border: 1px solid var(--nb-border);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    #nb-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 132px;
      align-items: center;
      gap: 10px;
      cursor: grab;
      user-select: none;
      font-weight: 700;
    }

    #nb-title {
      font-size: 16px;
      line-height: 1;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }

    #nb-title-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .nb-ai-badge {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 58px;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.45px;
      text-transform: uppercase;
      border: 1px solid rgba(18, 48, 86, 0.22);
      overflow: hidden;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
    }

    .nb-ai-badge::after {
      content: "";
      position: absolute;
      top: -30%;
      left: -60%;
      width: 44%;
      height: 160%;
      transform: rotate(18deg);
      background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0));
      animation: nb-shimmer 2.4s ease-in-out infinite;
      pointer-events: none;
    }

    .nb-ai-on {
      background: linear-gradient(135deg, #0f76f8, #13b6d8);
      color: #ffffff;
      border-color: rgba(13, 92, 190, 0.6);
    }

    .nb-ai-off {
      background: linear-gradient(135deg, #eef2f7, #dce4ee);
      color: #607387;
      border-color: rgba(116, 138, 166, 0.45);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }

    .nb-ai-off::after {
      display: none;
    }

    #nb-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    #nb-controls label {
      font-size: 11px;
      color: var(--nb-muted);
      white-space: nowrap;
      font-weight: 700;
    }

    #nb-opacity {
      width: 84px;
      accent-color: var(--nb-accent);
      flex: 1 1 auto;
    }

    .nb-field {
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(78, 104, 143, 0.35);
      background: rgba(255, 255, 255, 0.96);
      color: var(--nb-text);
      padding: 11px 12px;
      font-size: 14px;
      outline: none;
    }

    .nb-field:focus {
      border-color: rgba(20, 111, 242, 0.55);
      box-shadow: 0 0 0 3px rgba(20, 111, 242, 0.15);
    }

    #nb-textarea {
      resize: none;
      height: 124px;
      line-height: 1.4;
    }

    #nb-textarea::placeholder {
      color: #6d86a8;
    }

    #nb-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--nb-muted);
      min-height: 16px;
    }

    #nb-status {
      text-align: right;
      font-weight: 600;
    }

    .nb-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(92, 119, 160, 0.22);
      background: rgba(255, 255, 255, 0.55);
    }

    .nb-row-title {
      font-size: 11px;
      color: var(--nb-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
    }

    #nb-quick-actions .nb-row-title {
      margin-bottom: 8px;
    }

    .nb-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 26px;
    }

    .nb-chip {
      border: 1px solid rgba(84, 112, 151, 0.3);
      background: var(--nb-chip);
      color: #24405e;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nb-chip:hover {
      background: #e8f1ff;
      border-color: rgba(20, 111, 242, 0.45);
    }

    .nb-chip-active {
      background: rgba(20, 111, 242, 0.16);
      border-color: rgba(20, 111, 242, 0.55);
      color: #0f5ccb;
    }

    .nb-inline-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .nb-advanced-toggle {
      width: 100%;
      justify-content: center;
      text-align: center;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.62);
    }

    .nb-advanced-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 2px;
      max-height: calc(100vh - 280px);
      overflow-y: auto;
      scrollbar-width: thin;
    }

    .nb-advanced-hidden {
      display: none;
    }

    .nb-check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      color: #2c4665;
      padding: 2px 2px 0;
      cursor: pointer;
      user-select: none;
    }

    .nb-check-row input {
      accent-color: var(--nb-accent);
      cursor: pointer;
    }

    .nb-ghost-btn {
      border: 1px solid rgba(92, 119, 160, 0.32);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.84);
      color: #2a4666;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 10px;
      cursor: pointer;
    }

    .nb-ghost-btn:hover {
      border-color: rgba(20, 111, 242, 0.48);
      color: #0f5ccb;
    }

    .nb-ghost-btn:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .nb-empty {
      font-size: 12px;
      color: #7f93af;
    }

    #nb-url-input {
      font-size: 12px;
      cursor: text;
      color: #425f82;
      background: rgba(255, 255, 255, 0.76);
    }

    #nb-select {
      cursor: pointer;
      font-weight: 700;
    }

    #nb-submit {
      width: 100%;
      border: none;
      border-radius: 14px;
      padding: 12px;
      background: linear-gradient(135deg, var(--nb-accent), var(--nb-accent-2));
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 10px 20px rgba(20, 111, 242, 0.28);
      margin-top: 2px;
    }

    #nb-submit:hover {
      transform: translateY(-1px);
    }

    #nb-submit:active {
      transform: translateY(0);
      opacity: 0.92;
    }

    #nb-submit:disabled {
      opacity: 0.7;
      cursor: wait;
    }

    @keyframes nb-fade-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes nb-shimmer {
      0% {
        left: -60%;
      }
      100% {
        left: 130%;
      }
    }

    @media (max-width: 520px) {
      #nb-root {
        top: 12px;
        right: 12px;
      }

      #nb-header {
        grid-template-columns: 1fr;
      }

      #nb-controls {
        justify-content: space-between;
      }

      #nb-opacity {
        width: 130px;
      }
    }

    .nb-save-row {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }

    .nb-preview-btn {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .nb-save-row #nb-submit {
      flex: 1 1 auto;
      margin-top: 0;
    }

    .nb-preview-box {
      border: 1px solid rgba(20, 111, 242, 0.28);
      border-radius: 12px;
      background: rgba(240, 247, 255, 0.92);
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--nb-text);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nb-preview-box strong {
      font-size: 13px;
      color: #0f3d7a;
      display: block;
      margin-bottom: 2px;
    }

    .nb-preview-block {
      display: block;
      color: #2c4a6e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nb-preview-more {
      display: block;
      color: var(--nb-muted);
      font-style: italic;
      font-size: 11px;
    }

    .nb-queue-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: rgba(255, 193, 7, 0.2);
      border: 1px solid rgba(255, 193, 7, 0.55);
      color: #7a5800;
      white-space: nowrap;
    }

    .nb-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(0);
      background: rgba(15, 28, 50, 0.92);
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      max-width: calc(100vw - 32px);
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      z-index: 2147483647;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }

    .nb-toast-hidden {
      opacity: 0;
      transform: translateX(-50%) translateY(12px);
      pointer-events: none;
    }

    .nb-toast-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
};
