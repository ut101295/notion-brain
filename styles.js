window.getStyles = function getStyles() {
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
  `;
};
