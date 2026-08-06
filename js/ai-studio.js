(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const MAX_PROMPT_LENGTH = 1800;
  const TEXT_ENDPOINT = new URL("/api/ai", window.location.origin).href;
  const IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/";
  const DEFAULT_TEXT_MODEL = "gemma-4-26b-a4b-it";
  const TEXT_MODEL_STORAGE_KEY = "pigsfield-ai-text-model-v5";
  const AI_CLIENT_STORAGE_KEY = "pigsfield-ai-client-v1";
  const TEXT_MODELS = Object.freeze({
    "gemma-4-26b-a4b-it": Object.freeze({
      id: "gemma-4-26b-a4b-it",
      engine: "workers-ai",
      status: "Gemma 4 26B A4B · Cloudflare Workers AI · no visitor login or additional provider key"
    })
  });
  const IMAGE_MODEL = "sana";
  const PROVIDER_NOTE = "Text prompts go to Pigsfield's Cloudflare AI endpoint; image prompts go to Pollinations. No visitor login or additional provider key is required for the text model. Avoid personal or sensitive information and verify important output.";
  const trackedUrls = new Set();
  const outputUrls = new WeakMap();
  const STUDIO_MODES = ["ask", "image", "document", "voice", "music"];
  const TEXT_BACKED_MODES = new Set(["ask", "document"]);
  const STUDIO_RESERVED_IDS = [
    "ai-function-model-bar", "ai-text-model", "ai-model-status",
    "ask-form", "ask-prompt", "ask-form-prompt-count",
    "image-form", "image-prompt", "image-form-prompt-count",
    "document-form", "document-prompt", "document-format", "document-form-prompt-count",
    "voice-form", "voice-prompt", "voice-choice", "voice-form-prompt-count",
    "music-form", "music-prompt", "music-mood", "music-duration", "music-form-prompt-count"
  ].concat(STUDIO_MODES.flatMap((mode) => ["creator-tab-" + mode, "creator-panel-" + mode]));
  const STUDIO_MARKUP = `
    <div data-ai-studio-root>
      <div class="ai-privacy"><span aria-hidden="true">🛡️</span><span><strong>No visitor login or additional provider key.</strong> Text uses Pigsfield's Cloudflare AI endpoint with no model download; images use Pollinations. Avoid private data.</span></div>
      <nav class="ai-web-links" aria-label="Open AI rankings and Qwen Chat">
        <a class="ai-web-link" href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener noreferrer" aria-label="Open Artificial Analysis model rankings" title="Artificial Analysis"><img class="ai-brand-logo" src="/assets/artificial-analysis-symbol.png" alt="" width="53" height="53" aria-hidden="true"><span class="sr-only">Artificial Analysis</span></a>
        <a class="ai-web-link" href="https://chat.qwen.ai/" target="_blank" rel="noopener noreferrer" aria-label="Open Qwen Chat" title="Qwen Chat"><img class="ai-brand-logo" src="/assets/qwen-symbol.png" alt="" width="80" height="80" aria-hidden="true"><span class="sr-only">Qwen Chat</span></a>
      </nav>
      <div class="creator-layout">
        <div class="ai-command-bar" id="ai-function-model-bar">
          <div class="creator-tabs" role="tablist" aria-label="Choose an AI function">
            <button class="creator-tab active" type="button" role="tab" data-mode="ask" aria-selected="true" title="Tutor"><span class="creator-tab-icon" aria-hidden="true">🧠</span><span class="creator-tab-label">Tutor</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="image" aria-selected="false" title="Image"><span class="creator-tab-icon" aria-hidden="true">🎨</span><span class="creator-tab-label">Image</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="document" aria-selected="false" title="Document"><span class="creator-tab-icon" aria-hidden="true">📄</span><span class="creator-tab-label">Document</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="voice" aria-selected="false" title="Voice"><span class="creator-tab-icon" aria-hidden="true">🔊</span><span class="creator-tab-label">Voice</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="music" aria-selected="false" title="Music"><span class="creator-tab-icon" aria-hidden="true">🎵</span><span class="creator-tab-label">Music</span></button>
          </div>
          <label class="ai-model-picker" for="ai-text-model"><span aria-hidden="true">◈</span><span class="sr-only">Deep reasoning model</span><select id="ai-text-model" name="text-model" aria-describedby="ai-model-status">
            <option value="gemma-4-26b-a4b-it">Gemma 4 26B A4B</option>
          </select></label>
        </div>
        <p class="ai-model-status" id="ai-model-status" role="status" aria-live="polite"></p>
        <div class="creator-stage">
          <section class="creator-panel" data-panel="ask" role="tabpanel">
            <h2><span aria-hidden="true">🧠</span> Tutor</h2><p>Explain · quiz · plan</p>
            <form id="ask-form"><div class="field"><label for="ask-prompt">Ask</label><textarea id="ask-prompt" name="prompt" maxlength="1800" required placeholder="Explain photosynthesis for Class 7, then quiz me."></textarea></div><button class="button brand" type="submit">✨ Answer</button></form>
            <div class="creator-output" aria-live="polite"></div>
          </section>
          <section class="creator-panel" data-panel="image" role="tabpanel" hidden>
            <h2><span aria-hidden="true">🎨</span> Image</h2><p><code>sana</code> · cloud</p>
            <form id="image-form"><div class="field"><label for="image-prompt">Describe</label><textarea id="image-prompt" name="prompt" maxlength="1200" required placeholder="Educational cutaway of rainwater harvesting in an Indian school."></textarea></div><button class="button brand" type="submit">🎨 Generate</button></form>
            <div class="creator-output" aria-live="polite"></div>
          </section>
          <section class="creator-panel" data-panel="document" role="tabpanel" hidden>
            <h2><span aria-hidden="true">📄</span> Document</h2><p>Notes · lesson · plan</p>
            <form id="document-form"><div class="field"><label for="document-prompt">Brief</label><textarea id="document-prompt" name="prompt" maxlength="1800" required placeholder="Create a 7-day Class 10 science revision plan."></textarea></div><div class="field"><label for="document-format">Format</label><select id="document-format" name="format"><option value="md">Markdown (.md)</option><option value="txt">Text (.txt)</option><option value="html">Web (.html)</option></select></div><button class="button brand" type="submit">📄 Create</button></form>
            <div class="creator-output" aria-live="polite"></div>
          </section>
          <section class="creator-panel" data-panel="voice" role="tabpanel" hidden>
            <h2><span aria-hidden="true">🔊</span> Voice</h2><p>Browser voice · on device</p>
            <form id="voice-form"><div class="field"><label for="voice-prompt">Text</label><textarea id="voice-prompt" name="prompt" maxlength="1200" required placeholder="Read this revision note clearly…"></textarea></div><div class="field"><label for="voice-choice">Voice</label><select id="voice-choice" name="voice"><option value="">Automatic browser voice</option></select></div><button class="button brand" type="submit">🔊 Play</button></form>
            <div class="creator-output" aria-live="polite"></div>
          </section>
          <section class="creator-panel" data-panel="music" role="tabpanel" hidden>
            <h2><span aria-hidden="true">🎵</span> Music</h2><p>Browser synth · on device</p>
            <form id="music-form"><div class="field"><label for="music-prompt">Theme</label><input id="music-prompt" name="prompt" maxlength="180" required placeholder="Morning focus before an exam"></div><div class="field-row"><div class="field"><label for="music-mood">Mood</label><select id="music-mood" name="mood"><option value="hopeful">Hopeful</option><option value="calm">Calm</option><option value="focused">Focused</option><option value="playful">Playful</option></select></div><div class="field"><label for="music-duration">Length</label><select id="music-duration" name="duration"><option value="8">8 seconds</option><option value="12">12 seconds</option><option value="20">20 seconds</option></select></div></div><button class="button brand" type="submit">🎵 Compose</button></form>
            <div class="creator-output" aria-live="polite"></div>
          </section>
        </div>
      </div>
    </div>`;
  let speechVoicesListenerBound = false;

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

  function queryWithin(scope, selector) {
    const root = scope && typeof scope.querySelector === "function" ? scope : document;
    if (root.nodeType === 1 && typeof root.matches === "function" && root.matches(selector)) return root;
    return root.querySelector(selector);
  }

  function studioLayoutWithin(scope) {
    return queryWithin(scope, ".creator-layout");
  }

  function studioRootFor(layout) {
    return layout && (layout.closest("[data-ai-studio-root]") || layout);
  }

  function normalizeTextModel(value) {
    const key = String(value || "");
    return Object.prototype.hasOwnProperty.call(TEXT_MODELS, key) ? key : DEFAULT_TEXT_MODEL;
  }

  function storedTextModel() {
    try {
      return normalizeTextModel(window.localStorage.getItem(TEXT_MODEL_STORAGE_KEY));
    } catch (_) {
      return DEFAULT_TEXT_MODEL;
    }
  }

  function persistTextModel(value) {
    try { window.localStorage.setItem(TEXT_MODEL_STORAGE_KEY, normalizeTextModel(value)); } catch (_) {}
  }

  function selectedTextModelFor(source) {
    const root = source && typeof source.closest === "function"
      ? (source.closest("[data-ai-studio-root]") || document)
      : document;
    const select = queryWithin(root, "#ai-text-model");
    return TEXT_MODELS[normalizeTextModel(select && select.value)];
  }

  function modeEngineStatus(mode) {
    if (mode === "image") return "sana · Pollinations cloud image model";
    if (mode === "voice") return "SpeechSynthesis · browser or operating-system voice";
    if (mode === "music") return "OfflineAudioContext · generated on this device";
    return "";
  }

  function setModelStatus(message) {
    document.querySelectorAll("#ai-model-status").forEach((status) => { status.textContent = message; });
  }

  function setupModelControls(scope) {
    const root = studioRootFor(scope) || scope || document;
    const select = queryWithin(root, "#ai-text-model");
    const status = queryWithin(root, "#ai-model-status");
    if (!select) return;

    const stored = storedTextModel();
    select.value = stored;
    const update = () => {
      const key = normalizeTextModel(select.value);
      const model = TEXT_MODELS[key];
      const mode = root.dataset.aiMode || "ask";
      const textBacked = TEXT_BACKED_MODES.has(mode);
      select.value = key;
      select.disabled = !textBacked;
      select.closest(".ai-model-picker")?.classList.toggle("is-disabled", !textBacked);
      if (status) {
        status.textContent = textBacked
          ? model.status
          : modeEngineStatus(mode);
      }
      persistTextModel(key);
    };
    if (select.dataset.aiModelBound !== "true") {
      select.addEventListener("change", update);
      root.addEventListener("pf:ai-mode-changed", update);
      select.dataset.aiModelBound = "true";
    }
    update();
  }

  function textModelNote(result) {
    const resolved = cleanText(result && result.model, 120) || DEFAULT_TEXT_MODEL;
    return resolved + " · Cloudflare Workers AI · no visitor login or additional provider key";
  }

  function resolveMountTarget(target) {
    if (typeof target === "string") {
      try { return document.querySelector(target); } catch (_) { return null; }
    }
    return target && target.nodeType === 1 ? target : null;
  }

  function isEffectivelyEmpty(target) {
    return !Array.from(target.childNodes).some((node) => {
      return node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim());
    });
  }

  function hasReservedIdCollision() {
    return STUDIO_RESERVED_IDS.some((id) => document.getElementById(id));
  }

  function actionButton(label, onClick, className) {
    const button = element("button", className || "button small ghost", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function actionLink(label, href, className) {
    const link = element("a", className || "button small ghost", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.referrerPolicy = "strict-origin-when-cross-origin";
    return link;
  }

  function safeSlug(value) {
    if (typeof PF.slug === "function") return PF.slug(value);
    return String(value || "pigsfield-creation")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "pigsfield-creation";
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

  function cleanText(value, maximum) {
    const text = String(value == null ? "" : value).replace(/\u0000/g, "").trim();
    return maximum && text.length > maximum ? text.slice(0, maximum - 1).trimEnd() + "…" : text;
  }

  function cleanupOutput(output) {
    const urls = outputUrls.get(output) || [];
    urls.forEach((url) => {
      URL.revokeObjectURL(url);
      trackedUrls.delete(url);
    });
    outputUrls.delete(output);
    output.replaceChildren();
    output.removeAttribute("role");
    output.removeAttribute("aria-busy");
  }

  function objectUrlFor(output, blob) {
    const url = URL.createObjectURL(blob);
    const urls = outputUrls.get(output) || [];
    urls.push(url);
    outputUrls.set(output, urls);
    trackedUrls.add(url);
    return url;
  }

  function beginOutput(output, label) {
    cleanupOutput(output);
    output.setAttribute("aria-live", "polite");
    output.setAttribute("aria-busy", "false");
    output.appendChild(element("p", "section-kicker", label));
    return output;
  }

  function renderPending(output, message, mode) {
    beginOutput(output, "Experimental creator");
    output.setAttribute("role", "status");
    output.setAttribute("aria-busy", "true");
    output.appendChild(element("h3", "", message));
    const note = mode === "browser-speech"
      ? "Speech playback uses a voice installed or supplied by your browser or operating system."
      : mode === "cloud"
        ? "This prompt is sent to the named cloud provider. Do not include private data."
        : "This creation is being made locally in your browser. Your prompt does not leave this device.";
    output.appendChild(element("p", "progress-note", note));
  }

  function friendlyError(error, usesNetwork) {
    if (error && error.code === "prompt") return error.message;
    if (error && error.code === "unsupported") return error.message;
    if (error && (error.code === "timeout" || error.name === "AbortError")) {
      return "The generator took too long to respond. Shared capacity can be busy; please wait a moment and try again.";
    }
    if (error && error.status === 429) {
      return "The anonymous shared-service rate limit has been reached. Wait a minute, shorten the prompt, and try again—no API key is needed.";
    }
    if (error && (error.status === 401 || error.status === 403)) {
      return "The provider refused this request. No API key should be entered here; try a simpler, non-sensitive prompt in a moment.";
    }
    if (error && (error.status === 400 || error.status === 413 || error.status === 422)) {
      return "The provider could not process this prompt. Shorten it, remove unusual symbols, and try again.";
    }
    if (error && error.status >= 500) {
      return "The shared provider is temporarily unavailable. Your work was not saved here; please try again shortly.";
    }
    if (usesNetwork && error && (error.code === "network" || error instanceof TypeError)) {
      return "The anonymous generator could not be reached. Check your connection and any privacy, ad-blocking, or cross-origin restrictions, then try again.";
    }
    return cleanText(error && error.message, 260) || "The creation could not be completed. Please try again.";
  }

  function renderError(output, error, usesNetwork) {
    beginOutput(output, "Creation unavailable");
    output.setAttribute("role", "alert");
    output.appendChild(element("h3", "", "We could not finish this creation"));
    output.appendChild(element("p", "", friendlyError(error, usesNetwork)));
    output.appendChild(element("p", "progress-note", usesNetwork ? PROVIDER_NOTE : "Nothing was uploaded. This local creator needs a browser with the required media APIs and enough free memory."));
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

  function providerError(response, detail) {
    return new StudioError(cleanText(detail, 180) || "The provider rejected the request.", response.status, "provider");
  }

  function contentText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        return part.text || part.content || "";
      }).filter(Boolean).join("\n");
    }
    if (content && typeof content === "object") return content.text || content.content || "";
    return "";
  }

  function finalAnswerText(value) {
    let output = String(value || "");
    const finalMarker = output.lastIndexOf("</think>");
    if (finalMarker >= 0) output = output.slice(finalMarker + 8);
    output = output.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/gi, "");
    return cleanText(output);
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

  async function requestHostedText(prompt, task, model, details) {
    const response = await timedFetch(TEXT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Pigsfield-Client": aiClientId()
      },
      body: JSON.stringify({
        model: model.id,
        task: task,
        prompt: prompt,
        format: details && details.format
      })
    }, 100000);
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}
    if (!response.ok) throw providerError(response, data && data.error || raw);
    const text = data == null ? raw : contentText(data.text);
    const cleaned = finalAnswerText(text);
    if (!cleaned) throw new StudioError("The provider returned an empty result.", 502, "provider");
    return {
      text: cleaned,
      model: cleanText(data && data.model, 120) || model.id,
      engine: cleanText(data && data.engine, 80) || model.engine
    };
  }

  async function requestText(prompt, task, model, details) {
    const selected = model && TEXT_MODELS[normalizeTextModel(model.id)] || TEXT_MODELS[DEFAULT_TEXT_MODEL];
    return requestHostedText(prompt, task, selected, details);
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

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function showNote(output, message) {
    if (typeof PF.toast === "function") {
      PF.toast(message);
      return;
    }
    const note = element("p", "progress-note", message);
    output.appendChild(note);
  }

  async function downloadRemoteImage(url, filename, button, output) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing download…";
    try {
      const response = await timedFetch(url, { method: "GET", headers: { "Accept": "image/*" } }, 120000);
      if (!response.ok) throw providerError(response, "Image download failed.");
      const blob = await response.blob();
      if (!blob.size) throw new StudioError("The image file was empty.", 502, "provider");
      const extension = blob.type === "image/jpeg" ? ".jpg" : blob.type === "image/webp" ? ".webp" : ".png";
      downloadBlob(blob, filename.replace(/\.[a-z0-9]+$/i, extension));
    } catch (_) {
      const opened = window.open(url, "_blank", "noopener");
      showNote(output, opened
        ? "Your browser blocked the cross-origin download, so the full image was opened. Use Save image from that tab."
        : "Your browser blocked the cross-origin download. Use Open full image, then save it from the new tab.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function formValue(form, name, fallback) {
    const field = form.elements && form.elements.namedItem(name);
    const value = field && typeof field.value === "string" ? field.value.trim() : "";
    return value || fallback;
  }

  function selectedDuration(form, fallback, minimum, maximum) {
    const raw = formValue(form, "duration", String(fallback)).toLowerCase();
    const aliases = { short: 8, medium: 15, long: 30 };
    const parsed = aliases[raw] || Number((raw.match(/[\d.]+/) || [])[0]) || fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  function outputFor(form) {
    const panel = form.closest(".creator-panel");
    return (panel && panel.querySelector(".creator-output")) || form.querySelector(".creator-output");
  }

  function creationBoundary(form, mode) {
    if (mode !== "text") return mode;
    return "cloud";
  }

  function setBusy(form, busy) {
    form.dataset.busy = busy ? "true" : "false";
    form.setAttribute("aria-busy", busy ? "true" : "false");
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((control) => {
      control.disabled = busy;
    });
  }

  async function runCreation(form, pendingMessage, mode, task) {
    if (form.dataset.busy === "true") return;
    const output = outputFor(form);
    const input = form.querySelector('[name="prompt"]');
    if (!output || !input) return;
    input.setCustomValidity("");
    const prompt = String(input.value || "").trim();
    if (!prompt) {
      input.setCustomValidity("Enter a prompt to begin.");
      input.reportValidity();
      input.focus();
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      renderError(output, new StudioError("Keep the prompt to 1,800 characters or fewer.", 0, "prompt"), false);
      input.focus();
      return;
    }

    const boundary = creationBoundary(form, mode);
    setBusy(form, true);
    renderPending(output, pendingMessage, boundary);
    try {
      await task({ form, input, output, prompt });
    } catch (error) {
      renderError(output, error, boundary === "cloud");
    } finally {
      setBusy(form, false);
    }
  }

  function setupPromptField(form) {
    const input = form.querySelector('[name="prompt"]');
    if (!input || input.dataset.promptLimitReady === "true") return;
    input.dataset.promptLimitReady = "true";
    input.maxLength = MAX_PROMPT_LENGTH;
    const counter = element("p", "progress-note");
    counter.id = (form.id || "creator") + "-prompt-count";
    const describedBy = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (!describedBy.includes(counter.id)) describedBy.push(counter.id);
    input.setAttribute("aria-describedby", describedBy.join(" "));
    const update = () => {
      input.setCustomValidity("");
      counter.textContent = String(input.value.length) + " / " + MAX_PROMPT_LENGTH.toLocaleString("en-IN") + " characters";
    };
    input.insertAdjacentElement("afterend", counter);
    input.addEventListener("input", update);
    update();
  }

  function bindForm(scope, id, pendingMessage, mode, task) {
    const form = queryWithin(scope, "#" + id);
    if (!form || form.dataset.aiStudioBound === "true") return;
    form.dataset.aiStudioBound = "true";
    setupPromptField(form);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runCreation(form, pendingMessage, mode, task);
    });
  }

  function setupTabs(scope) {
    const root = scope && typeof scope.querySelectorAll === "function" ? scope : document;
    const tabs = Array.from(root.querySelectorAll(".creator-tab[data-mode]"));
    const panels = Array.from(root.querySelectorAll(".creator-panel[data-panel]"));
    if (!tabs.length || !panels.length) return function () {};
    const tablist = tabs[0].parentElement;
    if (tablist) tablist.setAttribute("role", "tablist");

    tabs.forEach((tab, index) => {
      const mode = tab.dataset.mode;
      const panel = panels.find((candidate) => candidate.dataset.panel === mode);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      if (!tab.id) tab.id = "creator-tab-" + safeSlug(mode || String(index));
      if (panel) {
        if (!panel.id) panel.id = "creator-panel-" + safeSlug(mode || String(index));
        tab.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panel.tabIndex = 0;
      }
    });

    function activate(mode, moveFocus) {
      const selected = tabs.find((tab) => tab.dataset.mode === mode && panels.some((panel) => panel.dataset.panel === mode)) || tabs[0];
      const selectedMode = selected.dataset.mode;
      tabs.forEach((tab) => {
        const active = tab === selected;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== selectedMode;
      });
      const studioRoot = studioRootFor(root);
      if (studioRoot) {
        studioRoot.dataset.aiMode = selectedMode;
        studioRoot.dispatchEvent(new CustomEvent("pf:ai-mode-changed", { detail: { mode: selectedMode } }));
      }
      if (moveFocus) selected.focus();
    }

    tabs.forEach((tab, index) => {
      if (tab.dataset.aiStudioTabBound === "true") return;
      tab.dataset.aiStudioTabBound = "true";
      tab.addEventListener("click", () => activate(tab.dataset.mode, false));
      tab.addEventListener("keydown", (event) => {
        let target = index;
        if (["ArrowRight", "ArrowDown"].includes(event.key)) target = (index + 1) % tabs.length;
        else if (["ArrowLeft", "ArrowUp"].includes(event.key)) target = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(tabs[target].dataset.mode, true);
      });
    });

    const initial = tabs.find((tab) => tab.getAttribute("aria-selected") === "true" || tab.classList.contains("active"));
    activate((initial || tabs[0]).dataset.mode, false);
    return activate;
  }

  function removeUnsupportedModes(scope) {
    const supported = {
      voice: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
      music: "OfflineAudioContext" in window || "webkitOfflineAudioContext" in window
    };
    Object.entries(supported).forEach(([mode, available]) => {
      if (available) return;
      queryWithin(scope, `.creator-tab[data-mode="${mode}"]`)?.remove();
      queryWithin(scope, `.creator-panel[data-panel="${mode}"]`)?.remove();
    });
  }

  function renderTextAnswer(output, result) {
    const shell = beginOutput(output, "Experimental AI answer");
    shell.appendChild(element("h3", "", "Answer"));
    const pre = element("pre");
    pre.textContent = result.text;
    shell.appendChild(pre);
    shell.appendChild(element("p", "progress-note ai-model-used", textModelNote(result)));
    shell.appendChild(element("p", "progress-note", "AI can make mistakes. Check important facts against a textbook, official source, or teacher."));
  }

  async function createAnswer(context) {
    const model = selectedTextModelFor(context.form);
    const answer = await requestText(context.prompt, "tutor", model);
    renderTextAnswer(context.output, answer);
  }

  function normalizeDocumentFormat(value) {
    const format = String(value || "md").toLowerCase().replace(/^\./, "");
    if (format === "html" || format === "htm") return "html";
    if (format === "txt" || format === "text" || format === "plain") return "txt";
    return "md";
  }

  function documentFile(text, format, title) {
    if (format === "html") {
      const safeTitle = escapeHtml(title);
      const safeText = escapeHtml(text);
      return {
        extension: "html",
        type: "text/html;charset=utf-8",
        content: "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>" + safeTitle + "</title>\n<style>body{max-width:52rem;margin:3rem auto;padding:0 1.25rem;font:17px/1.65 system-ui,sans-serif;color:#17211d}pre{white-space:pre-wrap;font:inherit}</style>\n</head>\n<body><main><h1>" + safeTitle + "</h1><pre>" + safeText + "</pre></main></body>\n</html>"
      };
    }
    return {
      extension: format === "txt" ? "txt" : "md",
      type: format === "txt" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8",
      content: text
    };
  }

  async function createDocument(context) {
    const format = normalizeDocumentFormat(formValue(context.form, "format", "md"));
    const model = selectedTextModelFor(context.form);
    const result = await requestText(context.prompt, "document", model, { format: format });
    const text = result.text;
    const title = cleanText(context.prompt.replace(/[\r\n]+/g, " "), 72) || "Pigsfield document";
    const file = documentFile(text, format, title);
    const filename = safeSlug(title) + "." + file.extension;
    const shell = beginOutput(context.output, "Experimental AI document");
    shell.appendChild(element("h3", "", "Document preview"));
    const preview = element("pre");
    preview.textContent = text;
    shell.appendChild(preview);
    shell.appendChild(element("p", "progress-note ai-model-used", textModelNote(result)));
    const actions = element("div", "output-actions");
    actions.appendChild(actionButton("Download ." + file.extension, () => {
      downloadBlob(new Blob([file.content], { type: file.type }), filename);
    }, "button small secondary"));
    shell.appendChild(actions);
    shell.appendChild(element("p", "progress-note", format === "html"
      ? "The HTML download safely escapes the AI text instead of executing it as code. Review the content before sharing."
      : "Review facts and wording before sharing or submitting this experimental document."));
  }

  function loadImage(url, prompt) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = window.setTimeout(() => {
        image.src = "";
        reject(new StudioError("The image took too long to load.", 0, "timeout"));
      }, 120000);
      image.className = "generated-image";
      image.alt = "AI-generated image for: " + cleanText(prompt.replace(/[\r\n]+/g, " "), 140);
      image.decoding = "async";
      image.referrerPolicy = "strict-origin-when-cross-origin";
      image.addEventListener("load", () => {
        window.clearTimeout(timer);
        resolve(image);
      }, { once: true });
      image.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new StudioError("The generated image could not be loaded.", 0, "network"));
      }, { once: true });
      image.src = url;
    });
  }

  async function createImage(context) {
    const url = IMAGE_ENDPOINT + encodeURIComponent(context.prompt) + "?model=" + encodeURIComponent(IMAGE_MODEL) + "&safe=true&referrer=pigsfield.com";
    const image = await loadImage(url, context.prompt);
    const shell = beginOutput(context.output, "Experimental AI image");
    shell.appendChild(image);
    const actions = element("div", "output-actions");
    actions.appendChild(actionLink("Open full image", url));
    const download = actionButton("Download image", function () {
      downloadRemoteImage(url, safeSlug(context.prompt) + ".jpg", download, context.output);
    }, "button small secondary");
    actions.appendChild(download);
    shell.appendChild(actions);
    shell.appendChild(element("p", "progress-note ai-model-used", "Image provider: Pollinations anonymous; model: " + IMAGE_MODEL + ". Results are experimental; check details, text, bias, and suitability before reuse."));
  }

  function availableSpeechVoices() {
    return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  }

  function populateSpeechVoices(scope) {
    const select = queryWithin(scope || document, "#voice-choice");
    if (!select || !("speechSynthesis" in window)) return;
    const previous = select.value;
    const voices = availableSpeechVoices();
    select.textContent = "";
    const automatic = document.createElement("option");
    automatic.value = "";
    automatic.textContent = "Automatic browser voice";
    select.appendChild(automatic);
    voices
      .slice()
      .sort((a, b) => String(a.lang).localeCompare(String(b.lang)) || String(a.name).localeCompare(String(b.name)))
      .forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.voiceURI;
        option.textContent = voice.name + " · " + voice.lang + (voice.localService ? " · device" : "");
        select.appendChild(option);
      });
    if (voices.some((voice) => voice.voiceURI === previous)) select.value = previous;
  }

  function ensureSpeechVoicesListener() {
    if (speechVoicesListenerBound || !("speechSynthesis" in window)) return;
    speechVoicesListenerBound = true;
    window.speechSynthesis.addEventListener("voiceschanged", () => populateSpeechVoices(document));
  }

  async function createVoice(context) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      throw new StudioError("This browser does not provide text-to-speech playback.", 0, "unsupported");
    }
    const requestedVoice = formValue(context.form, "voice", "");
    const voices = availableSpeechVoices();
    const chosen = voices.find((voice) => voice.voiceURI === requestedVoice);
    const utterance = new SpeechSynthesisUtterance(context.prompt);
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = /[\u0900-\u097f]/.test(context.prompt) ? "hi-IN" : (document.documentElement.lang || "en-IN");
    }
    utterance.rate = 0.96;
    utterance.pitch = 1;

    const shell = beginOutput(context.output, "Browser voice preview");
    shell.appendChild(element("h3", "", "Ready to listen"));
    shell.appendChild(element("p", "", context.prompt));
    const status = element("p", "progress-note", "Choose Play to hear this text with the selected browser or operating-system voice.");
    utterance.addEventListener("start", () => { status.textContent = "Speaking…"; });
    utterance.addEventListener("end", () => { status.textContent = "Playback finished."; });
    utterance.addEventListener("error", () => { status.textContent = "This voice could not speak the text. Choose another installed voice and try again."; });

    const play = () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    const actions = element("div", "output-actions");
    actions.appendChild(actionButton("Play voice", play, "button small secondary"));
    actions.appendChild(actionButton("Pause / resume", () => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      else window.speechSynthesis.pause();
    }));
    actions.appendChild(actionButton("Stop", () => window.speechSynthesis.cancel()));
    actions.appendChild(actionButton("Download transcript", () => {
      downloadBlob(new Blob([context.prompt], { type: "text/plain;charset=utf-8" }), safeSlug(context.prompt) + "-voice-script.txt");
    }));
    shell.appendChild(actions);
    shell.appendChild(status);
    shell.appendChild(element("p", "progress-note", "Browsers do not expose installed speech as a downloadable audio file. This honest preview avoids a login or hidden API key; voice quality, language support and network use depend on your browser or operating system."));
    play();
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function musicPreset(mood) {
    const key = String(mood || "hopeful").toLowerCase();
    if (key.includes("calm") || key.includes("peace")) return { name: "calm", bpm: 78, scale: [0, 2, 4, 7, 9], progression: [0, 5, 3, 4], minor: false, wave: "sine", density: 0.54, percussion: 0.28 };
    if (key.includes("focus") || key.includes("study")) return { name: "focused", bpm: 92, scale: [0, 2, 3, 7, 10], progression: [0, 3, 5, 2], minor: true, wave: "triangle", density: 0.58, percussion: 0.42 };
    if (key.includes("energy") || key.includes("upbeat")) return { name: "energetic", bpm: 124, scale: [0, 2, 4, 7, 9], progression: [0, 5, 7, 4], minor: false, wave: "square", density: 0.84, percussion: 0.9 };
    if (key.includes("cinema") || key.includes("epic")) return { name: "cinematic", bpm: 82, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 8, 5, 7], minor: true, wave: "sawtooth", density: 0.62, percussion: 0.58 };
    if (key.includes("joy") || key.includes("happy")) return { name: "joyful", bpm: 112, scale: [0, 2, 4, 7, 9], progression: [0, 7, 5, 4], minor: false, wave: "triangle", density: 0.76, percussion: 0.72 };
    if (key.includes("play")) return { name: "playful", bpm: 116, scale: [0, 2, 4, 7, 9], progression: [0, 4, 7, 5], minor: false, wave: "square", density: 0.78, percussion: 0.76 };
    return { name: "hopeful", bpm: 102, scale: [0, 2, 4, 7, 9], progression: [0, 5, 3, 7], minor: false, wave: "triangle", density: 0.68, percussion: 0.56 };
  }

  function midiFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function scheduleTone(context, destination, options, trackDuration) {
    const start = Math.max(0, options.start);
    const duration = Math.min(options.duration, trackDuration - start);
    if (duration <= 0.025) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(options.frequency, start);
    const attack = Math.min(options.attack || 0.035, duration * 0.35);
    const release = Math.min(options.release || 0.12, duration * 0.45);
    const peak = Math.max(0.0002, options.gain || 0.04);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.setValueAtTime(peak, Math.max(start + attack, start + duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    if (typeof context.createStereoPanner === "function" && options.pan) {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.pan)), start);
      gain.connect(panner);
      panner.connect(destination);
    } else gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function scheduleKick(context, destination, start, trackDuration) {
    if (start >= trackDuration) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(125, start);
    oscillator.frequency.exponentialRampToValueAtTime(43, Math.min(trackDuration, start + 0.16));
    gain.gain.setValueAtTime(0.22, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(trackDuration, start + 0.2));
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(Math.min(trackDuration, start + 0.21));
  }

  function scheduleNoise(context, destination, start, length, gainAmount, highpass, random, trackDuration) {
    const duration = Math.min(length, trackDuration - start);
    if (duration <= 0.01) return;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "highpass";
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(gainAmount, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(start);
  }

  function startOfflineRendering(context) {
    return new Promise((resolve, reject) => {
      let settled = false;
      context.oncomplete = (event) => {
        if (settled) return;
        settled = true;
        resolve(event.renderedBuffer);
      };
      try {
        const result = context.startRendering();
        if (result && typeof result.then === "function") {
          result.then((buffer) => {
            if (settled) return;
            settled = true;
            resolve(buffer);
          }, (error) => {
            if (settled) return;
            settled = true;
            reject(error);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async function renderInstrumental(prompt, mood, duration) {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new StudioError("This browser does not support local offline audio creation.", 0, "unsupported");
    const sampleRate = 32000;
    let context;
    try {
      context = new OfflineContext(2, Math.ceil(duration * sampleRate), sampleRate);
    } catch (_) {
      throw new StudioError("The browser could not reserve enough memory for this audio. Try a shorter duration.", 0, "unsupported");
    }
    const preset = musicPreset(mood);
    const seed = hashString(prompt + "|" + preset.name + "|" + duration);
    const random = mulberry32(seed);
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = 0.72;
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;
    master.connect(compressor);
    compressor.connect(context.destination);

    const beat = 60 / preset.bpm;
    const bar = beat * 4;
    const root = 45 + (seed % 8);
    const chordShape = preset.minor ? [0, 3, 7] : [0, 4, 7];
    for (let start = 0, barIndex = 0; start < duration; start += bar, barIndex += 1) {
      const chordRoot = root + preset.progression[barIndex % preset.progression.length];
      chordShape.forEach((interval, voice) => {
        scheduleTone(context, master, {
          start: start,
          duration: Math.min(bar + 0.12, duration - start),
          frequency: midiFrequency(chordRoot + interval + 12),
          type: voice === 0 ? "sine" : "triangle",
          gain: 0.027,
          attack: 0.2,
          release: 0.35,
          pan: (voice - 1) * 0.34
        }, duration);
      });
    }

    for (let start = 0, stepIndex = 0; start < duration; start += beat / 2, stepIndex += 1) {
      if (random() > preset.density) continue;
      const degree = preset.scale[Math.floor(random() * preset.scale.length)];
      const octave = random() > 0.78 ? 24 : 12;
      scheduleTone(context, master, {
        start: start,
        duration: beat * (random() > 0.72 ? 1.2 : 0.62),
        frequency: midiFrequency(root + degree + octave),
        type: preset.wave,
        gain: preset.name === "energetic" ? 0.042 : 0.052,
        attack: 0.018,
        release: 0.11,
        pan: random() * 0.8 - 0.4
      }, duration);
      if (stepIndex % 4 === 0) {
        scheduleTone(context, master, {
          start: start,
          duration: beat * 1.7,
          frequency: midiFrequency(root - 12 + preset.progression[Math.floor(start / bar) % preset.progression.length]),
          type: "sine",
          gain: 0.085,
          attack: 0.025,
          release: 0.18
        }, duration);
      }
    }

    for (let start = 0, beatIndex = 0; start < duration; start += beat, beatIndex += 1) {
      if (preset.percussion < 0.35 && beatIndex % 2) continue;
      if (beatIndex % 4 === 0 || (preset.percussion > 0.7 && beatIndex % 4 === 2)) scheduleKick(context, master, start, duration);
      if (beatIndex % 4 === 1 || beatIndex % 4 === 3) {
        scheduleNoise(context, master, start, 0.12, 0.045 * preset.percussion, 1400, random, duration);
      }
      scheduleNoise(context, master, start + beat / 2, 0.045, 0.022 * preset.percussion, 5200, random, duration);
    }
    return startOfflineRendering(context);
  }

  function writeAscii(view, offset, text) {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  }

  function encodeWav(audioBuffer) {
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const dataLength = length * channels * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataLength, true);
    const channelData = [];
    for (let channel = 0; channel < channels; channel += 1) channelData.push(audioBuffer.getChannelData(channel));
    let offset = 44;
    for (let frame = 0; frame < length; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  async function createMusic(context) {
    const mood = formValue(context.form, "mood", "hopeful");
    const duration = selectedDuration(context.form, 15, 5, 45);
    const audioBuffer = await renderInstrumental(context.prompt, mood, duration);
    const blob = encodeWav(audioBuffer);
    const shell = beginOutput(context.output, "Experimental local music");
    shell.appendChild(element("h3", "", "Your " + musicPreset(mood).name + " instrumental"));
    shell.appendChild(element("p", "", duration + " seconds • deterministic from this prompt • created on this device"));
    const url = objectUrlFor(context.output, blob);
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = url;
    shell.appendChild(audio);
    const filename = safeSlug(context.prompt) + "-" + safeSlug(mood) + ".wav";
    const actions = element("div", "output-actions");
    actions.appendChild(actionButton("Download .wav", () => downloadBlob(blob, filename), "button small secondary"));
    actions.appendChild(actionButton("Open audio", () => window.open(url, "_blank", "noopener,noreferrer")));
    shell.appendChild(actions);
    shell.appendChild(element("p", "progress-note", "This instrumental is synthesized with your browser's OfflineAudioContext. The same prompt, mood, and duration produce the same composition; nothing is uploaded."));
  }

  function init(scope) {
    const layout = studioLayoutWithin(scope || document);
    if (!layout) return null;
    removeUnsupportedModes(layout);
    const activate = setupTabs(layout);
    PF.aiStudio = Object.assign(PF.aiStudio || {}, {
      activate: activate,
      mount: mountAIStudio,
      maxPromptLength: MAX_PROMPT_LENGTH,
      textModels: Object.keys(TEXT_MODELS),
      defaultTextModel: DEFAULT_TEXT_MODEL,
      textProvider: "cloudflare-ai",
      imageModel: IMAGE_MODEL,
    });

    setupModelControls(layout);
    bindForm(layout, "ask-form", "Thinking with the selected model…", "text", createAnswer);
    bindForm(layout, "image-form", "Creating a safe image…", "cloud", createImage);
    bindForm(layout, "document-form", "Drafting with the selected model…", "text", createDocument);
    bindForm(layout, "voice-form", "Preparing a browser voice…", "browser-speech", createVoice);
    bindForm(layout, "music-form", "Composing and rendering locally…", "local", createMusic);
    populateSpeechVoices(layout);
    ensureSpeechVoicesListener();
    if (PF.applyLanguageTo) PF.applyLanguageTo(layout);
    layout.dataset.aiStudioInitialized = "true";
    return layout;
  }

  function mountAIStudio(target) {
    const mountTarget = resolveMountTarget(target);
    if (!mountTarget) return null;

    const containedLayout = studioLayoutWithin(mountTarget);
    if (containedLayout) {
      init(containedLayout);
      return studioRootFor(containedLayout);
    }

    const existingLayout = studioLayoutWithin(document);
    if (existingLayout) {
      init(existingLayout);
      return studioRootFor(existingLayout);
    }

    if (!isEffectivelyEmpty(mountTarget) || hasReservedIdCollision()) return null;

    const template = document.createElement("template");
    template.innerHTML = STUDIO_MARKUP;
    const parsedRoot = template.content.firstElementChild;
    if (!parsedRoot || parsedRoot.querySelector("script")) return null;

    let studioRoot = parsedRoot;
    if (mountTarget.matches("[data-ai-studio-root]")) {
      mountTarget.replaceChildren(...Array.from(parsedRoot.childNodes));
      mountTarget.setAttribute("data-ai-studio-root", "");
      studioRoot = mountTarget;
    } else {
      mountTarget.replaceChildren(parsedRoot);
    }

    if (!init(studioRoot)) {
      if (studioRoot === mountTarget) {
        studioRoot.replaceChildren();
        studioRoot.removeAttribute("data-ai-studio-root");
      } else studioRoot.remove();
      return null;
    }
    return studioRoot;
  }

  PF.initAIStudio = init;
  PF.mountAIStudio = mountAIStudio;
  PF.aiStudio = Object.assign(PF.aiStudio || {}, {
    mount: mountAIStudio,
    maxPromptLength: MAX_PROMPT_LENGTH,
    textModels: Object.keys(TEXT_MODELS),
    defaultTextModel: DEFAULT_TEXT_MODEL,
    imageModel: IMAGE_MODEL,
  });
  window.addEventListener("beforeunload", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    trackedUrls.forEach((url) => URL.revokeObjectURL(url));
    trackedUrls.clear();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init(document), { once: true });
  else init(document);
})();
