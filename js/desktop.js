/* Pigsfield — Windows 11 desktop shell: windows, taskbar, start, search, widgets */
(function () {
  "use strict";
  const PF = window.PF, esc = PF.esc;
  const isMobile = () => window.innerWidth < 760;
  let zTop = 100;
  const windows = {};   // appId -> element

  /* ================= windows ================= */
  PF.getWindow = (id) => windows[id] || null;

  PF.openApp = function (id) {
    closeFlyouts();
    let win = windows[id];
    if (win) {
      win.classList.remove("minimized");
      focusWin(win);
      return win;
    }
    win = document.createElement("section");
    win.className = "window";
    win.dataset.app = id;
    const n = Object.keys(windows).length;
    const W = Math.min(980, window.innerWidth - 80);
    const H = Math.min(640, window.innerHeight - 140);
    win.style.width = W + "px";
    win.style.height = H + "px";
    win.style.left = Math.max(10, (window.innerWidth - W) / 2 + n * 26) + "px";
    win.style.top = Math.max(8, (window.innerHeight - 52 - H) / 2 + n * 22) + "px";
    win.innerHTML = `
      <div class="win-titlebar">
        <span class="wt-ico" style="background:${PF.appMeta[id].color}">${PF.appIcon(id)}</span>
        <span class="wt-title">${esc(PF.t("appNames." + id))}</span>
        <div class="win-controls">
          <button class="wc-min" title="Minimize">─</button>
          <button class="wc-max" title="Maximize">▢</button>
          <button class="wc-close" title="Close">✕</button>
        </div>
      </div>
      <div class="win-body"></div>`;
    document.getElementById("windows-layer").appendChild(win);
    windows[id] = win;

    PF.apps[id].render(win.querySelector(".win-body"));

    /* controls */
    win.querySelector(".wc-close").addEventListener("click", () => closeWin(id));
    win.querySelector(".wc-min").addEventListener("click", () => {
      win.classList.add("minimized");
      refreshTaskbar();
    });
    win.querySelector(".wc-max").addEventListener("click", () => toggleMax(win));
    win.querySelector(".win-titlebar").addEventListener("dblclick", (e) => {
      if (!e.target.closest(".win-controls")) toggleMax(win);
    });
    win.addEventListener("pointerdown", () => focusWin(win));

    /* drag */
    const tb = win.querySelector(".win-titlebar");
    tb.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".win-controls") || win.classList.contains("maximized") || isMobile()) return;
      const sx = e.clientX - win.offsetLeft, sy = e.clientY - win.offsetTop;
      const move = (ev) => {
        win.style.left = Math.min(window.innerWidth - 60, Math.max(-win.offsetWidth + 120, ev.clientX - sx)) + "px";
        win.style.top = Math.min(window.innerHeight - 90, Math.max(0, ev.clientY - sy)) + "px";
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    // apps open maximized by default; restore button returns to the centered size
    win._restore = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
    win.classList.add("maximized");
    Object.assign(win.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
    focusWin(win);
    refreshTaskbar();
    return win;
  };

  function toggleMax(win) {
    if (win.classList.contains("maximized")) {
      win.classList.remove("maximized");
      Object.assign(win.style, win._restore || {});
    } else {
      win._restore = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
      win.classList.add("maximized");
      Object.assign(win.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
    }
  }
  function closeWin(id) {
    if (windows[id]) { windows[id].remove(); delete windows[id]; refreshTaskbar(); }
  }
  function focusWin(win) {
    win.style.zIndex = ++zTop;
    refreshTaskbar();
  }
  function topAppId() {
    let best = null, bz = -1;
    for (const [id, w] of Object.entries(windows)) {
      if (w.classList.contains("minimized")) continue;
      const z = +w.style.zIndex || 0;
      if (z > bz) { bz = z; best = id; }
    }
    return best;
  }

  /* ================= taskbar ================= */
  function refreshTaskbar() {
    const top = topAppId();
    document.querySelectorAll(".tb-appbtn").forEach((b) => {
      const id = b.dataset.app;
      const open = !!windows[id];
      b.classList.toggle("running", open);
      b.classList.toggle("active", open && id === top);
    });
  }

  function buildTaskbar() {
    document.getElementById("tb-start").innerHTML = PF.pigLogo();
    const wrap = document.getElementById("tb-apps");
    wrap.innerHTML = "";
    for (const id of PF.appOrder) {
      if (id === "about") continue;
      const b = document.createElement("button");
      b.className = "tb-appbtn";
      b.dataset.app = id;
      b.title = PF.t("appNames." + id);
      b.innerHTML = `<span class="ico" style="background:${PF.appMeta[id].color}">${PF.appIcon(id)}</span><span class="run-dot"></span>`;
      b.addEventListener("click", () => {
        const w = windows[id];
        if (w && !w.classList.contains("minimized") && topAppId() === id) {
          w.classList.add("minimized");
          refreshTaskbar();
        } else PF.openApp(id);
      });
      wrap.appendChild(b);
    }
  }

  function buildDesktopIcons() {
    const wrap = document.getElementById("desk-icons");
    wrap.innerHTML = "";
    for (const id of PF.appOrder) {
      const d = document.createElement("button");
      d.className = "dicon";
      d.setAttribute("role", "listitem");
      d.innerHTML = `<span class="ico" style="background:${PF.appMeta[id].color}">${PF.appIcon(id)}</span>
        <span class="lbl">${esc(PF.t("appNames." + id))}</span>`;
      d.addEventListener("click", () => PF.openApp(id));
      d.addEventListener("keydown", (e) => { if (e.key === "Enter") PF.openApp(id); });
      wrap.appendChild(d);
    }
  }

  /* ================= flyouts ================= */
  const FLYOUTS = ["start-menu", "search-panel", "donate-widget", "feedback-widget"];
  function closeFlyouts(except) {
    for (const f of FLYOUTS) if (f !== except) document.getElementById(f).hidden = true;
  }
  PF.closeFlyouts = closeFlyouts;
  PF.toggleFlyout = function (id) {
    const el = document.getElementById(id);
    const show = el.hidden;
    closeFlyouts(id);
    el.hidden = !show;
    if (show && id === "search-panel") {
      const inp = document.getElementById("global-search");
      inp.value = ""; renderSearch("");
      if (PF.ai && PF.ai.onOpen) PF.ai.onOpen();
      setTimeout(() => inp.focus(), 30);
    }
    if (show && id === "start-menu") {
      PF.renderStartRecents();
      setTimeout(() => document.getElementById("start-search").focus(), 30);
    }
  };

  /* ================= start menu ================= */
  function buildStart() {
    const grid = document.getElementById("start-apps");
    grid.innerHTML = "";
    for (const id of PF.appOrder) {
      const d = document.createElement("button");
      d.className = "dicon";
      d.innerHTML = `<span class="ico" style="background:${PF.appMeta[id].color}">${PF.appIcon(id)}</span>
        <span class="lbl">${esc(PF.t("appNames." + id))}</span>`;
      d.addEventListener("click", () => { closeFlyouts(); PF.openApp(id); });
      grid.appendChild(d);
    }
    document.getElementById("start-donate").onclick = () => PF.toggleFlyout("donate-widget");
    document.getElementById("start-feedback").onclick = () => PF.toggleFlyout("feedback-widget");
    const ss = document.getElementById("start-search");
    ss.onfocus = () => {
      PF.toggleFlyout("search-panel");
    };
    document.querySelector(".start-user-logo").innerHTML = PF.pigLogo();
  }

  /* ================= global search ================= */
  let INDEX = null;
  function buildIndex() {
    INDEX = [];
    for (const appId of ["school", "teach", "tools", "govt"]) {
      const data = window.PF_DATA[appId];
      data.sections.forEach((sec, si) => {
        sec.groups.forEach((g, gi) => {
          g.items.forEach((item, ii) => {
            INDEX.push({
              kind: "card", appId, si, gi, ii,
              title: (item.title || item.desc || "").slice(0, 90),
              text: ((item.title || "") + " " + (item.desc || "") + " " + (item.badge || "") + " " +
                (item.extra || []).map((x) => x.label + " " + x.text).join(" ")).toLowerCase(),
              sub: (item.desc || "").slice(0, 110),
            });
          });
        });
      });
    }
    window.PF_DATA.pigbang.tabs.forEach((tab) => {
      tab.items.forEach((item) => {
        INDEX.push({
          kind: "pb", appId: "pigbang", tab: tab.id, name: item.name,
          title: item.name,
          text: (item.name + " " + (item.subject || "") + " " + (item.desc || "") + " " + item.classes.join(" ")).toLowerCase(),
          sub: (item.subject ? item.subject + " · " : "") + (item.desc || "").slice(0, 90),
        });
      });
    });
    if (PF.examsIndexEntries) INDEX.push(...PF.examsIndexEntries());
  }

  function renderSearch(q) {
    const box = document.getElementById("search-results");
    document.getElementById("search-hint").style.display = q ? "none" : "";
    if (!q) { box.innerHTML = ""; return; }
    if (!INDEX) buildIndex();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const e of INDEX) {
      if (words.every((w) => e.text.includes(w))) {
        out.push(e);
        if (out.length >= 40) break;
      }
    }
    if (!out.length) {
      box.innerHTML = `<div class="none" style="padding:14px;font-size:13px;color:var(--text-2)">${esc(PF.t("searchNone"))}</div>`;
      return;
    }
    box.innerHTML = "";
    out.forEach((e) => {
      const b = document.createElement("button");
      b.className = "sres";
      b.innerHTML = `<span class="mini" style="background:${PF.appMeta[e.appId].color}">${PF.appIcon(e.appId)}</span>
        <span style="flex:1;min-width:0"><b>${esc(e.title)}</b><small>${esc(e.sub)}</small></span>
        <span class="where">${esc(PF.t("appNames." + e.appId))}</span>`;
      b.addEventListener("click", () => {
        closeFlyouts();
        if (e.kind === "pb") PF.jumpToPigbang(e.tab, e.name);
        else if (e.kind === "exam") PF.jumpExams(e.track, e.idx);
        else PF.jumpToCard(e.appId, e.si, e.gi, e.ii);
      });
      box.appendChild(b);
    });
  }

  /* ================= theme & language ================= */
  PF.applyTheme = function () {
    document.body.dataset.theme = PF.state.theme;
    document.getElementById("tb-theme").textContent = PF.state.theme === "dark" ? "🌙" : "☀";
    localStorage.setItem("pf-theme", PF.state.theme);
  };
  PF.applyLang = function () {
    document.body.dataset.lang = PF.state.lang;
    document.documentElement.lang = PF.state.lang;
    localStorage.setItem("pf-lang", PF.state.lang);
    document.getElementById("tb-lang").textContent = PF.state.lang === "en" ? "हि" : "EN";
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = PF.t(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = PF.t(el.dataset.i18nPh)));
    buildTaskbar(); buildDesktopIcons(); buildStart();
    refreshTaskbar();
    INDEX = null;
    /* re-render open windows (keep state) */
    for (const [id, win] of Object.entries(windows)) {
      win.querySelector(".wt-title").textContent = PF.t("appNames." + id);
      PF.apps[id].render(win.querySelector(".win-body"));
    }
  };

  /* ================= clock ================= */
  function tickClock() {
    const d = new Date();
    const loc = PF.state.lang === "hi" ? "hi-IN" : "en-IN";
    document.getElementById("tb-time").textContent =
      d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    document.getElementById("tb-date").textContent =
      d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /* ================= boot wiring ================= */
  PF.initDesktop = function () {
    document.getElementById("boot-logo").innerHTML = PF.pigLogo();
    document.querySelector(".widget-pig").innerHTML = PF.pigLogo();
    document.querySelector(".widget-pig.alt").innerHTML = PF.noseLogo();

    PF.applyTheme();
    PF.applyLang();
    tickClock();
    setInterval(tickClock, 15000);

    // hidden: click the clock 5× quickly to open the developer usage dashboard
    let clkN = 0, clkT = 0;
    document.getElementById("tb-clock").addEventListener("click", () => {
      const now = Date.now();
      clkN = now - clkT < 2500 ? clkN + 1 : 1;
      clkT = now;
      if (clkN >= 5) { clkN = 0; PF.showStats(); }
    });

    document.getElementById("tb-start").addEventListener("click", () => PF.toggleFlyout("start-menu"));
    document.getElementById("tb-searchbox").addEventListener("click", () => PF.toggleFlyout("search-panel"));
    document.getElementById("tb-donate").addEventListener("click", () => PF.toggleFlyout("donate-widget"));
    document.getElementById("tb-feedback").addEventListener("click", () => PF.toggleFlyout("feedback-widget"));
    document.getElementById("tb-theme").addEventListener("click", () => {
      PF.state.theme = PF.state.theme === "dark" ? "light" : "dark";
      PF.applyTheme();
    });
    document.getElementById("tb-lang").addEventListener("click", () => {
      PF.state.lang = PF.state.lang === "en" ? "hi" : "en";
      PF.applyLang();
    });

    document.getElementById("global-search").addEventListener("input", (e) => {
      if (PF.ai && PF.ai.mode === "ai") return; // AI mode: input is the prompt, not a filter
      renderSearch(e.target.value.trim());
    });
    if (PF.initAI) PF.initAI();
    document.getElementById("copy-upi").addEventListener("click", () => PF.copy("zeroisinf@ibl"));
    document.getElementById("copy-email").addEventListener("click", () => PF.copy("zeroisinf@gmail.com"));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeFlyouts(); }
      if (e.key === "/" && !e.target.closest("input,textarea")) {
        e.preventDefault();
        PF.toggleFlyout("search-panel");
      }
    });
    /* click-away closes flyouts */
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".flyout") && !e.target.closest("#taskbar")) closeFlyouts();
    });

    /* boot splash */
    setTimeout(() => {
      const b = document.getElementById("boot");
      b.classList.add("gone");
      setTimeout(() => b.remove(), 600);
    }, 1300);
  };
})();
