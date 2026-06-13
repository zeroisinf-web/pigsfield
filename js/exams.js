/* Pigsfield — Competitive Exams "Command Center" (custom UI, overrides the generic renderer).
   Tracks: Overview (NCERT roadmap + mock tests) · SSC & All subjects · UPSC/IAS · RAS · Channels.
   IAS/RAS are parsed into clearly-bounded sections → papers → sub-subjects.
   Course / Marathon / Books links are shown in three separate columns. */
(function () {
  "use strict";
  const PF = window.PF, esc = PF.esc;

  const TRACKS = [
    { id: "overview", glyph: "🎯", key: "exOverview" },
    { id: "common", glyph: "📚", key: "exCommon" },
    { id: "ias", glyph: "🏛️", key: "exIas" },
    { id: "ras", glyph: "🏜️", key: "exRas" },
    { id: "channels", glyph: "📺", key: "exChannels" },
  ];
  const T = (k) => (PF.t("ex." + k) !== "ex." + k ? PF.t("ex." + k) : k);

  /* ---------- shared chip + column helpers ---------- */
  function urlChip(u) {
    const ln = PF.linkName(u);
    return `<button class="ex-chip" data-url="${esc(u)}" title="${esc(u)}">${PF.chipIcon(ln.key, ln.emoji)}<span class="dom">${esc(ln.name)}</span></button>`;
  }
  const COLS = [["course", "course", "▶"], ["marathon", "marathon", "🏃"], ["books", "books", "📚"]];
  function colLinks(o) {
    let any = false, h = `<div class="ex-cols">`;
    for (const [k, key, icon] of COLS) {
      const urls = o[k] || [];
      if (urls.length) any = true;
      h += `<div class="ex-col cat-${k}"><div class="ex-colhead">${icon} ${esc(T(key))}</div>`;
      if (urls.length) for (const u of urls) h += urlChip(u);
      else h += `<span class="ex-colempty">—</span>`;
      h += `</div>`;
    }
    return any ? h + `</div>` : "";
  }
  function nodeCounts(p) {
    let c = (p.course || []).length, mm = (p.marathon || []).length, b = (p.books || []).length;
    (p.subs || []).forEach((s) => { c += (s.course || []).length; mm += (s.marathon || []).length; b += (s.books || []).length; });
    return [c, mm, b];
  }
  function countsHTML(p) {
    const [c, mm, b] = nodeCounts(p);
    let h = "";
    if (c) h += `<span class="ex-ct yt">▶ ${c}</span>`;
    if (mm) h += `<span class="ex-ct mar">🏃 ${mm}</span>`;
    if (b) h += `<span class="ex-ct bk">📚 ${b}</span>`;
    return h;
  }
  function syl(topics, src) {
    if (!topics && !src) return "";
    if (!topics) return `<a class="ex-src solo" href="${esc(src)}" target="_blank" rel="noopener">🔗 ${esc(T("officialSyllabus"))}</a>`;
    const long = topics.length > 150;
    return `<details class="ex-syl" ${long ? "" : "open"}><summary>📖 ${esc(T("syllabus"))}</summary>
      <p>${esc(topics)}</p>${src ? `<a class="ex-src" href="${esc(src)}" target="_blank" rel="noopener">🔗 ${esc(T("officialSyllabus"))}</a>` : ""}</details>`;
  }

  /* ---------- track renderers ---------- */
  function renderOverview(D) {
    const rm = D.roadmap;
    let h = `<div class="ex-hero ov"><h1>🎯 ${esc(T("heroOverview"))}</h1><p>${esc(T("heroOverviewSub"))}</p></div>`;
    if (rm.note && (rm.note.text || rm.note.urls.length))
      h += `<div class="ex-note"><b>📘 ${esc(T("standardBooks"))}</b><div class="ex-chips">${rm.note.urls.map(urlChip).join("")}</div></div>`;
    h += `<div class="ex-card-title">🗺️ ${esc(T("roadmapTitle"))}</div>
      <div class="ex-tablewrap"><table class="ex-table"><thead><tr>` +
      rm.headers.map((x, i) => `<th class="${i === 0 ? "c0" : ""}">${esc(x)}</th>`).join("") + `</tr></thead><tbody>`;
    for (const r of rm.rows) {
      h += `<tr><td class="c0"><b>${esc(r.subject)}</b></td>
        <td><span class="ex-req upsc">${esc(r.upsc)}</span></td>
        <td><span class="ex-req ras">${esc(r.ras)}</span></td>
        <td><span class="ex-req ssc">${esc(r.ssc)}</span></td>
        <td class="bk">${esc(r.books)}</td></tr>`;
    }
    h += `</tbody></table></div>`;
    if (D.tests.urls.length)
      h += `<div class="ex-card-title">📝 ${esc(T("mockTitle"))} <small>${D.tests.urls.length}</small></div>
        <div class="ex-note"><div class="ex-chips">${D.tests.urls.map(urlChip).join("")}</div></div>`;
    return h;
  }

  function groupSubjects(list) {
    const groups = [], idx = {};
    list.forEach((s) => {
      if (!(s.subject in idx)) { idx[s.subject] = groups.length; groups.push({ subject: s.subject, variants: [] }); }
      groups[idx[s.subject]].variants.push(s);
    });
    return groups;
  }
  function renderCommon(D) {
    const groups = groupSubjects(D.common.subjects);
    let h = `<div class="ex-hero common"><h1>📚 ${esc(T("heroCommon"))}</h1><p>${esc(T("heroCommonSub"))}</p></div>
      <input class="ex-filter" type="search" placeholder="${esc(T("filterSubjects"))}"><div class="ex-acc">`;
    groups.forEach((g, gi) => {
      const tot = g.variants.reduce((o, v) => ({
        course: o.course.concat(v.course), marathon: o.marathon.concat(v.marathon), books: o.books.concat(v.books),
      }), { course: [], marathon: [], books: [] });
      h += `<div class="ex-item" data-eidx="${gi}" data-name="${esc(g.subject)}">
        <button class="ex-row" aria-expanded="${gi === 0}">
          <span class="ex-emoji">${PF.cardEmoji(g.subject, "📘")}</span>
          <span class="ex-name">${esc(g.subject)}</span>
          <span class="ex-counts">${countsHTML(tot)}</span><span class="ex-caret">▾</span>
        </button><div class="ex-panel" ${gi === 0 ? "" : "hidden"}>`;
      g.variants.forEach((v) => {
        if (v.exam && g.variants.length > 1) h += `<div class="ex-variant">${esc(v.exam)}</div>`;
        h += colLinks(v);
        for (const x of v.extras || []) if (!/^https?:/.test(x)) h += `<div class="ex-extra">📌 ${esc(x)}</div>`;
      });
      h += `</div></div>`;
    });
    return h + `</div>`;
  }

  function paperCard(p, eidx) {
    let h = `<div class="ex-paper" data-eidx="${eidx}" data-name="${esc(p.name || "")}">
      <div class="ex-paper-head">
        <span class="ex-emoji">${PF.cardEmoji((p.name || "") + " " + (p.topics || ""), "📄")}</span>
        <h4>${esc(p.name || "")}</h4>
        ${p.marks ? `<span class="ex-marks">${esc(p.marks)}</span>` : ""}
        <span class="ex-counts">${countsHTML(p)}</span>
      </div>`;
    h += syl(p.topics, p.src);
    h += colLinks(p);
    return h + `</div>`;
  }
  function subCard(s, eidx) {
    let h = `<div class="ex-sub" data-eidx="${eidx}" data-name="${esc(s.name || "")}">
      <div class="ex-sub-head"><span class="ex-subdot"></span><b>${esc(s.name || "")}</b>
        <span class="ex-counts">${countsHTML(s)}</span></div>`;
    if (s.topics) h += syl(s.topics, s.src);
    else if (s.src) h += `<a class="ex-src solo" href="${esc(s.src)}" target="_blank" rel="noopener">🔗 ${esc(T("officialSyllabus"))}</a>`;
    h += colLinks(s);
    return h + `</div>`;
  }

  function renderTrack3(D, track) {
    const data = D[track];
    const heroKey = track === "ias" ? "heroIas" : "heroRas";
    let h = `<div class="ex-hero ${track}"><h1>${track === "ias" ? "🏛️" : "🏜️"} ${esc(T(heroKey))}</h1>
      <p>${esc(T(track === "ias" ? "heroIasSub" : "heroRasSub"))}</p></div>`;
    let ei = 0;
    (data.sections || []).forEach((sec) => {
      h += `<section class="ex-sec ${sec.title ? "" : "nohead"}">`;
      if (sec.title) h += `<div class="ex-sechead"><span class="ex-secbar"></span>
        <h3>${esc(sec.title)}</h3>${sec.sub ? `<span class="ex-secsub">${esc(sec.sub.replace(/\n/g, " · "))}</span>` : ""}</div>`;
      h += `<div class="ex-secbody">`;
      sec.items.forEach((p) => {
        h += `<div class="ex-pg">`;
        h += paperCard(p, ei++);
        if (p.subs && p.subs.length) {
          h += `<div class="ex-subs">`;
          p.subs.forEach((s) => h += subCard(s, ei++));
          h += `</div>`;
        }
        h += `</div>`;
      });
      h += `</div></section>`;
    });
    if (data.essentials && data.essentials.length) {
      h += `<div class="ex-card-title">⭐ ${esc(data.essTitle || T("essentials"))}</div><div class="ex-ess">`;
      for (const e of data.essentials) {
        h += `<div class="ex-essrow"><span class="ex-esstopic">${esc(e.topic)}</span>`;
        if (e.srcUrl) h += `<button class="ex-chip" data-url="${esc(e.srcUrl)}" title="${esc(e.srcText)}">${PF.chipIcon(PF.linkName(e.srcUrl).key, "🔗")}<span class="dom">${esc(e.srcText || PF.domain(e.srcUrl))}</span></button>`;
        else if (e.srcText) h += `<span class="ex-esssrc">${esc(e.srcText)}</span>`;
        h += `</div>`;
      }
      h += `</div>`;
    }
    return h;
  }

  function renderChannels(D) {
    let h = `<div class="ex-hero channels"><h1>📺 ${esc(T("heroChannels"))}</h1><p>${esc(T("heroChannelsSub"))}</p></div>
      <div class="ex-chan-grid">`;
    (D.channels || []).forEach((c, i) => {
      h += `<div class="ex-chan" data-eidx="${i}" data-name="${esc(c.focus)}">
        <div class="ex-chan-top"><span class="ex-emoji">${PF.cardEmoji(c.focus + " " + c.exams, "📺")}</span><b>${esc(c.focus)}</b></div>
        ${c.exams ? `<span class="ex-chan-exam">${esc(c.exams)}</span>` : ""}
        <div class="ex-chips">${c.urls.map(urlChip).join("")}</div></div>`;
    });
    return h + `</div>`;
  }

  /* ---------- app shell ---------- */
  function render(body) {
    const D = window.PF_DATA.exams;
    body.innerHTML = `<div class="ex-shell"><nav class="ex-rail"></nav><div class="ex-main"></div></div>`;
    const rail = body.querySelector(".ex-rail");
    const main = body.querySelector(".ex-main");

    function show(track) {
      rail.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === track));
      if (track === "overview") main.innerHTML = renderOverview(D);
      else if (track === "common") main.innerHTML = renderCommon(D);
      else if (track === "channels") main.innerHTML = renderChannels(D);
      else main.innerHTML = renderTrack3(D, track);
      main.scrollTop = 0;
      wire(main, track);
      body._track = track;
    }
    TRACKS.forEach((t) => {
      const b = document.createElement("button");
      b.dataset.t = t.id;
      b.innerHTML = `<span class="ex-rg">${t.glyph}</span><span class="ex-rl">${esc(T(t.key))}</span>`;
      b.addEventListener("click", () => show(t.id));
      rail.appendChild(b);
    });
    show(body._track || "overview");
    body._show = show;
  }

  function wire(main, track) {
    main.querySelectorAll(".ex-row").forEach((r) => r.addEventListener("click", () => {
      const p = r.nextElementSibling, open = !p.hidden;
      p.hidden = open; r.setAttribute("aria-expanded", String(!open));
    }));
    const f = main.querySelector(".ex-filter");
    if (f) f.addEventListener("input", () => {
      const q = f.value.trim().toLowerCase();
      main.querySelectorAll(".ex-item").forEach((it) => {
        it.style.display = !q || it.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
    main.querySelectorAll("[data-url]").forEach((c) => c.addEventListener("click", () => {
      const host = c.closest("[data-name]");
      const name = host ? host.dataset.name : "";
      if (PF.trackUse) PF.trackUse("exams|" + track + "|" + name, name || "Exam resource", "exams");
      PF.openLink(c.dataset.url);
    }));
  }

  PF.apps.exams = { render };

  /* ---------- global-search integration ---------- */
  function walkTrack(D, track) {
    const out = [];
    (D[track].sections || []).forEach((sec) => sec.items.forEach((p) => {
      out.push({ name: p.name, topics: p.topics, sec: sec.title });
      (p.subs || []).forEach((s) => out.push({ name: s.name, topics: s.topics, sec: sec.title }));
    }));
    return out;
  }
  PF.examsIndexEntries = function () {
    const D = window.PF_DATA.exams, out = [];
    groupSubjects(D.common.subjects).forEach((g, i) => out.push({
      kind: "exam", appId: "exams", track: "common", idx: i, title: g.subject,
      sub: g.variants.map((v) => v.exam).filter(Boolean).join(" · "),
      text: (g.subject + " " + g.variants.map((v) => v.exam).join(" ")).toLowerCase(),
    }));
    ["ias", "ras"].forEach((tr) => walkTrack(D, tr).forEach((n, i) => out.push({
      kind: "exam", appId: "exams", track: tr, idx: i, title: n.name,
      sub: (tr.toUpperCase()) + (n.sec ? " · " + n.sec : ""),
      text: ((n.name || "") + " " + (n.topics || "") + " " + (n.sec || "")).toLowerCase(),
    })));
    (D.channels || []).forEach((c, i) => out.push({ kind: "exam", appId: "exams", track: "channels", idx: i,
      title: c.focus, sub: c.exams, text: (c.focus + " " + c.exams).toLowerCase() }));
    return out;
  };
  PF.jumpExams = function (track, idx) {
    PF.openApp("exams");
    const win = PF.getWindow("exams");
    if (!win) return;
    const body = win.querySelector(".win-body");
    if (body._show) body._show(track);
    requestAnimationFrame(() => {
      const el = body.querySelector(`[data-eidx="${idx}"]`);
      if (el) {
        const row = el.querySelector(".ex-row");
        if (row && el.querySelector(".ex-panel") && el.querySelector(".ex-panel").hidden) row.click();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ex-flash");
        setTimeout(() => el.classList.remove("ex-flash"), 3000);
      }
    });
  };
})();
