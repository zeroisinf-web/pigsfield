(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const MAX_PROMPT_LENGTH = 1800;
  const TEXT_ENDPOINT = "https://text.pollinations.ai/openai";
  const IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/";
  const WEBLLM_MODULE = "https://esm.run/@mlc-ai/web-llm@0.2.84";
  const AI_STUDIO_SCRIPT_URL = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL("js/ai-studio.js", document.baseURI).href;
  const WEBLLM_WORKER_URL = new URL("ai-worker.js", AI_STUDIO_SCRIPT_URL).href;
  const DEFAULT_TEXT_MODEL = "gpt-oss-20b";
  const TEXT_MODEL_STORAGE_KEY = "pigsfield-ai-text-model-v2";
  const TEXT_MODELS = Object.freeze({
    "gpt-oss-20b": Object.freeze({
      id: "gpt-oss-20b",
      engine: "pollinations",
      route: "openai-fast",
      status: "Anonymous cloud reasoning · no download"
    }),
    "Qwen3.5-2B-q4f16_1-MLC": Object.freeze({
      id: "Qwen3.5-2B-q4f16_1-MLC",
      engine: "webllm",
      memory: "~2.3 GB GPU memory",
      status: "On device · ~1.1 GB first-use download · WebGPU"
    }),
    "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC": Object.freeze({
      id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
      engine: "webllm",
      memory: "~5.2 GB GPU memory",
      status: "On device · ~4.3 GB first-use download · WebGPU"
    })
  });
  const IMAGE_MODEL = "sana";
  const DEEP_REASONING_INSTRUCTION = "Reason carefully before answering. Check assumptions, explain the useful reasoning in a clear structure, and end with a concise conclusion. Never expose hidden chain-of-thought or invent citations.";
  const PROVIDER_NOTE = "Cloud text and image prompts go to Pollinations. On-device text models stay in this browser after their model files download. No API key is stored. Avoid personal or sensitive information and verify important output.";
  const trackedUrls = new Set();
  const outputUrls = new WeakMap();
  const STUDIO_MODES = ["ask", "image", "document", "voice", "video", "music"];
  const TEXT_BACKED_MODES = new Set(["ask", "document", "video"]);
  const STUDIO_RESERVED_IDS = [
    "ai-function-model-bar", "ai-text-model", "ai-model-status",
    "ask-form", "ask-prompt", "ask-form-prompt-count",
    "image-form", "image-prompt", "image-form-prompt-count",
    "document-form", "document-prompt", "document-format", "document-form-prompt-count",
    "voice-form", "voice-prompt", "voice-choice", "voice-form-prompt-count",
    "video-form", "video-prompt", "video-duration", "video-canvas", "video-form-prompt-count",
    "music-form", "music-prompt", "music-mood", "music-duration", "music-form-prompt-count"
  ].concat(STUDIO_MODES.flatMap((mode) => ["creator-tab-" + mode, "creator-panel-" + mode]));
  let webLLMModulePromise = null;
  let webLLMEngine = null;
  let webLLMModelId = "";
  let webLLMWorker = null;
  const confirmedLocalModels = new Set();
  const STUDIO_MARKUP = `
    <div data-ai-studio-root>
      <div class="ai-privacy"><span aria-hidden="true">🛡️</span><span><strong>No keys.</strong> Cloud modes send prompts to Pollinations; device models stay here. Avoid private data and verify important output.</span></div>
      <div class="creator-layout">
        <div class="ai-command-bar" id="ai-function-model-bar">
          <div class="creator-tabs" role="tablist" aria-label="Choose an AI function">
            <button class="creator-tab active" type="button" role="tab" data-mode="ask" aria-selected="true" title="Tutor"><span class="creator-tab-icon" aria-hidden="true">🧠</span><span class="creator-tab-label">Tutor</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="image" aria-selected="false" title="Image"><span class="creator-tab-icon" aria-hidden="true">🎨</span><span class="creator-tab-label">Image</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="document" aria-selected="false" title="Document"><span class="creator-tab-icon" aria-hidden="true">📄</span><span class="creator-tab-label">Document</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="voice" aria-selected="false" title="Voice"><span class="creator-tab-icon" aria-hidden="true">🔊</span><span class="creator-tab-label">Voice</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="video" aria-selected="false" title="Video"><span class="creator-tab-icon" aria-hidden="true">🎬</span><span class="creator-tab-label">Video</span></button>
            <button class="creator-tab" type="button" role="tab" data-mode="music" aria-selected="false" title="Music"><span class="creator-tab-icon" aria-hidden="true">🎵</span><span class="creator-tab-label">Music</span></button>
          </div>
          <label class="ai-model-picker" for="ai-text-model"><span aria-hidden="true">◈</span><span class="sr-only">Deep reasoning model</span><select id="ai-text-model" name="text-model" aria-describedby="ai-model-status">
            <option value="gpt-oss-20b">gpt-oss-20b</option>
            <option value="Qwen3.5-2B-q4f16_1-MLC">Qwen3.5-2B-q4f16_1-MLC</option>
            <option value="DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC">DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC</option>
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
          <section class="creator-panel" data-panel="video" role="tabpanel" hidden>
            <h2><span aria-hidden="true">🎬</span> Video</h2><p>AI captions · browser-rendered WebM</p>
            <form id="video-form"><div class="field"><label for="video-prompt">Topic</label><textarea id="video-prompt" name="prompt" maxlength="1200" required placeholder="Explain the water cycle in four short scenes."></textarea></div><div class="field"><label for="video-duration">Length</label><select id="video-duration" name="duration"><option value="8">8 seconds</option><option value="12">12 seconds</option><option value="16">16 seconds</option></select></div><button class="button brand" type="submit">🎬 Render</button></form>
            <div class="creator-output" aria-live="polite"></div><canvas class="video-canvas" id="video-canvas" width="1280" height="720" hidden></canvas>
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

    const hasWebGPU = "gpu" in navigator;
    Array.from(select.options).forEach((option) => {
      const model = TEXT_MODELS[normalizeTextModel(option.value)];
      option.disabled = model.engine === "webllm" && !hasWebGPU;
    });
    const stored = storedTextModel();
    select.value = TEXT_MODELS[stored].engine === "webllm" && !hasWebGPU ? DEFAULT_TEXT_MODEL : stored;
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
          ? model.id + " · " + model.status + (model.memory ? " · " + model.memory : "")
          : modeEngineStatus(mode);
        if (textBacked && !hasWebGPU) status.textContent += " · device models disabled: WebGPU unavailable";
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
    return resolved + (result && result.engine === "webllm" ? " · on-device WebLLM" : " · Pollinations anonymous cloud");
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
        ? "This prompt is sent to the named Pollinations cloud model. Do not include private data."
        : mode === "device-model"
          ? "The model runs on this device. First use may download and cache its model files."
          : "This creation is being made locally in your browser. Your prompt does not leave this device.";
    output.appendChild(element("p", "progress-note", note));
  }

  function friendlyError(error, usesNetwork) {
    if (error && error.code === "prompt") return error.message;
    if (error && error.code === "unsupported") return error.message;
    if (error && (error.code === "timeout" || error.name === "AbortError")) {
      return "The free generator took too long to respond. Shared capacity can be busy; please wait a moment and try again.";
    }
    if (error && error.status === 429) {
      return "The anonymous free-service rate limit has been reached. Wait a minute, shorten the prompt, and try again—no API key is needed.";
    }
    if (error && (error.status === 401 || error.status === 403)) {
      return "The free provider refused this request. No API key should be entered here; try a simpler, non-sensitive prompt in a moment.";
    }
    if (error && (error.status === 400 || error.status === 413 || error.status === 422)) {
      return "The provider could not process this prompt. Shorten it, remove unusual symbols, and try again.";
    }
    if (error && error.status >= 500) {
      return "The shared free provider is temporarily unavailable. Your work was not saved here; please try again shortly.";
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

  async function requestPollinationsText(prompt, systemPrompt, model) {
    const response = await timedFetch(TEXT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/plain;q=0.9" },
      body: JSON.stringify({
        model: model.route,
        stream: false,
        reasoning_effort: "high",
        safe: true,
        messages: [
          { role: "system", content: systemPrompt + " " + DEEP_REASONING_INSTRUCTION },
          { role: "user", content: prompt }
        ]
      })
    }, 100000);
    const raw = await response.text();
    if (!response.ok) throw providerError(response, raw);

    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}
    const text = data == null ? raw : (
      contentText(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      contentText(data.message && data.message.content) ||
      contentText(data.output_text) ||
      contentText(data.output) ||
      contentText(data.text) ||
      (typeof data === "string" ? data : "")
    );
    const cleaned = finalAnswerText(text);
    if (!cleaned) throw new StudioError("The provider returned an empty result.", 502, "provider");
    return {
      text: cleaned,
      model: cleanText(data && data.model, 120) || model.id,
      engine: "pollinations"
    };
  }

  async function loadWebLLMModule() {
    if (!webLLMModulePromise) {
      webLLMModulePromise = import(WEBLLM_MODULE).catch(() => {
        webLLMModulePromise = null;
        throw new StudioError("The on-device AI runtime could not load. Check the connection or choose gpt-oss-20b.", 0, "network");
      });
    }
    return webLLMModulePromise;
  }

  async function unloadWebLLMEngine() {
    if (webLLMEngine) {
      try {
        if (typeof webLLMEngine.unload === "function") await webLLMEngine.unload();
      } catch (_) {}
    }
    if (webLLMWorker) webLLMWorker.terminate();
    webLLMEngine = null;
    webLLMModelId = "";
    webLLMWorker = null;
  }

  function confirmLocalModelLoad(model) {
    if (confirmedLocalModels.has(model.id)) return true;
    const approved = window.confirm(
      "Download " + model.id + " for private on-device use?\n\n" +
      model.status + " · " + model.memory + ". The browser will cache the model files."
    );
    if (approved) confirmedLocalModels.add(model.id);
    return approved;
  }

  async function ensureWebLLMEngine(model) {
    if (!("gpu" in navigator)) {
      throw new StudioError("This browser does not provide WebGPU. Choose gpt-oss-20b or use a current desktop browser with WebGPU.", 0, "unsupported");
    }
    if (webLLMEngine && webLLMModelId === model.id) return webLLMEngine;
    if (!confirmLocalModelLoad(model)) {
      throw new StudioError("On-device model download cancelled. Choose gpt-oss-20b to continue without a model download.", 0, "cancelled");
    }
    await unloadWebLLMEngine();
    const webllm = await loadWebLLMModule();
    if (!webllm || typeof webllm.CreateWebWorkerMLCEngine !== "function" || typeof Worker !== "function") {
      throw new StudioError("The on-device AI runtime is unavailable. Choose gpt-oss-20b.", 0, "unsupported");
    }

    setModelStatus(model.id + " · preparing on-device model…");
    try {
      webLLMWorker = new Worker(WEBLLM_WORKER_URL, { type: "module", name: "pigsfield-webllm" });
      webLLMEngine = await webllm.CreateWebWorkerMLCEngine(webLLMWorker, model.id, {
        initProgressCallback(report) {
          const percent = Number.isFinite(report && report.progress) ? Math.round(report.progress * 100) + "% · " : "";
          const detail = cleanText(report && report.text, 120) || "loading model files";
          setModelStatus(model.id + " · " + percent + detail);
        }
      });
      webLLMModelId = model.id;
      setModelStatus(model.id + " · ready on this device");
      return webLLMEngine;
    } catch (_) {
      await unloadWebLLMEngine();
      throw new StudioError("This device could not load " + model.id + ". It needs " + model.memory + "; choose gpt-oss-20b or a smaller device model.", 0, "unsupported");
    }
  }

  async function requestWebLLMText(prompt, systemPrompt, model) {
    const engine = await ensureWebLLMEngine(model);
    let response;
    try {
      response = await engine.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt + " " + DEEP_REASONING_INSTRUCTION },
          { role: "user", content: prompt }
        ],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 900
      });
    } catch (_) {
      throw new StudioError(model.id + " could not finish this request. Shorten the prompt, close memory-heavy tabs, or choose gpt-oss-20b.", 0, "provider");
    }
    const text = contentText(response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content);
    const cleaned = finalAnswerText(text);
    if (!cleaned) throw new StudioError("The on-device model returned no final answer.", 0, "provider");
    return { text: cleaned, model: model.id, engine: "webllm" };
  }

  async function requestText(prompt, systemPrompt, model) {
    const selected = model && TEXT_MODELS[normalizeTextModel(model.id)] || TEXT_MODELS[DEFAULT_TEXT_MODEL];
    return selected.engine === "webllm"
      ? requestWebLLMText(prompt, systemPrompt, selected)
      : requestPollinationsText(prompt, systemPrompt, selected);
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
      downloadBlob(blob, filename);
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
    return selectedTextModelFor(form).engine === "webllm" ? "device-model" : "cloud";
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
    const answer = await requestText(context.prompt,
      "You are Pigsfield's free educational assistant for learners in India. Answer in the user's language, explain clearly, use practical examples, distinguish facts from uncertainty, and never invent citations. Be inclusive and concise. Return plain text with readable line breaks.", model);
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
    const formatInstruction = format === "md"
      ? "Write polished Markdown with a title, short introduction, useful headings, and a practical conclusion."
      : "Write polished plain text with clear headings and no Markdown or HTML symbols.";
    const result = await requestText(context.prompt,
      "You create accurate, inclusive educational documents for Pigsfield. " + formatInstruction + " Return only the document itself, with no commentary about the task. Do not invent sources or statistics.", model);
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
      downloadRemoteImage(url, safeSlug(context.prompt) + ".png", download, context.output);
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

  function parseStoryboard(raw, prompt) {
    let parsed = null;
    const withoutFences = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const firstBrace = withoutFences.indexOf("{");
    const lastBrace = withoutFences.lastIndexOf("}");
    try {
      parsed = JSON.parse(firstBrace >= 0 && lastBrace > firstBrace ? withoutFences.slice(firstBrace, lastBrace + 1) : withoutFences);
    } catch (_) {}

    let candidates = [];
    if (parsed && Array.isArray(parsed.scenes)) candidates = parsed.scenes;
    if (!candidates.length) {
      const lines = withoutFences
        .replace(/([.!?])\s+/g, "$1\n")
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.):]|scene\s*\d+\s*[:.-]?)\s*/i, "").trim())
        .filter((line) => line.length > 4 && !/^[{}\[\],]+$/.test(line));
      candidates = lines.map((line) => ({ caption: line, visual: "Simple animated shapes and bold, readable typography" }));
    }
    if (!candidates.length) candidates = [{ caption: cleanText(raw, 180), visual: "Simple animated shapes and bold typography" }];

    const scenes = [];
    for (let index = 0; index < 4; index += 1) {
      const source = candidates[index] || candidates[index % candidates.length] || {};
      const caption = typeof source === "string" ? source : (source.caption || source.text || source.narration || source.title || "");
      const visual = typeof source === "object" && source ? (source.visual || source.direction || source.image || "") : "";
      scenes.push({
        caption: cleanText(caption || ("Part " + (index + 1) + ": " + prompt), 190),
        visual: cleanText(visual || "Simple animated shapes and bold, readable typography", 130)
      });
    }
    return {
      title: cleanText(parsed && parsed.title ? parsed.title : prompt.replace(/[\r\n]+/g, " "), 80) || "Pigsfield story",
      scenes: scenes
    };
  }

  function clock(seconds) {
    const rounded = Math.max(0, Math.round(seconds));
    return Math.floor(rounded / 60) + ":" + String(rounded % 60).padStart(2, "0");
  }

  function storyboardText(story, duration) {
    const sceneLength = duration / story.scenes.length;
    const blocks = story.scenes.map((scene, index) => {
      return "SCENE " + (index + 1) + " (" + clock(index * sceneLength) + "–" + clock((index + 1) * sceneLength) + ")\nCaption: " + scene.caption + "\nVisual: " + scene.visual;
    });
    return story.title.toUpperCase() + "\n\n" + blocks.join("\n\n");
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

  function splitLongWord(context, word, maxWidth) {
    if (context.measureText(word).width <= maxWidth) return [word];
    const pieces = [];
    let current = "";
    Array.from(word).forEach((character) => {
      const candidate = current + character;
      if (current && context.measureText(candidate).width > maxWidth) {
        pieces.push(current);
        current = character;
      } else current = candidate;
    });
    if (current) pieces.push(current);
    return pieces;
  }

  function canvasLines(context, text, maxWidth, maximumLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean).flatMap((word) => splitLongWord(context, word, maxWidth));
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? line + " " + word : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    if (lines.length > maximumLines) {
      lines.length = maximumLines;
      let last = lines[maximumLines - 1];
      while (last && context.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      lines[maximumLines - 1] = last.trimEnd() + "…";
    }
    return lines;
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawStoryFrame(canvas, story, duration, elapsed) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const safeElapsed = Math.max(0, Math.min(duration - 0.001, elapsed));
    const sceneDuration = duration / story.scenes.length;
    const sceneIndex = Math.min(story.scenes.length - 1, Math.floor(safeElapsed / sceneDuration));
    const local = (safeElapsed - sceneIndex * sceneDuration) / sceneDuration;
    const scene = story.scenes[sceneIndex];
    const seed = hashString(story.title + sceneIndex);
    const hue = seed % 360;

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "hsl(" + hue + " 46% 16%)");
    gradient.addColorStop(0.55, "hsl(" + ((hue + 35) % 360) + " 52% 23%)");
    gradient.addColorStop(1, "hsl(" + ((hue + 78) % 360) + " 50% 12%)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalAlpha = 0.13;
    for (let index = 0; index < 7; index += 1) {
      const radius = 70 + ((seed >>> (index % 12)) % 150);
      const x = ((seed * (index + 3)) % width + local * width * (index % 2 ? -0.16 : 0.16) + width) % width;
      const y = ((seed * (index + 7)) % height + Math.sin(local * Math.PI * 2 + index) * 55 + height) % height;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = index % 2 ? "#ff9d2e" : "#74d7ac";
      context.fill();
    }
    context.restore();

    context.fillStyle = "#ff9933";
    context.fillRect(0, 0, width / 3, 9);
    context.fillStyle = "#f7f3e8";
    context.fillRect(width / 3, 0, width / 3, 9);
    context.fillStyle = "#138808";
    context.fillRect((width / 3) * 2, 0, width / 3, 9);

    const fade = Math.max(0.18, Math.min(1, local * 5, (1 - local) * 5));
    context.save();
    context.globalAlpha = fade;
    context.translate(0, (1 - Math.min(1, local * 4)) * 24);
    context.fillStyle = "rgba(255,255,255,.78)";
    context.font = "700 25px system-ui, sans-serif";
    context.fillText(story.title, 84, 94, width - 300);
    context.textAlign = "right";
    context.fillText("SCENE " + (sceneIndex + 1) + " / 4", width - 84, 94);
    context.textAlign = "left";

    roundedRect(context, 70, 145, width - 140, 390, 34);
    context.fillStyle = "rgba(4,14,11,.48)";
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.16)";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = "750 64px system-ui, sans-serif";
    const lines = canvasLines(context, scene.caption, width - 250, 4);
    const lineHeight = 78;
    const startY = 235 + Math.max(0, (3 - lines.length) * 28);
    lines.forEach((line, index) => context.fillText(line, 125, startY + index * lineHeight));

    context.fillStyle = "rgba(255,255,255,.72)";
    context.font = "400 25px system-ui, sans-serif";
    const visual = canvasLines(context, scene.visual, width - 250, 2);
    visual.forEach((line, index) => context.fillText(line, 125, 485 + index * 33));
    context.restore();

    context.fillStyle = "rgba(255,255,255,.74)";
    context.font = "600 22px system-ui, sans-serif";
    context.fillText("Pigsfield • made in your browser", 84, height - 58);
    const progressWidth = (width - 168) * Math.min(1, safeElapsed / duration);
    context.fillStyle = "rgba(255,255,255,.24)";
    context.fillRect(84, height - 35, width - 168, 5);
    context.fillStyle = "#ffb55c";
    context.fillRect(84, height - 35, progressWidth, 5);
  }

  function drawVideoPlaceholder(canvas) {
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1280, 720);
    gradient.addColorStop(0, "#102d25");
    gradient.addColorStop(1, "#0b1713");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1280, 720);
    context.fillStyle = "rgba(255,255,255,.92)";
    context.font = "750 58px system-ui, sans-serif";
    context.fillText("Your four-scene video starts here", 105, 325);
    context.fillStyle = "rgba(255,255,255,.65)";
    context.font = "400 28px system-ui, sans-serif";
    context.fillText("Write a prompt, then create a downloadable WebM.", 108, 382);
  }

  function videoRecordingSupported(canvas) {
    return Boolean(window.MediaRecorder && canvas && typeof canvas.captureStream === "function" && canvas.getContext("2d"));
  }

  function preferredVideoMime() {
    const choices = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== "function") return "";
    return choices.find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
  }

  function recordStoryboard(canvas, story, duration, onProgress) {
    return new Promise((resolve, reject) => {
      let stream;
      let recorder;
      let frameTimer;
      let stopTimer;
      let settled = false;
      const chunks = [];
      try {
        canvas.width = 1280;
        canvas.height = 720;
        drawStoryFrame(canvas, story, duration, 0);
        stream = canvas.captureStream(30);
        const mimeType = preferredVideoMime();
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 3500000 })
          : new MediaRecorder(stream, { videoBitsPerSecond: 3500000 });
      } catch (error) {
        if (stream) stream.getTracks().forEach((track) => track.stop());
        reject(new StudioError(error.message || "Video recording is not supported.", 0, "unsupported"));
        return;
      }

      const cleanup = () => {
        window.clearInterval(frameTimer);
        window.clearTimeout(stopTimer);
        if (stream) stream.getTracks().forEach((track) => track.stop());
      };
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("error", (event) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new StudioError((event.error && event.error.message) || "The browser stopped recording.", 0, "unsupported"));
      });
      recorder.addEventListener("stop", () => {
        if (settled) return;
        settled = true;
        cleanup();
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        if (!blob.size) reject(new StudioError("The browser produced an empty video.", 0, "unsupported"));
        else resolve(blob);
      });

      try {
        recorder.start(250);
      } catch (error) {
        settled = true;
        cleanup();
        reject(new StudioError(error.message || "Video recording could not start.", 0, "unsupported"));
        return;
      }
      const started = performance.now();
      let lastScene = -1;
      frameTimer = window.setInterval(() => {
        const elapsed = Math.min(duration, (performance.now() - started) / 1000);
        drawStoryFrame(canvas, story, duration, elapsed);
        const scene = Math.min(4, Math.floor(elapsed / (duration / 4)) + 1);
        if (scene !== lastScene) {
          lastScene = scene;
          onProgress(scene, elapsed);
        }
      }, 1000 / 30);
      stopTimer = window.setTimeout(() => {
        drawStoryFrame(canvas, story, duration, duration - 0.001);
        if (recorder.state !== "inactive") recorder.stop();
      }, duration * 1000 + 120);
    });
  }

  function videoResultShell(output, story, duration, textResult) {
    const text = storyboardText(story, duration);
    const shell = beginOutput(output, "Experimental AI video");
    shell.appendChild(element("h3", "", story.title));
    const summary = element("p", "", "A four-scene caption video and its editable storyboard.");
    shell.appendChild(summary);
    const preview = element("pre");
    preview.textContent = text;
    shell.appendChild(preview);
    shell.appendChild(element("p", "progress-note ai-model-used", textModelNote(textResult) + " The video itself is rendered locally in this browser."));
    const actions = element("div", "output-actions");
    actions.appendChild(actionButton("Download storyboard", () => {
      downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), safeSlug(story.title) + "-storyboard.txt");
    }));
    shell.appendChild(actions);
    const status = element("p", "progress-note");
    status.setAttribute("role", "status");
    shell.appendChild(status);
    return { shell: shell, preview: preview, actions: actions, status: status };
  }

  async function createVideo(context) {
    const duration = selectedDuration(context.form, 12, 6, 24);
    const model = selectedTextModelFor(context.form);
    const textResult = await requestText(context.prompt,
      "Create a safe, factual, silent social-video storyboard for an educational audience. Return JSON only, exactly: {\"title\":\"short title\",\"scenes\":[{\"caption\":\"one concise on-screen message\",\"visual\":\"simple visual direction\"}]}. Include exactly four scenes, each caption under 22 words. Do not use Markdown, quotations, URLs, unverifiable statistics, or copyrighted characters.", model);
    const story = parseStoryboard(textResult.text, context.prompt);
    const canvas = context.form.closest(".creator-panel") && context.form.closest(".creator-panel").querySelector("#video-canvas");
    const result = videoResultShell(context.output, story, duration, textResult);
    if (canvas) {
      canvas.hidden = false;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Preview of the four-scene caption video");
      drawStoryFrame(canvas, story, duration, 0);
    }
    if (!videoRecordingSupported(canvas)) {
      result.status.textContent = "This browser cannot record a canvas video. The complete storyboard fallback is ready to download.";
      return;
    }

    result.status.textContent = "Recording the video locally… keep this tab open for about " + duration + " seconds.";
    try {
      const blob = await recordStoryboard(canvas, story, duration, (scene) => {
        result.status.textContent = "Recording locally: scene " + scene + " of 4. Keep this tab open.";
      });
      const url = objectUrlFor(context.output, blob);
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;
      video.className = "video-canvas";
      result.shell.insertBefore(video, result.preview);
      result.actions.insertBefore(actionButton("Download .webm", () => {
        downloadBlob(blob, safeSlug(story.title) + ".webm");
      }, "button small secondary"), result.actions.firstChild);
      result.status.textContent = "The WebM was rendered entirely in your browser. It has no audio; edit or add licensed audio before publishing if needed.";
    } catch (error) {
      result.status.textContent = friendlyError(error, false) + " The storyboard fallback remains available.";
    }
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
    const activate = setupTabs(layout);
    PF.aiStudio = Object.assign(PF.aiStudio || {}, {
      activate: activate,
      mount: mountAIStudio,
      maxPromptLength: MAX_PROMPT_LENGTH,
      textModels: Object.keys(TEXT_MODELS),
      defaultTextModel: DEFAULT_TEXT_MODEL,
      webLLMVersion: "0.2.84",
      imageModel: IMAGE_MODEL,
    });

    setupModelControls(layout);
    bindForm(layout, "ask-form", "Thinking with the selected model…", "text", createAnswer);
    bindForm(layout, "image-form", "Creating a safe image…", "cloud", createImage);
    bindForm(layout, "document-form", "Drafting with the selected model…", "text", createDocument);
    bindForm(layout, "voice-form", "Preparing a browser voice…", "browser-speech", createVoice);
    bindForm(layout, "video-form", "Writing with the selected model…", "text", createVideo);
    bindForm(layout, "music-form", "Composing and rendering locally…", "local", createMusic);

    const canvas = queryWithin(layout, "#video-canvas");
    if (canvas && canvas.dataset.aiStudioCanvasReady !== "true") {
      drawVideoPlaceholder(canvas);
      canvas.dataset.aiStudioCanvasReady = "true";
    }
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
    webLLMVersion: "0.2.84",
    imageModel: IMAGE_MODEL,
  });
  window.addEventListener("beforeunload", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (webLLMWorker) webLLMWorker.terminate();
    webLLMWorker = null;
    webLLMEngine = null;
    webLLMModelId = "";
    trackedUrls.forEach((url) => URL.revokeObjectURL(url));
    trackedUrls.clear();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init(document), { once: true });
  else init(document);
})();
