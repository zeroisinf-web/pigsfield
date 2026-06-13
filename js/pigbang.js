/* Pigsfield — PigBang: educational OTT (Netflix-style UI + YouTube embed) */
(function () {
  "use strict";
  const PF = window.PF, esc = PF.esc;
  const RAILS = ["N-5", "6-8", "9-12", "UG", "PG", "PhD", "Teacher Training", "Vocational & Skills"];

  function railName(r) {
    const t = PF.t("pbRails." + r);
    return t !== "pbRails." + r ? t : r;
  }

  const TAB_EMOJI = { movies: "🎬", channels: "📺", apps: "🎮" };

  function posterHTML(item, emoji) {
    const grad = PF.posterGrad(item.name);
    let price = "";
    if (item.price) {
      const isFree = /free/i.test(item.price);
      price = `<span class="pb-price ${isFree ? "" : "paid"}">${esc(isFree ? PF.t("free") : PF.t("paid"))}</span>`;
    }
    return `<div class="pb-poster" style="background:${grad}">
      ${price}<span class="psym" aria-hidden="true">${emoji}</span><span class="pn">${esc(item.name)}</span></div>`;
  }

  function cardHTML(item, idx, tabId) {
    const emoji = PF.cardEmoji(
      (item.subject || "") + " " + item.name + " " + (item.desc || ""), TAB_EMOJI[tabId] || "🎬");
    return `<div class="pb-card" data-idx="${idx}" tabindex="0" role="button">
      ${posterHTML(item, emoji)}
      <div class="pb-cinfo">
        <span class="sub">${esc(item.subject || "")}</span>
        <span class="ds">${esc(item.desc || "")}</span>
      </div></div>`;
  }

  function noteHTML(note) {
    if (!note) return "";
    // make any bare domain in the note text clickable (e.g. cineby.at themoviebox.org yarrlist.net)
    const linkified = esc(note.text).replace(
      /\b((?:[a-z0-9-]+\.)+(?:at|org|net|com|in|tv|io|app|co))\b/gi,
      (m) => `<a href="https://${m}" target="_blank" rel="noopener">${m}</a>`);
    let h = `<div class="pb-note">${linkified.replace(/\n/g, "<br>")}`;
    const isMovieNote = /cineby|themoviebox|yarrlist|brave/i.test(note.text);
    h += `<div class="pb-note-links">`;
    if (isMovieNote) {
      const sites = [["cineby.at", "https://www.cineby.at/"], ["themoviebox.org", "https://themoviebox.org/"],
        ["yarrlist.net", "https://yarrlist.net/"]];
      sites.forEach(([n, u]) => h += `<a class="pb-note-chip" href="${u}" target="_blank" rel="noopener">🔎 ${n}</a>`);
      h += `<a class="pb-note-chip brave" href="https://brave.com/download/" target="_blank" rel="noopener">🦁 ${esc(PF.t("getBrave"))}</a>`;
    } else if (note.urls && note.urls.length) {
      note.urls.forEach((u) => h += `<a class="pb-note-chip" href="${esc(u)}" target="_blank" rel="noopener">${esc(PF.domain(u))}</a>`);
    }
    h += `</div></div>`;
    return h;
  }

  function render(body) {
    const data = window.PF_DATA.pigbang;
    body.innerHTML = `<div class="pb-shell">
      <div class="pb-top">
        <span class="pb-logo">${PF.pigbangLogo()} PigBang</span>
        <div class="pb-tabs"></div>
        <div class="pb-right">
          <div class="pb-pf"></div>
          <select class="pb-class"></select>
          <input class="pb-search" type="search" placeholder="${esc(PF.t("pbSearch"))}">
          <button class="pb-btn ghost pb-lucky" style="padding:7px 12px;font-size:12px">${esc(PF.t("surprise"))}</button>
        </div>
      </div>
      <div class="pb-body"></div>
    </div>`;
    const shell = body.querySelector(".pb-shell");
    const tabsEl = shell.querySelector(".pb-tabs");
    const bodyEl = shell.querySelector(".pb-body");
    const classSel = shell.querySelector(".pb-class");
    const searchEl = shell.querySelector(".pb-search");

    const st = (body._pb = body._pb || { tab: "movies", cls: "", q: "", price: "" });

    /* tabs */
    data.tabs.forEach((t) => {
      const b = document.createElement("button");
      b.textContent = PF.t("pbTabs." + t.id);
      b.dataset.tab = t.id;
      b.addEventListener("click", () => { st.tab = t.id; st.q = ""; searchEl.value = ""; draw(); });
      tabsEl.appendChild(b);
    });

    /* class filter */
    classSel.innerHTML = `<option value="">${esc(PF.t("allClasses"))}</option>` +
      RAILS.map((r) => `<option value="${esc(r)}">${esc(railName(r))}</option>`).join("");
    classSel.addEventListener("change", () => { st.cls = classSel.value; draw(); });
    searchEl.addEventListener("input", () => { st.q = searchEl.value.trim().toLowerCase(); draw(); });
    /* Free / Paid filter buttons (Movies & Shows) */
    const pfEl = shell.querySelector(".pb-pf");
    function buildPriceFilter() {
      const opts = [["", PF.t("filters.all")], ["free", PF.t("free")], ["paid", PF.t("paid")]];
      pfEl.innerHTML = opts.map(([v, n]) =>
        `<button class="pb-pfb ${st.price === v ? "on" : ""}" data-v="${v}">${esc(n)}</button>`).join("");
      pfEl.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", () => { st.price = b.dataset.v; draw(); });
      });
    }
    shell.querySelector(".pb-lucky").addEventListener("click", () => {
      const tab = data.tabs.find((t) => t.id === st.tab);
      const item = tab.items[Math.floor(Math.random() * tab.items.length)];
      openDetail(shell, item);
    });

    function currentTab() { return data.tabs.find((t) => t.id === st.tab); }

    function draw() {
      tabsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === st.tab));
      const tab = currentTab();
      const hasPrices = tab.items.some((i) => i.price);
      pfEl.style.display = hasPrices ? "" : "none";
      if (hasPrices) buildPriceFilter();
      let items = tab.items;
      if (st.price) items = items.filter((i) =>
        st.price === "free" ? /free/i.test(i.price || "") : /paid/i.test(i.price || ""));
      if (st.cls) items = items.filter((i) => i.classes.includes(st.cls));
      if (st.q) items = items.filter((i) =>
        (i.name + " " + (i.subject || "") + " " + (i.desc || "")).toLowerCase().includes(st.q));

      let h = "";
      /* hero */
      if (!st.q && !st.cls && !st.price && items.length) {
        const hero = items[PF.hashHue(st.tab + new Date().getDate()) % items.length];
        h += `<div class="pb-hero">
          <div class="hbg" style="background:${PF.posterGrad(hero.name)}"></div>
          <div class="ht">
            <h1>${esc(hero.name)}</h1>
            <p>${esc(hero.desc || PF.t("pbHero"))}</p>
            <div class="hb">
              <button class="pb-btn play" data-hero>▶ ${esc(PF.t("play"))}</button>
              <button class="pb-btn ghost" data-heroinfo>ℹ ${esc(PF.t("moreDetails"))}</button>
            </div>
          </div></div>`;
        h += noteHTML(tab.note);
        /* recents rail */
        const rec = PF.recents.filter((r) => r.tab === st.tab);
        if (rec.length) {
          h += `<div class="pb-rail"><h3>${esc(PF.t("recently"))}</h3><div class="pb-row">`;
          rec.forEach((r) => {
            const idx = tab.items.findIndex((i) => i.name === r.name);
            if (idx >= 0) h += cardHTML(tab.items[idx], idx, st.tab);
          });
          h += `</div></div>`;
        }
        /* rails by audience */
        for (const r of RAILS) {
          const ri = items.map((it, i) => [it, tab.items.indexOf(it)]).filter(([it]) => it.classes.includes(r));
          if (!ri.length) continue;
          h += `<div class="pb-rail"><h3>${esc(railName(r))}<small>${ri.length}</small></h3><div class="pb-row">`;
          for (const [it, idx] of ri) h += cardHTML(it, idx, st.tab);
          h += `</div></div>`;
        }
        /* unclassified */
        const other = items.filter((it) => !it.classes.length);
        if (other.length) {
          h += `<div class="pb-rail"><h3>${esc(railName("other"))}</h3><div class="pb-row">`;
          for (const it of other) h += cardHTML(it, tab.items.indexOf(it), st.tab);
          h += `</div></div>`;
        }
        shell._hero = hero;
      } else {
        /* filtered grid */
        h += `<div style="height:14px"></div>` + noteHTML(st.cls || st.q ? null : tab.note);
        if (!items.length) h += `<div class="pb-empty">🐷 ${esc(PF.t("searchNone"))}</div>`;
        else {
          h += `<div class="pb-rail"><h3>${items.length} ${esc(PF.t("resources"))}</h3>
            <div class="pb-row" style="flex-wrap:wrap">`;
          for (const it of items) h += cardHTML(it, tab.items.indexOf(it), st.tab);
          h += `</div></div>`;
        }
      }
      bodyEl.innerHTML = h;
      bodyEl.scrollTop = 0;

      bodyEl.querySelectorAll(".pb-card").forEach((c) => {
        const open = () => openDetail(shell, tab.items[+c.dataset.idx]);
        c.addEventListener("click", open);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
      });
      const hb = bodyEl.querySelector("[data-hero]");
      if (hb) hb.addEventListener("click", () => playItem(shell._hero));
      const hi = bodyEl.querySelector("[data-heroinfo]");
      if (hi) hi.addEventListener("click", () => openDetail(shell, shell._hero));
    }

    function playItem(item) {
      PF.pushRecent({ name: item.name, tab: st.tab });
      if (PF.trackUse) PF.trackUse("pigbang|" + st.tab + "|" + item.name, item.name, "pigbang");
      const yt = (item.urls || []).find((u) => PF.isEmbeddable(u));
      if (PF.embedOn && yt) PF.openPlayer(yt, item.name);
      else if (item.urls && item.urls.length) window.open(item.urls[0], "_blank", "noopener");
    }

    function openDetail(shellEl, item) {
      PF.pushRecent({ name: item.name, tab: st.tab });
      const old = shellEl.querySelector(".pb-modal");
      if (old) old.remove();
      const m = document.createElement("div");
      m.className = "pb-modal";
      const tags = [
        ...(item.classes || []).map((c) => `<span class="pb-tag">${esc(railName(c))}</span>`),
        item.subject ? `<span class="pb-tag">${esc(item.subject)}</span>` : "",
        item.price ? `<span class="pb-tag ${/free/i.test(item.price) ? "free" : "paid"}">${esc(item.price)}</span>` : "",
      ].join("");
      let acts = "";
      for (const u of item.urls || []) {
        const emb = PF.embedOn && PF.isEmbeddable(u);
        const ln = PF.linkName(u);
        acts += `<button class="pb-act" data-url="${esc(u)}" data-embed="${emb ? 1 : 0}">
          ${PF.chipIcon(ln.key, ln.emoji)}<b class="an">${esc(ln.name)}</b><span class="u">${esc(u)}</span>
          <span class="go">${esc(emb ? PF.t("play") : PF.t("open"))}</span></button>`;
      }
      if (item.linkNote) acts += `<div class="pb-note" style="margin:6px 0 0">${esc(item.linkNote)}</div>`;
      m.innerHTML = `<div class="bk"></div>
        <div class="mx">
          <div class="mhero" style="background:${PF.posterGrad(item.name)}">
            <h2>${esc(item.name)}</h2>
            <button class="x" aria-label="Close">✕</button>
          </div>
          <div class="mbody">
            <div class="tags">${tags}</div>
            <p class="de">${esc(item.desc || "")}</p>
            <div class="acts">${acts}</div>
          </div>
        </div>`;
      shellEl.appendChild(m);
      m.querySelector(".bk").addEventListener("click", () => m.remove());
      m.querySelector(".x").addEventListener("click", () => m.remove());
      m.querySelectorAll(".pb-act[data-url]").forEach((a) => {
        a.addEventListener("click", () => {
          if (PF.trackUse) PF.trackUse("pigbang|" + st.tab + "|" + item.name, item.name, "pigbang");
          if (a.dataset.embed === "1") PF.openPlayer(a.dataset.url, item.name);
          else window.open(a.dataset.url, "_blank", "noopener");
        });
      });
    }

    draw();
    body._pbDraw = draw;
    body._pbOpen = (tabId, name) => {
      st.tab = tabId; st.q = ""; st.cls = "";
      searchEl.value = ""; classSel.value = "";
      draw();
      const tab = currentTab();
      const item = tab.items.find((i) => i.name === name);
      if (item) openDetail(shell, item);
    };
  }

  PF.apps.pigbang = { render };

  /* search jump from global search */
  PF.jumpToPigbang = function (tabId, name) {
    PF.openApp("pigbang");
    const win = PF.getWindow("pigbang");
    if (!win) return;
    const body = win.querySelector(".win-body");
    if (body._pbOpen) body._pbOpen(tabId, name);
  };
})();
