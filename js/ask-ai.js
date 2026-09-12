(function () {
  "use strict";

  // Ask AI — the assistant that already knows what the learner is looking at.
  //
  // The studio's chat asked a visitor to describe their problem before it could help. On a
  // page that is already a lesson, a court process or a playing video, that description is
  // the whole question, and typing it is the work. This panel reads the open page instead:
  // it opens with things worth doing on *this* page, answers "explain this" without a this,
  // writes revision notes from the video that is playing, and will do all of it by voice.

  const PF = (window.PF = window.PF || {});
  const ASK_ENDPOINT = new URL("/api/ask", window.location.origin).href;
  const CLIENT_STORAGE_KEY = "pigsfield-ai-client-v1";
  const MAX_PROMPT_LENGTH = 1800;
  const MAX_PAGE_CHARACTERS = 6000;
  const MAX_TURNS = 12;

  function assetUrl(path) {
    const base = document.documentElement.getAttribute("data-base") || "/";
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }

  const askStyle = document.createElement("link");
  askStyle.rel = "stylesheet";
  askStyle.href = assetUrl("css/ask-ai.css?v=d1f8ac9aad2f");
  document.head.append(askStyle);

  const ICONS = {
    spark: '<path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z"/>',
    page: '<path d="M14 2.4H6.4a1.6 1.6 0 0 0-1.6 1.6v16a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6V7.6L14 2.4Zm-.6 6V4.2l4.2 4.2h-4.2ZM8 11.4h8v1.7H8v-1.7Zm0 3.6h8v1.7H8V15Z"/>',
    notes: '<path d="M6.4 2.4h11.2a1.6 1.6 0 0 1 1.6 1.6v16a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6V4a1.6 1.6 0 0 1 1.6-1.6Zm1.4 4.2v1.7h8.4V6.6H7.8Zm0 4v1.7h8.4v-1.7H7.8Zm0 4v1.7h5.6v-1.7H7.8Z"/>',
    mic: '<path d="M12 14.4a3 3 0 0 0 3-3V5.4a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5.4-3a5.4 5.4 0 0 1-10.8 0H4.8a7.2 7.2 0 0 0 6.3 7.1v2.9h1.8v-2.9a7.2 7.2 0 0 0 6.3-7.1h-1.8Z"/>',
    stop: '<path d="M6.6 6.6h10.8v10.8H6.6z"/>',
    sound: '<path d="M4.8 9.6v4.8h3.2l4 4V5.6l-4 4H4.8Zm11.6 2.4a3.6 3.6 0 0 0-2-3.2v6.4a3.6 3.6 0 0 0 2-3.2Zm-2-7v1.9a5.6 5.6 0 0 1 0 10.2v1.9a7.5 7.5 0 0 0 0-14Z"/>',
    mute: '<path d="M4.8 9.6v4.8h3.2l4 4V5.6l-4 4H4.8Zm14.9 2.4 2-2-1.3-1.3-2 2-2-2L15.1 10l2 2-2 2 1.3 1.3 2-2 2 2 1.3-1.3-2-2Z"/>',
    send: '<path d="M3.4 20.6 21.6 12 3.4 3.4 3.4 10l13 2-13 2 0 6.6Z"/>',
    user: '<path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.8c-3.7 0-7 1.9-7 4.2v1.8h14v-1.8c0-2.3-3.3-4.2-7-4.2Z"/>',
    alert: '<path d="M12 2.6 1.4 21h21.2L12 2.6Zm.9 14.7h-1.8v-1.8h1.8v1.8Zm0-3.6h-1.8V9.8h1.8v3.9Z"/>',
    video: '<path d="M4 5.4h11.2a1.6 1.6 0 0 1 1.6 1.6v2.5l4-2.6v10.2l-4-2.6V17a1.6 1.6 0 0 1-1.6 1.6H4A1.6 1.6 0 0 1 2.4 17V7A1.6 1.6 0 0 1 4 5.4Z"/>',
    refresh: '<path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"/>'
  };

  const icon = (name) => `<svg class="ask-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;

  const MARKUP = `
    <div data-ask-root class="ask-root">
      <div class="ask-context" data-ask-context>
        <span class="ask-context-mark" aria-hidden="true">${icon("page")}</span>
        <span class="ask-context-text"><strong data-ask-context-title>this page</strong><span data-ask-context-note>Reading what is open now.</span></span>
        <button type="button" class="ask-ghost-btn" data-ask-recheck title="Read the page again">${icon("refresh")}<span class="sr-only">Read the page again</span></button>
      </div>

      <div class="ask-suggestions" data-ask-suggestions role="group" aria-label="Suggested next steps"></div>

      <div class="ask-thread" data-ask-thread aria-live="polite">
        <div class="ask-welcome" data-ask-welcome>
          <span class="ask-welcome-mark" aria-hidden="true">${icon("spark")}</span>
          <h3>I can see this page.</h3>
          <p>Ask about anything on it — or just take one of the suggestions above. You can talk instead of typing, and turn a video into revision notes.</p>
        </div>
      </div>

      <div class="ask-actions" data-ask-actions>
        <button type="button" class="ask-action-btn is-primary" data-ask-notes hidden>${icon("notes")} <span>Make notes</span></button>
        <button type="button" class="ask-action-btn" data-ask-speak aria-pressed="false" title="Read answers aloud">${icon("mute")} <span>Read aloud</span></button>
      </div>

      <form class="ask-form" data-ask-form>
        <div class="ask-input-wrapper">
          <textarea data-ask-input name="prompt" maxlength="1800" rows="1" placeholder="Ask about this page…" aria-label="Ask about this page"></textarea>
          <div class="ask-input-actions">
            <button type="button" class="ask-mic-btn" data-ask-mic aria-pressed="false" title="Speak your question">${icon("mic")}<span class="sr-only">Speak your question</span></button>
            <button type="submit" class="ask-send-btn" data-ask-send title="Send">${icon("send")}<span class="sr-only">Send</span></button>
          </div>
        </div>
        <p class="ask-note">Answers can be wrong. Check anything that matters.</p>
      </form>
    </div>`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function escapeHtml(value) {
    if (typeof PF.escapeHtml === "function") return PF.escapeHtml(value);
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  /** Markdown the model actually emits. Block output carries its own blank lines, so the
   *  newline-to-<br> pass never runs inside a list, a heading or a code block. */
  const blockHtml = (html) => `\n\n${html}\n\n`;
  function formatMarkdown(text) {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (match, lang, code) => blockHtml(`<pre class="ask-code"><code>${code.trim()}</code></pre>`));
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="ask-inline-code">$1</code>');
    escaped = escaped.replace(/^#{4,6} (.*$)/gim, (match, heading) => blockHtml(`<h5>${heading}</h5>`));
    escaped = escaped.replace(/^### (.*$)/gim, (match, heading) => blockHtml(`<h4>${heading}</h4>`));
    escaped = escaped.replace(/^## (.*$)/gim, (match, heading) => blockHtml(`<h3>${heading}</h3>`));
    escaped = escaped.replace(/^# (.*$)/gim, (match, heading) => blockHtml(`<h2>${heading}</h2>`));
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    escaped = escaped.replace(/^[ \t]*\d+\.\s+(.*$)/gim, '<li class="ask-li ask-li-ordered">$1</li>');
    escaped = escaped.replace(/^[ \t]*[-*]\s+(.*$)/gim, '<li class="ask-li">$1</li>');
    escaped = escaped.replace(/(?:<li class="ask-li ask-li-ordered">[\s\S]*?<\/li>\s*)+/g, (run) => blockHtml(`<ol class="ask-list">${run.replace(/<\/li>\s*<li/g, "</li><li").trim()}</ol>`));
    escaped = escaped.replace(/(?:<li class="ask-li">[\s\S]*?<\/li>\s*)+/g, (run) => blockHtml(`<ul class="ask-list">${run.replace(/<\/li>\s*<li/g, "</li><li").trim()}</ul>`));
    return escaped.split(/\n\n+/).map((paragraph) => {
      const chunk = paragraph.trim();
      if (!chunk) return "";
      if (/^<(?:pre|ul|ol|h[2-5])\b/.test(chunk)) return chunk;
      return `<p>${chunk.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  function clientId() {
    try {
      let value = window.localStorage.getItem(CLIENT_STORAGE_KEY);
      if (!/^[a-z0-9-]{12,80}$/i.test(value || "")) {
        value = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "pf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        window.localStorage.setItem(CLIENT_STORAGE_KEY, value);
      }
      return value;
    } catch (_) {
      return "anonymous";
    }
  }

  // ---- What is on the page -------------------------------------------------------------

  /** The YouTube item the learner is playing, or the one this page is plainly about. */
  function currentVideo() {
    const player = document.querySelector("dialog.player-dialog[open]");
    if (player) {
      const source = player.querySelector("#player-source");
      const title = player.querySelector("#player-title");
      if (source && source.href) return { url: source.href, title: (title && title.textContent || "").trim(), playing: true };
    }
    const frame = document.querySelector('iframe[src*="youtube.com/embed/"], iframe[src*="youtube-nocookie.com/embed/"]');
    if (frame) return { url: frame.src, title: (frame.title || "").replace(/ — YouTube player$/, "").trim(), playing: true };
    const open = document.querySelector("dialog[open] a[data-youtube-play]");
    const anchor = open || document.querySelector("a[data-youtube-play]");
    if (anchor && anchor.href) return { url: anchor.href, title: (anchor.dataset.title || anchor.textContent || "").trim(), playing: false };
    return null;
  }

  const SKIP_TEXT = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEMPLATE", "IFRAME"]);

  /** Visible text, skipping our own panel, hidden nodes and the site chrome. */
  function visibleText(scope) {
    const parts = [];
    let length = 0;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (SKIP_TEXT.has(node.tagName)) return NodeFilter.FILTER_REJECT;
          if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
          if (node.closest("[data-ask-root], .support-dock, .site-header, .site-footer, .sr-only")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (length < MAX_PAGE_CHARACTERS) {
      const node = walker.nextNode();
      if (!node) break;
      const value = node.nodeValue.replace(/\s+/g, " ").trim();
      if (!value) continue;
      parts.push(value);
      length += value.length + 1;
    }
    return parts.join(" ").slice(0, MAX_PAGE_CHARACTERS);
  }

  /**
   * A dialog that is open is what the learner is actually reading, so it wins over the page
   * behind it: on PigBang the detail sheet is the content and the grid behind it is noise.
   */
  function readPage() {
    const dialog = [...document.querySelectorAll("dialog[open]")]
      .filter((node) => !node.classList.contains("ask-dialog") && !node.classList.contains("player-dialog"))
      .pop();
    const scope = dialog || document.querySelector("#main-content") || document.body;
    const headings = [...scope.querySelectorAll("h1, h2, h3")]
      .map((node) => node.textContent.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 40);
    const crumb = document.querySelector(".breadcrumbs [aria-current='page']");
    return {
      url: window.location.href,
      title: (dialog && headings[0]) || document.title,
      section: (crumb && crumb.textContent.trim()) || document.body.dataset.page || "",
      headings,
      text: visibleText(scope),
      video: currentVideo()
    };
  }

  function contextLabel(page) {
    if (page.video && page.video.title) return { title: page.video.title, note: page.video.playing ? "Watching this video now." : "Video on this page." };
    if (page.headings.length) return { title: page.headings[0], note: page.section ? `In ${page.section}.` : "Reading this page." };
    return { title: page.title || "this page", note: "Reading this page." };
  }

  // ---- Talking to the endpoint ---------------------------------------------------------

  async function ask(payload, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs || 60000);
    try {
      const response = await fetch(ASK_ENDPOINT, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Pigsfield-Client": clientId() },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data && data.error) || "Ask AI could not answer just now.");
      return data || {};
    } catch (error) {
      if (controller.signal.aborted) throw new Error("That took too long. Try a shorter question.");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  // ---- Voice ---------------------------------------------------------------------------

  function speechLanguage() {
    return document.documentElement.lang || "en-IN";
  }

  /** Dictation, where the browser offers it. Chrome and Safari do; Firefox does not, and the
   *  microphone is hidden there rather than offered and then failing. */
  function createListener(onText, onEnd) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = speechLanguage();
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let text = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) text += event.results[index][0].transcript;
      onText(text.trim(), event.results[event.results.length - 1].isFinal);
    };
    recognition.onerror = () => onEnd();
    recognition.onend = () => onEnd();
    return recognition;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    // Long answers are split on sentence ends: some engines silently truncate one very long
    // utterance, and a queue of short ones can also be stopped promptly.
    const chunks = String(text).replace(/[#*`_>]/g, "").match(/[^.!?。॥]+[.!?。॥]*/g) || [String(text)];
    for (const chunk of chunks) {
      const piece = chunk.trim();
      if (!piece) continue;
      const utterance = new SpeechSynthesisUtterance(piece);
      utterance.lang = speechLanguage();
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  // ---- Notes, and the printable sheet --------------------------------------------------

  /** The browser's own "Save as PDF" is the print dialog, so the notes are laid out for
   *  print and handed to it. No PDF library is loaded: the site's CSP allows no third-party
   *  script, and a print sheet reflows for A4 and Letter without one. */
  function printNotes(title, markdown) {
    const existing = document.getElementById("ask-print-sheet");
    if (existing) existing.remove();
    const sheet = element("div", "ask-print-sheet");
    sheet.id = "ask-print-sheet";
    sheet.innerHTML = `
      <header class="ask-print-head">
        <h1>${escapeHtml(title || "Study notes")}</h1>
        <p>Notes generated by Pigsfield Ask AI · ${escapeHtml(new Date().toLocaleDateString())} · pigsfield.com</p>
      </header>
      <div class="ask-print-body">${formatMarkdown(markdown)}</div>
      <footer class="ask-print-foot">Written by an AI assistant. Check anything that matters against your syllabus or the original source.</footer>`;
    document.body.appendChild(sheet);
    document.body.classList.add("is-ask-printing");
    const done = () => {
      document.body.classList.remove("is-ask-printing");
      sheet.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 60);
  }

  // ---- The panel -----------------------------------------------------------------------

  function init(scope) {
    const scopeElement = scope && typeof scope.querySelector === "function" ? scope : document;
    const root = typeof scopeElement.matches === "function" && scopeElement.matches("[data-ask-root]")
      ? scopeElement
      : scopeElement.querySelector("[data-ask-root]");
    if (!root || root.dataset.askInitialized === "true") return root || null;

    const thread = root.querySelector("[data-ask-thread]");
    const welcome = root.querySelector("[data-ask-welcome]");
    const suggestions = root.querySelector("[data-ask-suggestions]");
    const form = root.querySelector("[data-ask-form]");
    const input = root.querySelector("[data-ask-input]");
    const sendBtn = root.querySelector("[data-ask-send]");
    const micBtn = root.querySelector("[data-ask-mic]");
    const speakBtn = root.querySelector("[data-ask-speak]");
    const notesBtn = root.querySelector("[data-ask-notes]");
    const recheckBtn = root.querySelector("[data-ask-recheck]");
    const contextTitle = root.querySelector("[data-ask-context-title]");
    const contextNote = root.querySelector("[data-ask-context-note]");

    let page = readPage();
    let history = [];
    let busy = false;
    let readAloud = false;
    let listener = null;

    function setBusy(state) {
      busy = state;
      root.classList.toggle("is-busy", state);
      if (sendBtn) sendBtn.disabled = state;
      if (notesBtn) notesBtn.disabled = state;
    }

    function scrollToEnd() {
      thread.scrollTop = thread.scrollHeight;
    }

    function dropWelcome() {
      if (welcome && welcome.parentNode === thread) welcome.remove();
    }

    function addMessage(role, html, options) {
      dropWelcome();
      const message = element("div", `ask-msg ask-msg-${role}`);
      const avatar = element("div", `ask-avatar ask-avatar-${role}`);
      avatar.innerHTML = icon(role === "user" ? "user" : role === "error" ? "alert" : "spark");
      const bubble = element("div", "ask-bubble");
      const body = element("div", "ask-body");
      body.innerHTML = html;
      bubble.append(body);
      if (options && options.notes) {
        const actions = element("div", "ask-msg-actions");
        const save = element("button", "ask-ghost-btn");
        save.type = "button";
        save.innerHTML = `${icon("notes")} <span>Save as PDF</span>`;
        save.addEventListener("click", () => printNotes(options.notes.title, options.notes.markdown));
        actions.append(save);
        bubble.append(actions);
      }
      message.append(avatar, bubble);
      thread.append(message);
      scrollToEnd();
      return message;
    }

    function addPending(label) {
      dropWelcome();
      const message = element("div", "ask-msg ask-msg-model is-pending");
      const avatar = element("div", "ask-avatar ask-avatar-model");
      avatar.innerHTML = icon("spark");
      const bubble = element("div", "ask-bubble");
      bubble.innerHTML = `<span class="ask-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
      message.append(avatar, bubble);
      thread.append(message);
      scrollToEnd();
      return message;
    }

    function refreshContext() {
      page = readPage();
      const label = contextLabel(page);
      if (contextTitle) contextTitle.textContent = label.title;
      if (contextNote) contextNote.textContent = label.note;
      if (notesBtn) {
        notesBtn.hidden = !page.video;
        const caption = notesBtn.querySelector("span");
        if (caption) caption.textContent = page.video ? "Notes from this video" : "Make notes";
      }
      root.classList.toggle("has-video", Boolean(page.video));
    }

    function renderSuggestions(list) {
      suggestions.replaceChildren();
      if (!list.length) {
        suggestions.hidden = true;
        return;
      }
      suggestions.hidden = false;
      for (const item of list) {
        const chip = element("button", "ask-chip", item.label);
        chip.type = "button";
        chip.title = item.prompt;
        chip.addEventListener("click", () => {
          suggestions.hidden = true;
          submit(item.prompt);
        });
        suggestions.append(chip);
      }
    }

    async function loadSuggestions() {
      suggestions.hidden = false;
      suggestions.replaceChildren(element("span", "ask-chip is-loading", "Looking at this page…"));
      try {
        const data = await ask({ mode: "suggest", page, messages: [] }, 30000);
        renderSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (_) {
        // A failed suggestion round is not worth an error message: the composer still works.
        suggestions.hidden = true;
        suggestions.replaceChildren();
      }
    }

    async function submit(text) {
      const question = String(text || "").trim().slice(0, MAX_PROMPT_LENGTH);
      if (!question || busy) return;
      stopSpeaking();
      addMessage("user", `<p>${escapeHtml(question)}</p>`);
      history = history.concat({ role: "user", text: question }).slice(-MAX_TURNS);
      const pending = addPending("Thinking about this page…");
      setBusy(true);
      try {
        const data = await ask({ mode: "chat", page, messages: history, voice: readAloud }, 60000);
        pending.remove();
        addMessage("model", formatMarkdown(data.text || ""));
        history = history.concat({ role: "model", text: data.text || "" }).slice(-MAX_TURNS);
        if (readAloud) speak(data.text || "");
      } catch (error) {
        pending.remove();
        addMessage("error", `<p><strong>Could not answer.</strong> ${escapeHtml(error.message || "Please try again.")}</p>`);
      } finally {
        setBusy(false);
      }
    }

    async function makeNotes() {
      if (busy) return;
      refreshContext();
      const subject = (page.video && page.video.title) || page.headings[0] || page.title;
      const pending = addPending(page.video ? "Watching and writing notes — this can take a minute…" : "Writing notes from this page…");
      setBusy(true);
      try {
        const data = await ask({ mode: "notes", page, messages: [] }, 120000);
        pending.remove();
        const markdown = data.text || "";
        addMessage("model", formatMarkdown(markdown), { notes: { title: subject, markdown } });
        if (!data.usedVideo && page.video) {
          addMessage("model", "<p class=\"ask-caveat\">These notes were written from the title and the page text, not from the video's own audio.</p>");
        }
      } catch (error) {
        pending.remove();
        addMessage("error", `<p><strong>Could not write the notes.</strong> ${escapeHtml(error.message || "Please try again.")}</p>`);
      } finally {
        setBusy(false);
      }
    }

    function setListening(state) {
      micBtn.setAttribute("aria-pressed", state ? "true" : "false");
      micBtn.classList.toggle("is-listening", state);
      micBtn.innerHTML = (state ? icon("stop") : icon("mic")) + '<span class="sr-only">Speak your question</span>';
    }

    if (micBtn) {
      if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) micBtn.hidden = true;
      micBtn.addEventListener("click", () => {
        if (listener) {
          try { listener.stop(); } catch (_) {}
          return;
        }
        listener = createListener(
          (text, final) => {
            input.value = text;
            if (final) {
              const spoken = text;
              try { listener.stop(); } catch (_) {}
              input.value = "";
              submit(spoken);
            }
          },
          () => { listener = null; setListening(false); }
        );
        if (!listener) return;
        stopSpeaking();
        try {
          listener.start();
          setListening(true);
        } catch (_) {
          listener = null;
          setListening(false);
        }
      });
    }

    if (speakBtn) {
      if (!("speechSynthesis" in window)) speakBtn.hidden = true;
      speakBtn.addEventListener("click", () => {
        readAloud = !readAloud;
        speakBtn.setAttribute("aria-pressed", readAloud ? "true" : "false");
        speakBtn.classList.toggle("is-on", readAloud);
        speakBtn.innerHTML = (readAloud ? icon("sound") : icon("mute")) + ` <span>${readAloud ? "Reading aloud" : "Read aloud"}</span>`;
        if (!readAloud) stopSpeaking();
      });
    }

    if (notesBtn) notesBtn.addEventListener("click", makeNotes);
    if (recheckBtn) recheckBtn.addEventListener("click", () => { refreshContext(); loadSuggestions(); });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 160) + "px";
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = input.value;
      input.value = "";
      input.style.height = "auto";
      submit(question);
    });

    refreshContext();
    loadSuggestions();
    root.dataset.askInitialized = "true";
    return root;
  }

  function mountAskAI(target) {
    const mountTarget = typeof target === "string" ? document.querySelector(target) : target;
    if (!mountTarget) return null;
    let root = mountTarget.matches("[data-ask-root]") ? mountTarget : mountTarget.querySelector("[data-ask-root]");
    if (!root) {
      mountTarget.innerHTML = MARKUP;
      root = mountTarget.firstElementChild;
    }
    return init(root);
  }

  /** Re-read the page each time the panel is opened: the learner has usually moved on. */
  function refreshAskAI(target) {
    const mountTarget = typeof target === "string" ? document.querySelector(target) : target;
    const root = mountTarget && mountTarget.querySelector("[data-ask-root]");
    if (!root) return null;
    const recheck = root.querySelector("[data-ask-recheck]");
    if (recheck) recheck.click();
    return root;
  }

  /**
   * The dialog is built here rather than in the navigation shell, the way js/player.js
   * builds the video dialog: nothing about this panel weighs on a first visit that never
   * opens it.
   */
  let dialog = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "site-dialog ask-dialog";
    dialog.id = "ask-ai-dialog";
    dialog.setAttribute("aria-labelledby", "ask-ai-title");
    dialog.innerHTML = `
      <div class="dialog-head">
        <h2 id="ask-ai-title"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS.spark}</svg> Ask AI</h2>
        <button class="icon-button" type="button" data-close-dialog aria-label="Close Ask AI">×</button>
      </div>
      <div class="dialog-body ask-dialog-body"><div data-ask-mount></div></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("[data-close-dialog]").addEventListener("click", () => {
      stopSpeaking();
      if (typeof PF.closeDialog === "function") PF.closeDialog(dialog);
      else if (typeof dialog.close === "function") dialog.close();
    });
    dialog.addEventListener("close", stopSpeaking);
    return dialog;
  }

  /** Read the page, then cover it: the panel must never describe itself back to the model. */
  function open() {
    const host = ensureDialog();
    const mount = host.querySelector("[data-ask-mount]");
    const mounted = Boolean(mount.querySelector("[data-ask-root]"));
    if (!mounted) mountAskAI(mount);
    if (typeof PF.showDialog === "function") PF.showDialog(host);
    else if (typeof host.showModal === "function") host.showModal();
    else host.setAttribute("open", "");
    // On a second open the learner has almost certainly moved on, so re-read what is there.
    if (mounted) refreshAskAI(mount);
    if (typeof PF.applyLanguageTo === "function") PF.applyLanguageTo(host);
    return host;
  }

  PF.mountAskAI = mountAskAI;
  PF.refreshAskAI = refreshAskAI;
  PF.askAI = { mount: mountAskAI, refresh: refreshAskAI, open, readPage };
})();
