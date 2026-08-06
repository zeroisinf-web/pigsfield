(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const MAX_PROMPT_LENGTH = 1800;
  const TEXT_ENDPOINT = new URL("/api/ai", window.location.origin).href;
  const IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/";
  const DEFAULT_TEXT_MODEL = "gemma-4-26b-a4b-it";
  const IMAGE_MODEL = "sana";
  const AI_CLIENT_STORAGE_KEY = "pigsfield-ai-client-v1";
  const trackedUrls = new Set();
  const outputUrls = new WeakMap();

  function assetUrl(path) {
    const base = document.documentElement.getAttribute("data-base") || "/";
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }

  const STUDIO_MARKUP = `
    <div data-ai-studio-root class="ai-studio-v2">
      <div class="ai-privacy">
        <span aria-hidden="true">🛡️</span>
        <span><strong>Free AI Studio</strong> · Text uses Cloudflare Workers AI (Gemma 4 26B); images use Pollinations. No login required.</span>
      </div>

      <div class="ai-launchpad" aria-label="External AI Launchpad">
        <div class="ai-launchpad-header">
          <span class="ai-launchpad-title">⚡ Quick AI Launchpad</span>
        </div>
        <div class="ai-launchpad-group">
          <a class="ai-ext-pill featured" href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener noreferrer" title="Open Artificial Analysis LLM Rankings">
            <img class="pill-logo" src="/assets/artificial-analysis-symbol.png" alt="" width="18" height="18" aria-hidden="true">
            <span class="pill-label">LLM Rankings</span>
            <span class="pill-badge">Top</span>
          </a>
          <a class="ai-ext-pill featured" href="https://qwen.ai/" target="_blank" rel="noopener noreferrer" title="Open Qwen Chat">
            <img class="pill-logo" src="/assets/qwen-symbol.png" alt="" width="18" height="18" aria-hidden="true">
            <span class="pill-label">Qwen.ai</span>
            <span class="pill-badge">Featured</span>
          </a>
        </div>
        <div class="ai-launchpad-scroll">
          <a class="ai-ext-pill" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/claude-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> Claude
          </a>
          <a class="ai-ext-pill" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/chatgpt-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> ChatGPT
          </a>
          <a class="ai-ext-pill" href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer">
            <span class="pill-emoji">🌙</span> Kimi
          </a>
          <a class="ai-ext-pill" href="https://www.meta.ai/" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/meta-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> Meta AI
          </a>
          <a class="ai-ext-pill" href="https://grok.com/" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/grok-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> Grok
          </a>
          <a class="ai-ext-pill" href="https://qwen.ai/" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/qwen-symbol.png" alt="" width="16" height="16" aria-hidden="true"> Qwen
          </a>
          <a class="ai-ext-pill" href="https://z.ai/chat" target="_blank" rel="noopener noreferrer">
            <span class="pill-emoji">⚡</span> Z.ai
          </a>
          <a class="ai-ext-pill" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/gemini-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> Gemini
          </a>
          <a class="ai-ext-pill" href="https://aistudio.google.com/prompts/new_chat" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/gemini-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> Google AI Studio
          </a>
          <a class="ai-ext-pill" href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">
            <img class="pill-logo" src="/assets/deepseek-symbol.svg" alt="" width="16" height="16" aria-hidden="true"> DeepSeek
          </a>
        </div>
      </div>

      <div class="creator-layout">
        <div class="ai-control-bar">
          <div class="ai-model-tag">
            <span class="model-icon">◈</span>
            <span class="model-name">Gemma 4 26B A4B</span>
            <span class="model-status-dot" title="Online"></span>
          </div>

          <div class="ai-mode-toggle" role="radiogroup" aria-label="Select AI Mode">
            <button type="button" class="ai-mode-btn active" data-mode="chat" aria-checked="true">
              <span aria-hidden="true">💬</span> Chat
            </button>
            <button type="button" class="ai-mode-btn" data-mode="image" aria-checked="false">
              <span aria-hidden="true">🎨</span> Image
            </button>
          </div>

          <button type="button" class="ai-clear-btn" data-clear-chat title="Clear chat history">
            <span aria-hidden="true">🗑️</span> Clear
          </button>
        </div>

        <div class="ai-chat-thread" id="ai-chat-thread" aria-live="polite">
          <div class="ai-thread-welcome" id="ai-welcome-box">
            <div class="welcome-icon">✨</div>
            <h3>What would you like to create or learn today?</h3>
            <p>Type a question in <strong>Chat</strong> mode or switch the toggle to <strong>Image</strong> mode to generate AI artwork.</p>
          </div>
        </div>

        <form class="ai-unified-form" id="ai-unified-form">
          <div class="ai-input-wrapper">
            <textarea id="ai-unified-prompt" name="prompt" maxlength="1800" required placeholder="Ask anything, explain a concept, or write code..."></textarea>
            <div class="ai-input-footer">
              <span class="ai-char-counter" id="ai-char-counter">0 / 1800</span>
              <button class="button brand ai-submit-btn" type="submit" id="ai-submit-btn">
                <span class="btn-icon">✨</span> <span class="btn-text">Send</span>
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

  function formatMarkdown(text) {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
      return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`;
    });
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    escaped = escaped.replace(/^### (.*$)/gim, '<h4 class="ai-msg-h3">$1</h4>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h3 class="ai-msg-h2">$1</h3>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h2 class="ai-msg-h1">$1</h2>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ai-msg-li">$1</li>');
    escaped = escaped.replace(/(<li class="ai-msg-li">[\s\S]*?<\/li>)/g, '<ul class="ai-msg-ul">$1</ul>');
    const paragraphs = escaped.split(/\n\n+/);
    return paragraphs.map(p => {
      if (p.startsWith('<pre') || p.startsWith('<h') || p.startsWith('<ul')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
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

  async function requestTextResponse(prompt) {
    const response = await timedFetch(TEXT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Pigsfield-Client": aiClientId()
      },
      body: JSON.stringify({
        model: DEFAULT_TEXT_MODEL,
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

  function init(scope) {
    const root = scope && typeof scope.querySelector === "function"
      ? (scope.matches("[data-ai-studio-root]") ? scope : scope.querySelector("[data-ai-studio-root]"))
      : document.querySelector("[data-ai-studio-root]");

    if (!root) return null;
    if (root.dataset.aiStudioV2Initialized === "true") return root;

    let currentMode = "chat";
    const thread = root.querySelector("#ai-chat-thread");
    const welcomeBox = root.querySelector("#ai-welcome-box");
    const form = root.querySelector("#ai-unified-form");
    const promptInput = root.querySelector("#ai-unified-prompt");
    const charCounter = root.querySelector("#ai-char-counter");
    const submitBtn = root.querySelector("#ai-submit-btn");
    const modeBtns = root.querySelectorAll(".ai-mode-btn");
    const clearBtn = root.querySelector("[data-clear-chat]");

    if (!thread || !form || !promptInput) return null;

    // Resolve relative logo images if needed
    root.querySelectorAll("img.pill-logo").forEach(img => {
      const src = img.getAttribute("src");
      if (src && src.startsWith("/")) {
        img.src = assetUrl(src);
      }
    });

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

      if (mode === "image") {
        promptInput.placeholder = "Describe the image you want to generate (e.g. Solar system diagram, watercolor landscape)...";
        if (submitBtn) {
          submitBtn.querySelector(".btn-icon").textContent = "🎨";
          submitBtn.querySelector(".btn-text").textContent = "Generate Image";
        }
      } else {
        promptInput.placeholder = "Ask anything, explain a concept, or write code...";
        if (submitBtn) {
          submitBtn.querySelector(".btn-icon").textContent = "✨";
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

    function appendUserMessage(text) {
      if (welcomeBox && welcomeBox.parentNode === thread) {
        welcomeBox.remove();
      }
      const msg = element("div", "ai-msg ai-msg-user");
      msg.innerHTML = `
        <div class="ai-msg-avatar" title="You">👤</div>
        <div class="ai-msg-content">
          <div class="ai-msg-text">${escapeHtml(text)}</div>
        </div>`;
      thread.appendChild(msg);
      scrollToBottom();
    }

    function appendPendingMessage(label) {
      const msg = element("div", "ai-msg ai-msg-assistant is-pending");
      msg.id = "ai-pending-indicator";
      msg.innerHTML = `
        <div class="ai-msg-avatar" title="AI">🧠</div>
        <div class="ai-msg-content">
          <div class="ai-pending-body">
            <span class="ai-spinner"></span> <span>${escapeHtml(label || "Thinking...")}</span>
          </div>
        </div>`;
      thread.appendChild(msg);
      scrollToBottom();
      return msg;
    }

    function removePendingMessage() {
      const pending = thread.querySelector("#ai-pending-indicator");
      if (pending) pending.remove();
    }

    function appendAssistantTextMessage(text) {
      removePendingMessage();
      const msg = element("div", "ai-msg ai-msg-assistant");
      const content = element("div", "ai-msg-content");
      const textDiv = element("div", "ai-msg-text");
      textDiv.innerHTML = formatMarkdown(text);
      content.appendChild(textDiv);

      const copyBtn = element("button", "ai-copy-btn", "📋 Copy");
      copyBtn.type = "button";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = "✓ Copied!";
          setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 2000);
        } catch (_) {}
      });
      content.appendChild(copyBtn);

      msg.appendChild(element("div", "ai-msg-avatar", "🧠"));
      msg.appendChild(content);
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
            <button type="button" class="button small brand ai-dl-btn">📥 Download</button>
            <a class="button small ghost" href="${imageUrl}" target="_blank" rel="noopener">↗️ Full View</a>
          </div>
        </div>`;

      const dlBtn = card.querySelector(".ai-dl-btn");
      if (dlBtn) {
        dlBtn.addEventListener("click", () => {
          downloadImageBlob(imageUrl, `pigsfield-art-${safeSlug(prompt)}.jpg`);
        });
      }

      content.appendChild(card);
      msg.appendChild(element("div", "ai-msg-avatar", "🎨"));
      msg.appendChild(content);
      thread.appendChild(msg);
      scrollToBottom();
    }

    function appendErrorMessage(errorText) {
      removePendingMessage();
      const msg = element("div", "ai-msg ai-msg-assistant is-error");
      msg.innerHTML = `
        <div class="ai-msg-avatar">⚠️</div>
        <div class="ai-msg-content">
          <div class="ai-error-body">
            <strong>Could not finish creation</strong>
            <p>${escapeHtml(errorText)}</p>
          </div>
        </div>`;
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
          appendPendingMessage("Generating AI answer...");
          const responseText = await requestTextResponse(prompt);
          appendAssistantTextMessage(responseText);
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
  PF.aiStudio = { mount: mountAIStudio };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(document), { once: true });
  } else {
    init(document);
  }
})();
