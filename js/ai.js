/* Pigsfield — AI-powered search (Google Gemini).
   The taskbar search has two modes: instant Resource search and "Pigsfield AI" — a free
   multimodal study assistant. It accepts uploads (image / audio / video / PDF / code / text),
   answers in English or Hindi, writes & debugs code, summarises files, and can generate images
   (with an image-capable model). Bring-your-own free key from https://aistudio.google.com/apikey
   stored only in this browser. */
(function () {
  "use strict";
  const PF = window.PF, esc = PF.esc;
  const $ = (id) => document.getElementById(id);

  const CHAT_MODEL = "gemini-2.5-flash";   // best free fast multimodal model
  const IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";
  const API = "https://generativelanguage.googleapis.com/v1beta/models/";
  const SYS = "You are Pigsfield AI, a warm, encouraging study companion on Pigsfield — a free " +
    "education platform for India (Nursery to PhD, competitive exams, teacher training, skills). " +
    "Mission: 'Education is your Right, It must be free.' Explain clearly and simply, match the " +
    "user's language (English or Hindi/Hinglish), help with studies, exams, concepts, code and " +
    "uploaded files. Be accurate; if unsure, say so. Keep answers focused and student-friendly.";

  const AI = (PF.ai = {
    key: localStorage.getItem("pf-gkey") || "",
    attachments: [],
    history: [],          // [{role:'user'|'model', parts:[...]}]
    mode: "res",
    busy: false,
    imgMode: false,       // 🎨 generate images
    fileMode: false,      // 📄 download answer as a file
  });

  /* ---------------- tiny markdown renderer ---------------- */
  function md(text) {
    const parts = String(text).split(/```/);
    let out = "";
    parts.forEach((seg, i) => {
      if (i % 2) {
        const nl = seg.indexOf("\n");
        const code = nl >= 0 ? seg.slice(nl + 1) : seg;
        out += `<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`;
      } else {
        let s = esc(seg)
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
          .replace(/(^|\n)\s*[-*]\s+(.+)/g, "$1• $2")
          .replace(/(^|\n)(#{1,3})\s*(.+)/g, "$1<b>$3</b>")
          .replace(/\n/g, "<br>");
        out += s;
      }
    });
    return out;
  }

  /* ---------------- file → inline part ---------------- */
  function fileToPart(file) {
    return new Promise((res, rej) => {
      if (file.size > 18 * 1024 * 1024) { rej(new Error(file.name + " is too large (max ~18 MB).")); return; }
      const r = new FileReader();
      r.onload = () => {
        const b64 = String(r.result).split(",")[1];
        let mime = file.type;
        if (!mime) {
          const ext = (file.name.split(".").pop() || "").toLowerCase();
          mime = { js: "text/javascript", py: "text/x-python", java: "text/x-java", c: "text/x-c",
            cpp: "text/x-c++", cs: "text/x-csharp", html: "text/html", css: "text/css",
            json: "application/json", md: "text/markdown", csv: "text/csv", xml: "text/xml",
            ts: "text/x-typescript" }[ext] || "text/plain";
        }
        res({ inline_data: { mime_type: mime, data: b64 } });
      };
      r.onerror = () => rej(new Error("Could not read " + file.name));
      r.readAsDataURL(file);
    });
  }

  /* ---------------- view plumbing ---------------- */
  function setMode(m) {
    AI.mode = m;
    $("sp-tab-res").classList.toggle("on", m === "res");
    $("sp-tab-ai").classList.toggle("on", m === "ai");
    $("search-results").style.display = m === "res" ? "" : "none";
    $("search-hint").style.display = m === "res" ? "" : "none";
    $("ai-view").hidden = m !== "ai";
    $("sp-clear").hidden = m !== "ai" || !AI.history.length;
    if (m === "ai") renderAi();
  }
  AI.onOpen = function () { AI.attachments = []; renderAttach(); setMode("res"); };

  function renderAttach() {
    const row = $("sp-attach-row");
    if (!AI.attachments.length) { row.hidden = true; row.innerHTML = ""; return; }
    row.hidden = false;
    row.innerHTML = AI.attachments.map((a, i) =>
      `<span class="att-chip">${fileIcon(a.file.type)} ${esc(a.file.name.slice(0, 22))}
        <button data-rm="${i}" aria-label="remove">✕</button></span>`).join("");
    row.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => { AI.attachments.splice(+b.dataset.rm, 1); renderAttach(); }));
  }
  function fileIcon(t) {
    t = t || "";
    if (t.startsWith("image")) return "🖼️";
    if (t.startsWith("audio")) return "🎵";
    if (t.startsWith("video")) return "🎬";
    if (t.includes("pdf")) return "📄";
    return "💻";
  }

  /* ---------------- main AI render ---------------- */
  function renderAi() {
    const v = $("ai-view");
    if (!AI.key) { renderKeySetup(); return; }
    let h = `<div class="ai-thread">`;
    if (!AI.history.length) {
      h += `<div class="ai-welcome"><div class="ai-pig">${PF.pigLogo()}</div>
        <b>${esc(PF.t("aiGreeting"))}</b>
        <div class="ai-chips">` +
        PF.t("aiSuggest").map((s) => `<button class="ai-sug">${esc(s)}</button>`).join("") +
        `</div></div>`;
    }
    AI.history.forEach((turn, ti) => {
      const who = turn.role === "user" ? "u" : "a";
      const text = (turn.parts || []).filter((p) => p.text).map((p) => p.text).join("\n");
      const imgs = (turn.parts || []).filter((p) => p.inline_data && /image/.test(p.inline_data.mime_type));
      const files = (turn.parts || []).filter((p) => p.inline_data && !/image/.test(p.inline_data.mime_type)).length;
      h += `<div class="ai-msg ${who}">`;
      if (who === "a") h += `<span class="ai-ava">${PF.pigLogo()}</span>`;
      h += `<div class="ai-bub">`;
      if (files) h += `<div class="ai-files">📎 ${files} ${esc(PF.t("attached"))}</div>`;
      if (text) h += who === "a" ? md(text) : esc(text).replace(/\n/g, "<br>");
      imgs.forEach((im, ii) =>
        h += `<div class="ai-imgwrap"><img class="ai-img" src="data:${im.inline_data.mime_type};base64,${im.inline_data.data}" alt="generated">
          <button class="ai-dl" data-img="${ti}-${ii}">⬇ ${esc(PF.t("download"))}</button></div>`);
      if (who === "a" && text) h += `<button class="ai-save" data-save="${ti}">⬇ ${esc(PF.t("saveFile"))}</button>`;
      h += `</div></div>`;
    });
    if (AI.busy) h += `<div class="ai-msg a"><span class="ai-ava">${PF.pigLogo()}</span>
      <div class="ai-bub"><span class="ai-typing"><i></i><i></i><i></i></span></div></div>`;
    h += `</div>`;
    v.innerHTML = h;
    v.querySelectorAll(".ai-sug").forEach((b) =>
      b.addEventListener("click", () => { $("global-search").value = b.textContent; send(); }));
    v.querySelectorAll(".ai-save").forEach((b) =>
      b.addEventListener("click", () => saveAnswer(AI.history[+b.dataset.save])));
    v.querySelectorAll(".ai-dl").forEach((b) =>
      b.addEventListener("click", () => {
        const [ti, ii] = b.dataset.img.split("-").map(Number);
        const im = AI.history[ti].parts.filter((p) => p.inline_data && /image/.test(p.inline_data.mime_type))[ii];
        const a = document.createElement("a");
        a.href = "data:" + im.inline_data.mime_type + ";base64," + im.inline_data.data;
        a.download = "pigsfield-ai." + (im.inline_data.mime_type.split("/")[1] || "png"); a.click();
      }));
    v.scrollTop = v.scrollHeight;
    $("sp-clear").hidden = !AI.history.length;
  }

  /* download an AI text answer as a file (extension guessed from a code fence) */
  function saveAnswer(turn) {
    const text = (turn.parts || []).filter((p) => p.text).map((p) => p.text).join("\n");
    const m = text.match(/```(\w+)/);
    const ext = { js: "js", javascript: "js", ts: "ts", python: "py", py: "py", java: "java",
      c: "c", cpp: "cpp", csharp: "cs", html: "html", css: "css", json: "json", sql: "sql",
      bash: "sh", sh: "sh", markdown: "md", md: "md" }[(m && m[1] || "").toLowerCase()] || "md";
    // if a single code block, save just the code; else save the whole answer as markdown
    let out = text, name = "pigsfield-ai." + ext;
    const blocks = text.split("```");
    if (blocks.length === 3) out = blocks[1].replace(/^\w+\n/, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "text/plain" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    PF.toast(PF.t("fileSaved"));
  }

  function renderKeySetup() {
    $("ai-view").innerHTML =
      `<div class="ai-key">
        <div class="ai-pig">${PF.pigLogo()}</div>
        <b>${esc(PF.t("aiKeyTitle"))}</b>
        <p>${esc(PF.t("aiKeyDesc"))}</p>
        <input id="ai-key-in" type="password" placeholder="AIza… (Gemini API key)" autocomplete="off">
        <div class="ai-key-row">
          <a class="chipbtn" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">🔑 ${esc(PF.t("aiGetKey"))}</a>
          <button class="bigbtn" id="ai-key-save">${esc(PF.t("save"))}</button>
        </div>
        <small>${esc(PF.t("aiKeyPrivacy"))}</small>
      </div>`;
    const inp = $("ai-key-in");
    inp.focus();
    $("ai-key-save").onclick = () => {
      const k = inp.value.trim();
      if (!k) return;
      AI.key = k; localStorage.setItem("pf-gkey", k);
      PF.toast(PF.t("aiKeyStored"));
      renderAi();
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") $("ai-key-save").click(); });
  }

  /* ---------------- send to Gemini ---------------- */
  async function send() {
    const inp = $("global-search");
    const prompt = inp.value.trim();
    if (AI.busy) return;
    if (!prompt && !AI.attachments.length) return;
    setMode("ai");
    if (!AI.key) { renderKeySetup(); return; }

    const userParts = [];
    if (prompt) userParts.push({ text: prompt });
    try {
      for (const a of AI.attachments) userParts.push(await fileToPart(a.file));
    } catch (e) { PF.toast(e.message); return; }

    if (AI.fileMode && userParts.length) {
      userParts[0] = { text: (prompt || "Create the file I described") +
        "\n\n(Produce the complete file content in a single fenced code block.)" };
    }
    AI.history.push({ role: "user", parts: userParts });
    AI.attachments = []; renderAttach();
    inp.value = "";
    AI.busy = true; renderAi();

    const isImg = AI.imgMode;
    const model = isImg ? IMAGE_MODEL : CHAT_MODEL;
    const body = { contents: AI.history };
    if (!isImg) body.systemInstruction = { parts: [{ text: SYS }] };
    body.generationConfig = isImg
      ? { responseModalities: ["TEXT", "IMAGE"] }
      : { temperature: 0.6, maxOutputTokens: 4096 };

    try {
      const r = await fetch(API + model + ":generateContent?key=" + encodeURIComponent(AI.key), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error((data.error && data.error.message) || ("HTTP " + r.status));
      const cand = data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [{ text: PF.t("aiEmpty") }];
      const turn = { role: "model", parts };
      AI.history.push(turn);
      if (AI.fileMode) setTimeout(() => saveAnswer(turn), 200);   // auto-download generated file
    } catch (e) {
      AI.history.push({ role: "model", parts: [{ text: "⚠️ " + PF.t("aiError") + "\n\n`" + e.message + "`" }] });
    }
    AI.busy = false; renderAi();
  }

  /* ---------------- wiring ---------------- */
  PF.initAI = function () {
    const imgBtn = $("sp-img"), fileBtn = $("sp-filemode");
    imgBtn.addEventListener("click", () => {
      AI.imgMode = !AI.imgMode; if (AI.imgMode) AI.fileMode = false;
      syncToggles(); if (AI.mode !== "ai") setMode("ai");
    });
    fileBtn.addEventListener("click", () => {
      AI.fileMode = !AI.fileMode; if (AI.fileMode) AI.imgMode = false;
      syncToggles(); if (AI.mode !== "ai") setMode("ai");
    });
    function syncToggles() {
      imgBtn.classList.toggle("on", AI.imgMode);
      fileBtn.classList.toggle("on", AI.fileMode);
    }
    AI._syncToggles = syncToggles;

    $("sp-tab-res").addEventListener("click", () => setMode("res"));
    $("sp-tab-ai").addEventListener("click", () => setMode("ai"));
    $("sp-ask").addEventListener("click", send);
    $("sp-attach").addEventListener("click", () => $("sp-file").click());
    $("sp-file").addEventListener("change", (e) => {
      for (const f of e.target.files) AI.attachments.push({ file: f });
      e.target.value = ""; renderAttach();
      if (AI.mode !== "ai") setMode("ai");
    });
    $("sp-clear").addEventListener("click", () => { AI.history = []; renderAi(); });
    $("sp-key").addEventListener("click", () => { setMode("ai"); renderKeySetup(); });

    $("global-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (AI.mode === "ai" || AI.attachments.length) send();
        else { /* resources mode: Enter opens the first result */
          const first = document.querySelector("#search-results .sres");
          if (first) first.click(); else send();
        }
      }
    });
  };
})();
