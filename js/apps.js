/* Pigsfield — generic resource-app renderer (Nursery–PhD, Teach, Tools, Exams, Govt) + About app */
(function () {
  "use strict";
  const PF = window.PF, esc = PF.esc;

  /* nav glyphs for narrow/mobile sidebar */
  const SEC_GLYPH = {
    n5: "🧸", c68: "📗", c912: "📘", ug: "🎓", pg: "📜", phd: "🔬",
    tt: "🧑‍🏫", vs: "🔧", tools: "🛠️",
    books: "📚", tests: "📝", subjects: "🗂️", ias: "🏛️", ras: "🏜️", channels: "📺",
    arsenal: "⚖️",
  };

  function cardHTML(appId, item, key, fallbackEmoji) {
    const title = item.title || item.desc || PF.t("additional");
    const cleanTitle = title.replace(/^\[|\]$/g, "");

    /* When the spreadsheet column carries real meaning (e.g. Course/Playlist, Marathon,
       Books & Extras) use that as the button label; otherwise use the smart URL-based name. */
    const GENERIC = new Set(["Web", "YouTube", "App", "Source", "Link", "Tutorial"]);

    /* collect link entries with smart names + filter buckets */
    const entries = [];
    const buckets = new Set();
    for (const lk of item.links || []) {
      const useCol = lk.label && !GENERIC.has(lk.label);
      for (const u of lk.urls) {
        const ln = PF.linkName(u, lk.label);
        entries.push({ url: u, emoji: ln.emoji, key: ln.key, name: useCol ? lk.label : ln.name });
        buckets.add(PF.linkBucket(u, lk.label));
      }
    }
    const nameCount = {};
    for (const e of entries) nameCount[e.name] = (nameCount[e.name] || 0) + 1;
    const nameSeen = {};

    const emoji = PF.cardEmoji(
      (item.title || "") + " " + (item.badge || "") + " " + (item.desc || ""), fallbackEmoji);

    let h = `<div class="rcard" data-key="${esc(key)}" data-types="${[...buckets].join(" ")}">`;
    h += `<div class="rc-head"><span class="remoji" aria-hidden="true">${emoji}</span>
          <h4>${esc(cleanTitle).replace(/\n/g, "<br>")}</h4></div>`;
    if (item.badge) h += `<span class="rbadge">${esc(item.badge)}</span>`;
    if (item.desc && item.title) h += `<p class="rdesc">${esc(item.desc)}</p>`;
    if (item.extra && item.extra.length) {
      h += `<details><summary>${esc(PF.t("moreDetails"))}</summary>`;
      for (const x of item.extra)
        h += `<div class="xrow"><b>${esc(x.label)}:</b> ${esc(x.text)}</div>`;
      h += `</details>`;
    }
    if (entries.length) {
      h += `<div class="chips">`;
      for (const e of entries) {
        nameSeen[e.name] = (nameSeen[e.name] || 0) + 1;
        let label = e.name;
        if (nameCount[e.name] > 1)
          label = e.key === "website" ? PF.domain(e.url) : e.name + " " + nameSeen[e.name];
        h += `<button class="chip" data-url="${esc(e.url)}" title="${esc(e.url)}">
          ${PF.chipIcon(e.key, e.emoji)}<span class="dom">${esc(label)}</span></button>`;
      }
      h += `</div>`;
    }
    h += `</div>`;
    return h;
  }

  function sectionHTML(appId, sec, si) {
    const count = sec.groups.reduce((n, g) => n + g.items.length, 0);
    const fallback = SEC_GLYPH[sec.id] || "📁";
    let h = `<h2>${esc(PF.t("sections." + sec.id) !== "sections." + sec.id ? PF.t("sections." + sec.id) : sec.id)}</h2>`;
    if (sec.title) h += `<div class="sec-sub">${esc(sec.title)} · ${count} ${esc(PF.t("resources"))}</div>`;
    h += `<input class="app-filter" type="search" placeholder="${esc(PF.t("filterPh"))}">`;
    /* resource-type filter buttons */
    h += `<div class="filterbar">` +
      ["all", "web", "yt", "app", "pdf"].map((f) =>
        `<button class="fchip ${f === "all" ? "on" : ""}" data-f="${f}">${esc(PF.t("filters." + f))}</button>`
      ).join("") + `</div>`;
    /* category quick-jump chips */
    const titledGroups = sec.groups.filter((g) => g.title);
    if (titledGroups.length > 1) {
      h += `<div class="groupbar"><span class="gb-lbl">${esc(PF.t("jumpTo"))}</span>` +
        sec.groups.map((g, gi) => g.title
          ? `<button class="gchip" data-g="${gi}">${esc(g.title.length > 34 ? g.title.slice(0, 33) + "…" : g.title)}</button>`
          : "").join("") + `</div>`;
    }
    sec.groups.forEach((g, gi) => {
      if (g.title) h += `<div class="group-title" id="grp-${esc(appId)}-${si}-${gi}">${esc(g.title)}</div>`;
      h += `<div class="cards">`;
      g.items.forEach((item, ii) => {
        h += cardHTML(appId, item, `${appId}|${si}|${gi}|${ii}`, fallback);
      });
      h += `</div>`;
    });
    return h;
  }

  function renderResourceApp(appId, body) {
    const data = window.PF_DATA[appId];
    body.innerHTML = `<div class="app-shell">
      <nav class="app-nav"></nav>
      <div class="app-main"></div>
    </div>`;
    const nav = body.querySelector(".app-nav");
    const main = body.querySelector(".app-main");

    function show(si) {
      nav.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === si));
      main.innerHTML = sectionHTML(appId, data.sections[si], si);
      main.scrollTop = 0;
      wireCards(main);

      /* combined text + type filtering */
      const filter = main.querySelector(".app-filter");
      let typeF = "all";
      function applyFilters() {
        const q = filter.value.trim().toLowerCase();
        main.querySelectorAll(".rcard").forEach((c) => {
          const okText = !q || c.textContent.toLowerCase().includes(q);
          const okType = typeF === "all" || (c.dataset.types || "").split(" ").includes(typeF);
          c.style.display = okText && okType ? "" : "none";
        });
        main.querySelectorAll(".group-title").forEach((gt) => {
          const grid = gt.nextElementSibling;
          const any = grid && [...grid.children].some((c) => c.style.display !== "none");
          gt.style.display = any ? "" : "none";
        });
      }
      filter.addEventListener("input", applyFilters);
      main.querySelectorAll(".fchip").forEach((b) => {
        b.addEventListener("click", () => {
          typeF = b.dataset.f;
          main.querySelectorAll(".fchip").forEach((x) => x.classList.toggle("on", x === b));
          applyFilters();
        });
      });
      main.querySelectorAll(".gchip").forEach((b) => {
        b.addEventListener("click", () => {
          const t = main.querySelector(`#grp-${appId}-${si}-${b.dataset.g}`);
          if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      body._sectionIndex = si;
    }

    data.sections.forEach((sec, i) => {
      const b = document.createElement("button");
      const name = PF.t("sections." + sec.id) !== "sections." + sec.id ? PF.t("sections." + sec.id) : sec.id;
      b.innerHTML = `<span>${SEC_GLYPH[sec.id] || "📁"}</span><span class="nav-lbl">${esc(name)}</span>`;
      b.addEventListener("click", () => show(i));
      nav.appendChild(b);
    });
    show(body._sectionIndex || 0);
    body._show = show;
  }

  function wireCards(root) {
    root.querySelectorAll(".chip[data-url]").forEach((c) => {
      c.addEventListener("click", () => {
        const card = c.closest(".rcard");
        const title = card ? card.querySelector("h4").textContent : "";
        const key = card ? card.dataset.key : "";
        // hidden usage counter — counts a real "use" each time a resource link is opened
        if (PF.trackUse) PF.trackUse(key, title, (key.split("|")[0] || ""));
        PF.openLink(c.dataset.url, title);
      });
    });
  }

  /* ---------------- About app ---------------- */
  function renderAbout(body) {
    const A = window.PF_DATA.about;
    const L = A[PF.state.lang] || A.en;
    let h = `<div class="about-wrap">
      <div class="about-hero">
        <div class="alogo">${PF.pigLogo()}</div>
        <h1>${esc(L.title)}</h1>
        <div class="tag">${esc(L.tagline)}</div>
        <div class="tag" style="font-weight:800">${esc(L.motto)}</div>
      </div>`;
    for (const s of L.sections)
      h += `<div class="about-sec"><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`;
    h += `<div class="about-quote">“${esc(L.quote)}”</div>`;
    h += `<div class="about-sec"><h3>${esc(L.frameworkTitle)}</h3><ul>` +
         L.framework.map((f) => `<li>${esc(f)}</li>`).join("") + `</ul></div>`;
    h += `<div class="about-sec" style="text-align:center"><h3>${esc(L.supportTitle)}</h3>
      <p>${esc(L.donateLine)} <b>UPI: ${esc(A.upi)}</b><br>${esc(L.feedbackLine)} <b>${esc(A.email)}</b></p>
      <div class="about-cta">
        <button class="chipbtn" id="about-donate">💗 ${esc(PF.t("donate"))}</button>
        <button class="chipbtn" id="about-feedback">✉ ${esc(PF.t("feedback"))}</button>
      </div>
      <p><b>${esc(L.followLine)}</b></p>
      <div class="about-links">` +
      A.social.map((s) => `<a class="chipbtn" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.icon)} ${esc(s.name)}</a>`).join("") +
      `</div></div></div>`;
    body.innerHTML = h;
    body.querySelector("#about-donate").addEventListener("click", () => PF.toggleFlyout("donate-widget"));
    body.querySelector("#about-feedback").addEventListener("click", () => PF.toggleFlyout("feedback-widget"));
  }

  /* ---------------- registry ---------------- */
  // "exams" has its own custom renderer in exams.js (loaded after this file)
  for (const id of ["school", "teach", "tools", "govt"]) {
    PF.apps[id] = { render: (body) => renderResourceApp(id, body) };
  }
  PF.apps.about = { render: renderAbout };

  /* expose for search jump: open section & flash a card */
  PF.jumpToCard = function (appId, si, gi, ii) {
    PF.openApp(appId);
    const win = PF.getWindow(appId);
    if (!win) return;
    const body = win.querySelector(".win-body");
    if (body._show) body._show(si);
    requestAnimationFrame(() => {
      const card = body.querySelector(`.rcard[data-key="${appId}|${si}|${gi}|${ii}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("flash");
        setTimeout(() => card.classList.remove("flash"), 3500);
      }
    });
  };
})();
