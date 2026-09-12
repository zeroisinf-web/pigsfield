(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const MAX_PROMPT_LENGTH = 1800;
  const TEXT_ENDPOINT = new URL("/api/ai", window.location.origin).href;
  const IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/";
  const IMAGE_MODEL = "sana";
  const AI_CLIENT_STORAGE_KEY = "pigsfield-ai-client-v1";
  const AI_MODEL_STORAGE_KEY = "pigsfield-ai-model-v1";
  // Mirrors MAX_COMPANIES in worker/model-rankings.mjs: the comparison lists one model for
  // each of the ten highest-placed companies, so a short table is worth explaining.
  const RANKED_COMPANIES = 10;

  // The three hosted models worker/index.mjs accepts. Every one of them runs on the same
  // same-origin endpoint, so the studio's promise holds whichever is chosen: no visitor
  // account, no additional provider key, no model download, nothing to install.
  //
  // Gemma stays the default because it is the cheapest to run, which is what keeps the
  // studio free to offer; the other two are there because they are genuinely better at
  // different things, and a visitor who needs that should not have to go somewhere else.
  const TEXT_MODELS = [
    { id: "gemma-4-26b-a4b-it", name: "Gemma 4 26B A4B", note: "Fastest · everyday questions" },
    { id: "gpt-oss-120b", name: "GPT-OSS 120B", note: "Strongest · hard problems" },
    { id: "llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B", note: "Best for Indian languages" }
  ];
  const DEFAULT_TEXT_MODEL = TEXT_MODELS[0].id;

  function assetUrl(path) {
    const base = document.documentElement.getAttribute("data-base") || "/";
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }

  const studioStyle = document.createElement("link");
  studioStyle.rel = "stylesheet";
  studioStyle.href = assetUrl("css/ai-studio.css?v=d820564bbb66");
  document.head.append(studioStyle);

  // One line-art set, drawn to the same 24-grid and inheriting currentColor, replaces the
  // emoji that used to stand in for every control. Emoji are a different typeface on every
  // platform: they arrived at whatever weight and colour the OS felt like, sat off the
  // baseline next to the label, and made a considered interface look improvised.
  const ICONS = {
    spark: '<path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z"/>',
    chat: '<path d="M20 4.8H4a1.2 1.2 0 0 0-1.2 1.2v9.2A1.2 1.2 0 0 0 4 16.4h3.1v3.3l3.9-3.3H20a1.2 1.2 0 0 0 1.2-1.2V6A1.2 1.2 0 0 0 20 4.8Z"/>',
    image: '<path d="M20 4.4H4A1.6 1.6 0 0 0 2.4 6v12A1.6 1.6 0 0 0 4 19.6h16a1.6 1.6 0 0 0 1.6-1.6V6A1.6 1.6 0 0 0 20 4.4Zm0 13.6H4l4.4-5.6 2.8 3.4 3.3-4.2L20 18ZM8.2 10.6a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"/>',
    broom: '<path d="M6 20.6h5.4l1.5-4.8H7.5L6 20.6Zm2.1-6.3h4.4l3.2-9.9 1.8.6.7-2.1-5.7-1.9-.7 2.2 1.8.6-3.2 9.9-2.3.6Zm7.6 6.3h4.6v-1.6h-4.6v1.6Zm0-3.1h3.4v-1.6h-3.4v1.6Z"/>',
    user: '<path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.8c-3.7 0-7 1.9-7 4.2v1.8h14v-1.8c0-2.3-3.3-4.2-7-4.2Z"/>',
    copy: '<path d="M8.4 2.8h9.4a2 2 0 0 1 2 2v9.4h-1.9V4.7H8.4V2.8Zm-2.2 3h8.2a2 2 0 0 1 2 2v11.4a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2V7.8a2 2 0 0 1 2-2Zm.1 1.9v11.6h8V7.7h-8Z"/>',
    check: '<path d="m9.6 16.2-3.9-3.9-1.4 1.4 5.3 5.3L20.1 8.5l-1.4-1.4-9.1 9.1Z"/>',
    download: '<path d="M11.1 3v8.2L8.2 8.3 6.8 9.7l5.2 5.2 5.2-5.2-1.4-1.4-2.9 2.9V3h-1.8ZM4.5 17.3v2.1a1.6 1.6 0 0 0 1.6 1.6h11.8a1.6 1.6 0 0 0 1.6-1.6v-2.1h-1.9v1.8H6.4v-1.8H4.5Z"/>',
    expand: '<path d="M14 3.2v1.9h3.6l-7.3 7.3 1.3 1.3 7.3-7.3v3.6h1.9V3.2H14ZM5 5.1h4.6V3.2H4.4a1.2 1.2 0 0 0-1.2 1.2v15.2a1.2 1.2 0 0 0 1.2 1.2h15.2a1.2 1.2 0 0 0 1.2-1.2v-5.2h-1.9V19H5V5.1Z"/>',
    alert: '<path d="M12 2.6 1.4 21h21.2L12 2.6Zm.9 14.7h-1.8v-1.8h1.8v1.8Zm0-3.6h-1.8V9.8h1.8v3.9Z"/>',
    bolt: '<path d="M13.4 2 4.6 13.4h5.3L9.1 22l9-11.9h-5.4L13.4 2Z"/>',
    model: '<path d="M12 2.4 3 7.1v9.8l9 4.7 9-4.7V7.1L12 2.4Zm0 2.2 6.4 3.3L12 11.2 5.6 7.9 12 4.6ZM4.9 9.6l6.2 3.2v6.1l-6.2-3.2V9.6Zm8.1 9.3v-6.1l6.1-3.2v6.1L13 18.9Z"/>',
    arrow: '<path d="M7.6 5.4h11v11h-1.9V8.6L6.9 18.4 5.6 17.1l9.8-9.8H7.6V5.4Z"/>',
    refresh: '<path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"/>'
  };

  // One row of the comparison is one company, so each row carries that company's own mark.
  // A company the leaderboard names that has no local mark gets a monogram instead of a
  // broken image: new labs appear on that table without a deployment.
  const COMPANY_MARKS = {
    "Anthropic": { file: "claude-symbol.svg" },
    "OpenAI": { file: "chatgpt-symbol.svg", mono: true },
    "Google": { file: "gemini-symbol.svg" },
    "SpaceXAI": { file: "grok-symbol.svg", mono: true },
    "Moonshot AI": { file: "kimi-symbol.svg", mono: true },
    "Meta": { file: "meta-symbol.svg" },
    "Alibaba": { file: "qwen-symbol.svg" },
    "Z AI": { file: "zai-symbol.svg", mono: true },
    "DeepSeek": { file: "deepseek-symbol.svg" }
  };

  function icon(name, extraClass) {
    return `<svg class="ai-icon${extraClass ? " " + extraClass : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
  }

  const STUDIO_MARKUP = `
    <div data-ai-studio-root class="ai-studio-v2">
      <section class="ai-panel ai-launchpad" aria-label="External AI launchpad">
        <div class="ai-panel-head">
          <span class="ai-launchpad-title">${icon("bolt")} Discover &amp; compare</span>
        </div>
        <div class="ai-launchpad-group">
          <a class="ai-ext-pill featured" href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener noreferrer" title="Open Artificial Analysis LLM Rankings">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/artificial-analysis-symbol.png" alt="" width="24" height="24" aria-hidden="true"></span>
            <span class="pill-text"><span class="pill-label">LLM Rankings</span><span class="pill-description">Independent benchmarks</span></span>
            <span class="pill-go" aria-hidden="true">${icon("arrow")}</span>
          </a>
          <a class="ai-ext-pill featured" href="https://indus.sarvam.ai/" target="_blank" rel="noopener noreferrer" title="Open Indus by Sarvam">
            <span class="pill-logo-tile pill-monogram" aria-hidden="true">इ</span>
            <span class="pill-text"><span class="pill-label">Indus</span><span class="pill-description">By Sarvam</span></span>
            <span class="pill-go" aria-hidden="true">${icon("arrow")}</span>
          </a>
          <a class="ai-ext-pill featured" href="https://duck.ai/" target="_blank" rel="noopener noreferrer" title="Open Duck.ai by DuckDuckGo">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/duckduckgo-symbol.svg" alt="" width="24" height="24" aria-hidden="true"></span>
            <span class="pill-text"><span class="pill-label">Duck.ai</span><span class="pill-description">By DuckDuckGo</span></span>
            <span class="pill-go" aria-hidden="true">${icon("arrow")}</span>
          </a>
        </div>
        <div class="ai-launchpad-scroll">
          <a class="ai-ext-pill" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/claude-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Claude</span>
          </a>
          <a class="ai-ext-pill" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo is-mono" src="/assets/chatgpt-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">ChatGPT</span>
          </a>
          <a class="ai-ext-pill" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/gemini-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Gemini</span>
          </a>
          <a class="ai-ext-pill" href="https://aistudio.google.com/prompts/new_chat" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/google-aistudio-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Google AI Studio</span>
          </a>
          <a class="ai-ext-pill" href="https://grok.com/" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo is-mono" src="/assets/grok-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Grok</span>
          </a>
          <a class="ai-ext-pill" href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo is-mono" src="/assets/kimi-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Kimi</span>
          </a>
          <a class="ai-ext-pill" href="https://www.meta.ai/" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/meta-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Meta AI</span>
          </a>
          <a class="ai-ext-pill" href="https://qwen.ai/" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/qwen-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Qwen</span>
          </a>
          <a class="ai-ext-pill" href="https://z.ai/chat" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo is-mono" src="/assets/zai-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">Z.ai</span>
          </a>
          <a class="ai-ext-pill" href="https://chat.deepseek.com/" target="_blank" rel="noopener noreferrer">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/deepseek-symbol.svg" alt="" width="20" height="20" aria-hidden="true"></span>
            <span class="pill-label">DeepSeek</span>
          </a>
        </div>
      </section>

      <section class="ai-panel ai-rankings" aria-label="AI model comparison">
        <div class="ai-panel-head">
          <h3>Intelligence, without the wait.</h3>
          <button type="button" class="ai-refresh-btn" data-refresh-rankings>${icon("refresh")} <span>Refresh</span></button>
        </div>
        <div class="ai-rankings-scroll">
          <table class="ai-rankings-table" role="table">
            <caption class="sr-only">One model per company: each company's most intelligent model that answers end to end within 35 seconds</caption>
            <thead role="rowgroup"><tr role="row"><th scope="col">Company &amp; model</th><th scope="col">Intelligence</th><th scope="col">USD / task</th><th scope="col">Total time</th></tr></thead>
            <tbody data-rankings-body role="rowgroup"></tbody>
          </table>
        </div>
        <p data-rankings-status role="status">Loading verified rankings…</p>
        <details class="ai-methodology"><summary>Source &amp; ranking method</summary><p>Data from <a href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener noreferrer">Artificial Analysis</a>, checked hourly while in use. Each company is represented once, by its most intelligent model that answers end to end within 35 seconds; ties use lower cost, then faster response. Cost is USD per benchmark task; timing is not a guarantee of chat website speed. Linked apps may not offer the exact model. Unlisted chat destinations link to the benchmark source.</p></details>
      </section>

      <div class="creator-layout">
        <div class="ai-control-bar">
          <div class="ai-model-tag">
            ${icon("model", "model-icon")}
            <span class="ai-model-field">
              <label class="sr-only" for="ai-model-select">Model</label>
              <select id="ai-model-select" class="ai-model-select" data-ai-model>
                ${TEXT_MODELS.map((model) => `<option value="${model.id}">${model.name} — ${model.note}</option>`).join("")}
              </select>
            </span>
            <span class="model-status-dot" title="Online"></span>
          </div>

          <div class="ai-mode-toggle" role="radiogroup" aria-label="Select AI Mode">
            <button type="button" class="ai-mode-btn active" data-mode="chat" aria-checked="true">
              ${icon("chat")} Chat
            </button>
            <button type="button" class="ai-mode-btn" data-mode="image" aria-checked="false">
              ${icon("image")} Image
            </button>
          </div>

          <button type="button" class="ai-clear-btn" data-clear-chat title="Clear chat history">
            ${icon("broom")} Clear
          </button>
        </div>

        <div class="ai-chat-thread" id="ai-chat-thread" aria-live="polite">
          <div class="ai-thread-welcome" id="ai-welcome-box">
            <div class="welcome-icon">${icon("spark")}</div>
            <h3>A little curiosity. A new possibility.</h3>
            <p>Ask a question, work through an idea, or create an image. Start here—no account needed.</p>
          </div>
        </div>

        <form class="ai-unified-form" id="ai-unified-form">
          <div class="ai-input-wrapper">
            <textarea id="ai-unified-prompt" name="prompt" maxlength="1800" required placeholder="Ask anything, explain a concept, or write code..."></textarea>
            <div class="ai-input-footer">
              <span class="ai-char-counter" id="ai-char-counter">0 / 1800</span>
              <button class="button brand ai-submit-btn" type="submit" id="ai-submit-btn">
                <span class="btn-icon">${icon("spark")}</span> <span class="btn-text">Send</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>`;

  class StudioError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = "StudioError";
      this.status = Number(status) || 0;
      this.code = code || "unknown";
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function escapeHtml(value) {
    if (typeof PF.escapeHtml === "function") return PF.escapeHtml(value);
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeSlug(value) {
    return String(value || "pigsfield-ai")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "pigsfield-ai";
  }

  // Block-level output carries its own blank lines from the moment it is produced, so the
  // paragraph pass below sees each block as its own chunk and the newline-to-<br> rule never
  // fires inside a list, a heading or a code block. Without that, list items arrived
  // separated by a stray <br> and a full list margin each, which is what made a plain
  // three-bullet answer look like three unrelated fragments.
  const blockHtml = (html) => `\n\n${html}\n\n`;

  function formatMarkdown(text) {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
      return blockHtml(`<pre class="ai-code-block"><code>${code.trim()}</code></pre>`);
    });
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    escaped = escaped.replace(/^### (.*$)/gim, (match, heading) => blockHtml(`<h4 class="ai-msg-h3">${heading}</h4>`));
    escaped = escaped.replace(/^## (.*$)/gim, (match, heading) => blockHtml(`<h3 class="ai-msg-h2">${heading}</h3>`));
    escaped = escaped.replace(/^# (.*$)/gim, (match, heading) => blockHtml(`<h2 class="ai-msg-h1">${heading}</h2>`));
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/^[ \t]*[-*]\s+(.*$)/gim, '<li class="ai-msg-li">$1</li>');
    escaped = escaped.replace(/(?:<li class="ai-msg-li">[\s\S]*?<\/li>\s*)+/g, (run) => {
      return blockHtml(`<ul class="ai-msg-ul">${run.replace(/<\/li>\s*<li/g, '</li><li').trim()}</ul>`);
    });
    return escaped.split(/\n\n+/).map((paragraph) => {
      const chunk = paragraph.trim();
      if (!chunk) return '';
      if (/^<(?:pre|ul|h[1-4])\b/.test(chunk)) return chunk;
      return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function aiClientId() {
    try {
      let value = window.localStorage.getItem(AI_CLIENT_STORAGE_KEY);
      if (!/^[a-z0-9-]{12,80}$/i.test(value || "")) {
        value = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "pf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        window.localStorage.setItem(AI_CLIENT_STORAGE_KEY, value);
      }
      return value;
    } catch (_) {
      return "anonymous";
    }
  }

  /** The remembered choice, validated against the list the Worker will actually accept. */
  function savedModel() {
    try {
      const value = window.localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (TEXT_MODELS.some((model) => model.id === value)) return value;
    } catch (_) {}
    return DEFAULT_TEXT_MODEL;
  }

  function rememberModel(value) {
    try { window.localStorage.setItem(AI_MODEL_STORAGE_KEY, value); } catch (_) {}
  }

  async function timedFetch(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs || 90000);
    const requestOptions = Object.assign({
      credentials: "omit",
      referrerPolicy: "strict-origin-when-cross-origin",
      signal: controller.signal
    }, options || {});
    try {
      return await fetch(url, requestOptions);
    } catch (error) {
      if (controller.signal.aborted) throw new StudioError("The request timed out.", 0, "timeout");
      throw new StudioError("The provider could not be reached.", 0, "network");
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function requestTextResponse(prompt, modelId) {
    const response = await timedFetch(TEXT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Pigsfield-Client": aiClientId()
      },
      body: JSON.stringify({
        model: modelId || DEFAULT_TEXT_MODEL,
        task: "tutor",
        prompt: prompt
      })
    }, 90000);
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}
    if (!response.ok) throw new StudioError(data && data.error || raw || "Provider error", response.status);
    let output = data == null ? raw : (typeof data.text === "string" ? data.text : JSON.stringify(data.text));
    const finalMarker = output.lastIndexOf("</think>");
    if (finalMarker >= 0) output = output.slice(finalMarker + 8);
    output = output.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/gi, "").trim();
    if (!output) throw new StudioError("The AI returned an empty response.", 502);
    return output;
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadImageBlob(url, filename) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch (_) {
      window.open(url, "_blank", "noopener");
    }
  }

  /** The company's own mark, or its initial when the leaderboard names a lab we have none for. */
  function companyMark(company) {
    const mark = COMPANY_MARKS[company];
    const tile = element("span", "ai-ranking-logo");
    if (!mark) {
      tile.classList.add("pill-monogram");
      tile.textContent = String(company || "?").trim().charAt(0).toUpperCase() || "?";
      tile.setAttribute("aria-hidden", "true");
      return tile;
    }
    const image = element("img", "pill-logo" + (mark.mono ? " is-mono" : ""));
    image.src = assetUrl("assets/" + mark.file);
    image.alt = "";
    image.width = 24;
    image.height = 24;
    image.loading = "lazy";
    image.setAttribute("aria-hidden", "true");
    tile.append(image);
    return tile;
  }

  /** A metric cell: its small-screen label, the value, and — for the index — a share bar. */
  function metricCell(label, value, share) {
    const cell = element("td", "ai-ranking-metric");
    cell.setAttribute("role", "cell");
    const metricLabel = element("span", "ai-metric-label", label);
    metricLabel.setAttribute("aria-hidden", "true");
    cell.append(metricLabel, element("strong", "", value));
    if (Number.isFinite(share)) {
      const meter = element("span", "ai-meter");
      meter.setAttribute("aria-hidden", "true");
      const fill = element("span", "ai-meter-fill");
      fill.style.width = Math.max(6, Math.min(100, share * 100)).toFixed(1) + "%";
      meter.append(fill);
      cell.append(meter);
    }
    return cell;
  }

  function initRankings(root) {
    const body = root.querySelector("[data-rankings-body]");
    const status = root.querySelector("[data-rankings-status]");
    const refresh = root.querySelector("[data-refresh-rankings]");
    if (!body || !status || !refresh) return;
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      refresh.disabled = true;
      root.querySelector(".ai-rankings")?.classList.add("is-loading");
      try {
        const response = await fetch("/api/model-rankings", { signal: AbortSignal.timeout(25000), cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!Array.isArray(data.models) || !data.models.length || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error("Invalid rankings");
        // The bar is read against the leading model, so the spread between labs is visible
        // on a scale that never advertises an absolute score the source does not publish.
        const leader = data.models.reduce((best, model) => Math.max(best, model.intelligence), 0) || 1;
        const rows = data.models.map((model, index) => {
          const row = element("tr");
          row.setAttribute("role", "row");
          const company = element("td", "ai-ranking-model");
          company.setAttribute("role", "cell");
          const link = element("a", "ai-ranking-name", model.name);
          const url = new URL(model.website);
          if (url.protocol !== "https:") throw new Error("Invalid website");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const identity = element("span", "ai-ranking-identity");
          identity.append(link, element("span", "ai-ranking-company", model.company));
          // The row lays out inside the cell rather than as the cell, so the first column
          // still participates in table layout and stays aligned with its heading.
          const inner = element("span", "ai-ranking-model-inner");
          inner.append(element("span", "ai-ranking-rank", String(index + 1).padStart(2, "0")), companyMark(model.company), identity);
          company.append(inner);
          row.append(
            company,
            metricCell("Intelligence", model.intelligence, model.intelligence / leader),
            metricCell("USD / task", "$" + model.cost.toFixed(2)),
            metricCell("Total time", model.seconds.toFixed(2) + " s")
          );
          return row;
        });
        body.replaceChildren(...rows);
        const stale = data.stale || Date.now() - Date.parse(data.updatedAt) > 3600000;
        const shortfall = rows.length < RANKED_COMPANIES ? ` Only ${rows.length} ${rows.length === 1 ? "company has" : "companies have"} verified qualifying results.` : "";
        status.textContent = `${stale ? "Source unavailable — showing last verified data. " : ""}Updated ${new Date(data.updatedAt).toLocaleString()}.${shortfall}`;
      } catch (_) {
        status.textContent = body.children.length ? "Refresh unavailable — showing previously loaded data. Try again shortly." : "Rankings unavailable. Open Artificial Analysis or try refreshing shortly.";
      } finally {
        loading = false;
        refresh.disabled = false;
        root.querySelector(".ai-rankings")?.classList.remove("is-loading");
      }
    }
    refresh.addEventListener("click", load);
    load();
    // Refresh a long-running open studio without making background requests in hidden tabs.
    window.setInterval(() => { if (document.visibilityState === "visible" && root.getClientRects().length) load(); }, 3600000);
  }

  function init(scope) {
    // scope is usually an element, but the DOMContentLoaded path below passes `document`,
    // which has querySelector and no matches(). Calling it threw on every /ai/ load, which
    // aborted this whole initializer before it bound a single control — the studio only
    // worked there because the dock mounts a second copy through mountAIStudio().
    const scopeElement = scope && typeof scope.querySelector === "function" ? scope : document;
    const root = typeof scopeElement.matches === "function" && scopeElement.matches("[data-ai-studio-root]")
      ? scopeElement
      : scopeElement.querySelector("[data-ai-studio-root]");

    if (!root) return null;
    if (root.dataset.aiStudioV2Initialized === "true") return root;

    initRankings(root);
    let currentMode = "chat";
    let currentModel = savedModel();
    const thread = root.querySelector("#ai-chat-thread");
    const welcomeBox = root.querySelector("#ai-welcome-box");
    const form = root.querySelector("#ai-unified-form");
    const promptInput = root.querySelector("#ai-unified-prompt");
    const charCounter = root.querySelector("#ai-char-counter");
    const submitBtn = root.querySelector("#ai-submit-btn");
    const modeBtns = root.querySelectorAll(".ai-mode-btn");
    const modelSelect = root.querySelector("[data-ai-model]");
    const clearBtn = root.querySelector("[data-clear-chat]");

    if (!thread || !form || !promptInput) return null;

    root.querySelectorAll("img.pill-logo").forEach(img => {
      const src = img.getAttribute("src");
      if (src && src.startsWith("/")) {
        img.src = assetUrl(src);
      }
    });

    if (modelSelect) {
      modelSelect.value = currentModel;
      modelSelect.addEventListener("change", () => {
        currentModel = TEXT_MODELS.some((model) => model.id === modelSelect.value) ? modelSelect.value : DEFAULT_TEXT_MODEL;
        modelSelect.value = currentModel;
        rememberModel(currentModel);
      });
    }

    promptInput.addEventListener("input", () => {
      const count = promptInput.value.length;
      if (charCounter) charCounter.textContent = `${count} / ${MAX_PROMPT_LENGTH}`;
    });

    function setMode(mode) {
      currentMode = mode;
      modeBtns.forEach(btn => {
        const isMatch = btn.dataset.mode === mode;
        btn.classList.toggle("active", isMatch);
        btn.setAttribute("aria-checked", isMatch ? "true" : "false");
      });
      // The model choice only governs the hosted text endpoint; image prompts go elsewhere.
      root.classList.toggle("is-image-mode", mode === "image");

      if (mode === "image") {
        promptInput.placeholder = "Describe the image you want to generate (e.g. Solar system diagram, watercolor landscape)...";
        if (submitBtn) {
          submitBtn.querySelector(".btn-icon").innerHTML = icon("image");
          submitBtn.querySelector(".btn-text").textContent = "Generate Image";
        }
      } else {
        promptInput.placeholder = "Ask anything, explain a concept, or write code...";
        if (submitBtn) {
          submitBtn.querySelector(".btn-icon").innerHTML = icon("spark");
          submitBtn.querySelector(".btn-text").textContent = "Send";
        }
      }
    }

    modeBtns.forEach(btn => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        thread.replaceChildren();
        if (welcomeBox) thread.appendChild(welcomeBox);
      });
    }

    function scrollToBottom() {
      thread.scrollTop = thread.scrollHeight;
    }

    function avatar(kind, label) {
      const node = element("div", "ai-msg-avatar ai-msg-avatar-" + kind);
      node.title = label;
      node.innerHTML = icon(kind === "user" ? "user" : "spark");
      return node;
    }

    function appendUserMessage(text) {
      if (welcomeBox && welcomeBox.parentNode === thread) {
        welcomeBox.remove();
      }
      const msg = element("div", "ai-msg ai-msg-user");
      const content = element("div", "ai-msg-content");
      const textDiv = element("div", "ai-msg-text", text);
      content.appendChild(textDiv);
      msg.append(avatar("user", "You"), content);
      thread.appendChild(msg);
      scrollToBottom();
    }

    function appendPendingMessage(label) {
      const msg = element("div", "ai-msg ai-msg-assistant is-pending");
      msg.id = "ai-pending-indicator";
      const content = element("div", "ai-msg-content");
      const body = element("div", "ai-pending-body");
      body.innerHTML = `<span class="ai-spinner"></span> <span>${escapeHtml(label || "Thinking...")}</span>`;
      content.appendChild(body);
      msg.append(avatar("assistant", "AI"), content);
      thread.appendChild(msg);
      scrollToBottom();
      return msg;
    }

    function removePendingMessage() {
      const pending = thread.querySelector("#ai-pending-indicator");
      if (pending) pending.remove();
    }

    function modelName(id) {
      const match = TEXT_MODELS.find((model) => model.id === id);
      return match ? match.name : id;
    }

    function appendAssistantTextMessage(text, usedModel) {
      removePendingMessage();
      const msg = element("div", "ai-msg ai-msg-assistant");
      const content = element("div", "ai-msg-content");
      const textDiv = element("div", "ai-msg-text");
      textDiv.innerHTML = formatMarkdown(text);
      content.appendChild(textDiv);

      const actions = element("div", "ai-msg-actions");
      // Which model wrote an answer is part of reading it, and the picker may have moved on.
      actions.appendChild(element("span", "ai-msg-model", modelName(usedModel)));

      const copyBtn = element("button", "ai-copy-btn");
      copyBtn.type = "button";
      copyBtn.innerHTML = `${icon("copy")} <span>Copy</span>`;
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.innerHTML = `${icon("check")} <span>Copied</span>`;
          setTimeout(() => { copyBtn.innerHTML = `${icon("copy")} <span>Copy</span>`; }, 2000);
        } catch (_) {}
      });
      actions.appendChild(copyBtn);
      content.appendChild(actions);

      msg.append(avatar("assistant", "AI"), content);
      thread.appendChild(msg);
      scrollToBottom();
    }

    function appendAssistantImageMessage(prompt, imageUrl) {
      removePendingMessage();
      const msg = element("div", "ai-msg ai-msg-assistant");
      const content = element("div", "ai-msg-content");

      const card = element("div", "ai-image-card");
      card.innerHTML = `
        <div class="ai-image-preview">
          <img src="${imageUrl}" alt="${escapeHtml(prompt)}" loading="lazy">
        </div>
        <div class="ai-image-footer">
          <span class="ai-image-prompt-text">“${escapeHtml(prompt)}”</span>
          <div class="ai-image-actions">
            <button type="button" class="button small brand ai-dl-btn">${icon("download")} Download</button>
            <a class="button small ghost" href="${imageUrl}" target="_blank" rel="noopener noreferrer">${icon("expand")} Full view</a>
          </div>
        </div>`;

      const dlBtn = card.querySelector(".ai-dl-btn");
      if (dlBtn) {
        dlBtn.addEventListener("click", () => {
          downloadImageBlob(imageUrl, `pigsfield-art-${safeSlug(prompt)}.jpg`);
        });
      }

      content.appendChild(card);
      msg.append(avatar("assistant", "AI"), content);
      thread.appendChild(msg);
      scrollToBottom();
    }

    function appendErrorMessage(errorText) {
      removePendingMessage();
      const msg = element("div", "ai-msg ai-msg-assistant is-error");
      const content = element("div", "ai-msg-content");
      const body = element("div", "ai-error-body");
      body.appendChild(element("strong", null, "Could not finish creation"));
      body.appendChild(element("p", null, errorText));
      content.appendChild(body);
      const mark = element("div", "ai-msg-avatar ai-msg-avatar-error");
      mark.innerHTML = icon("alert");
      msg.append(mark, content);
      thread.appendChild(msg);
      scrollToBottom();
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const prompt = promptInput.value.trim();
      if (!prompt) return;

      promptInput.value = "";
      if (charCounter) charCounter.textContent = `0 / ${MAX_PROMPT_LENGTH}`;
      appendUserMessage(prompt);

      submitBtn.disabled = true;

      try {
        if (currentMode === "image") {
          appendPendingMessage("Generating high-resolution AI art...");
          const encodedPrompt = encodeURIComponent(prompt);
          const imageUrl = `${IMAGE_ENDPOINT}${encodedPrompt}?model=${IMAGE_MODEL}&width=1024&height=1024&nologo=true`;

          const img = new Image();
          img.onload = () => {
            appendAssistantImageMessage(prompt, imageUrl);
            submitBtn.disabled = false;
          };
          img.onerror = () => {
            appendAssistantImageMessage(prompt, imageUrl);
            submitBtn.disabled = false;
          };
          img.src = imageUrl;
        } else {
          const askedModel = currentModel;
          appendPendingMessage(`Asking ${modelName(askedModel)}...`);
          const responseText = await requestTextResponse(prompt, askedModel);
          appendAssistantTextMessage(responseText, askedModel);
          submitBtn.disabled = false;
        }
      } catch (err) {
        appendErrorMessage(err.message || "An unexpected error occurred. Please try again.");
        submitBtn.disabled = false;
      }
    });

    root.dataset.aiStudioV2Initialized = "true";
    return root;
  }

  function mountAIStudio(target) {
    const mountTarget = typeof target === "string" ? document.querySelector(target) : target;
    if (!mountTarget) return null;

    let root = mountTarget.matches("[data-ai-studio-root]") ? mountTarget : mountTarget.querySelector("[data-ai-studio-root]");
    if (!root) {
      mountTarget.innerHTML = STUDIO_MARKUP;
      root = mountTarget.firstElementChild;
    }
    return init(root);
  }

  PF.initAIStudio = init;
  PF.mountAIStudio = mountAIStudio;
  PF.aiStudio = { mount: mountAIStudio, models: TEXT_MODELS };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(document), { once: true });
  } else {
    init(document);
  }
})();
