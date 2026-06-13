/* Pigsfield — hidden usage analytics
   Counts a real "use" every time a visitor opens a resource link / plays a PigBang title.
   • Always stored locally (per-device) in localStorage.
   • Optionally beaconed to a backend you control (Google Apps Script → Sheet) for TRUE
     public aggregate. Set PF.USAGE.endpoint below (see analytics/SETUP.md).
   The counter is invisible to normal visitors. Open the developer dashboard with:
     – add #stats to the URL, or
     – click the taskbar clock 5 times quickly. */
(function () {
  "use strict";
  const PF = window.PF, esc = PF.esc;

  PF.USAGE = {
    endpoint: "",          // e.g. "https://script.google.com/macros/s/XXXX/exec" — leave "" to disable remote
    ns: "pigsfield",
  };

  const KC = "pf-usage", KM = "pf-usage-meta", KR = "pf-recent-res";
  PF.usageCounts = JSON.parse(localStorage.getItem(KC) || "{}");
  PF.usageMeta = JSON.parse(localStorage.getItem(KM) || "{}");
  PF.recentRes = JSON.parse(localStorage.getItem(KR) || "[]");

  PF.trackUse = function (id, title, app) {
    if (!id) return;
    PF.usageCounts[id] = (PF.usageCounts[id] || 0) + 1;
    PF.usageMeta[id] = { title: title || id, app: app || "" };
    PF.recentRes = PF.recentRes.filter((r) => r.id !== id);
    PF.recentRes.unshift({ id, title: title || id, app: app || "", ts: Date.now() });
    PF.recentRes = PF.recentRes.slice(0, 14);
    try {
      localStorage.setItem(KC, JSON.stringify(PF.usageCounts));
      localStorage.setItem(KM, JSON.stringify(PF.usageMeta));
      localStorage.setItem(KR, JSON.stringify(PF.recentRes));
    } catch (e) {}
    if (PF.renderStartRecents) PF.renderStartRecents();
    // fire-and-forget remote beacon for global aggregate (never blocks the click)
    if (PF.USAGE.endpoint) {
      try {
        const payload = JSON.stringify({ id, title: title || id, app: app || "", ns: PF.USAGE.ns, ts: Date.now() });
        if (navigator.sendBeacon)
          navigator.sendBeacon(PF.USAGE.endpoint, new Blob([payload], { type: "text/plain" }));
        else
          fetch(PF.USAGE.endpoint, { method: "POST", body: payload, mode: "no-cors", keepalive: true });
      } catch (e) {}
    }
  };

  /* ---------------- developer dashboard (hidden app) ---------------- */
  PF.appMeta.stats = { glyph: "📊", color: "linear-gradient(135deg,#3c3c44,#6e6e76)" };
  PF.apps.stats = { render: renderStats };
  PF.showStats = function () { PF.openApp("stats"); };

  function rankRows() {
    return Object.keys(PF.usageCounts)
      .map((id) => ({ id, count: PF.usageCounts[id], ...(PF.usageMeta[id] || {}) }))
      .sort((a, b) => b.count - a.count);
  }
  const APP_NAME = (a) => (PF.t("appNames." + a) !== "appNames." + a ? PF.t("appNames." + a) : a || "—");

  function renderStats(body) {
    const rows = rankRows();
    const total = rows.reduce((n, r) => n + r.count, 0);
    const max = rows.length ? rows[0].count : 1;
    let h = `<div class="stats-wrap">
      <div class="stats-head">
        <div><h2>📊 Resource Usage</h2>
        <p class="stats-sub">${rows.length} resources used · ${total} total opens ·
          remote aggregate: <b>${PF.USAGE.endpoint ? "ON" : "local only"}</b></p></div>
        <div class="stats-actions">
          <button class="chipbtn" data-act="csv">⬇ CSV</button>
          <button class="chipbtn" data-act="json">⬇ JSON</button>
          <button class="chipbtn" data-act="reset">♻ Reset</button>
        </div>
      </div>`;
    if (!rows.length) {
      h += `<p class="stats-empty">No resource has been opened on this device yet.
        Counts appear here as visitors use resources. For real public aggregate across all
        visitors, configure <code>PF.USAGE.endpoint</code> (see analytics/SETUP.md).</p>`;
    } else {
      h += `<div class="stats-list">`;
      rows.forEach((r, i) => {
        h += `<div class="stat-row">
          <span class="stat-rank">${i + 1}</span>
          <span class="stat-name" title="${esc(r.id)}">${esc(r.title || r.id)}</span>
          <span class="stat-app">${esc(APP_NAME(r.app))}</span>
          <span class="stat-bar"><span style="width:${Math.max(4, (r.count / max) * 100)}%"></span></span>
          <span class="stat-count">${r.count}</span>
        </div>`;
      });
      h += `</div>`;
    }
    h += `<p class="stats-note">This panel is hidden from normal visitors. Open it any time via
      <code>#stats</code> in the URL or by clicking the taskbar clock 5×.</p></div>`;
    body.innerHTML = h;

    body.querySelector('[data-act="csv"]').onclick = () => exportRows(rows, "csv");
    body.querySelector('[data-act="json"]').onclick = () => exportRows(rows, "json");
    body.querySelector('[data-act="reset"]').onclick = () => {
      if (!confirm("Reset local usage counts on this device?")) return;
      PF.usageCounts = {}; PF.usageMeta = {};
      localStorage.removeItem(KC); localStorage.removeItem(KM);
      renderStats(body);
    };
  }

  function exportRows(rows, fmt) {
    let data, mime, name;
    if (fmt === "csv") {
      data = "rank,title,app,id,count\n" + rows.map((r, i) =>
        [i + 1, q(r.title), q(APP_NAME(r.app)), q(r.id), r.count].join(",")).join("\n");
      mime = "text/csv"; name = "pigsfield-usage.csv";
    } else {
      data = JSON.stringify(rows, null, 1); mime = "application/json"; name = "pigsfield-usage.json";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function q(s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; }

  /* ---------------- start-menu "Recently used" ---------------- */
  PF.renderStartRecents = function () {
    const box = document.getElementById("start-favs");
    if (!box) return;
    if (!PF.recentRes.length) {
      box.innerHTML = `<div class="none">${esc(PF.t("noRecent"))}</div>`;
      return;
    }
    box.innerHTML = "";
    for (const r of PF.recentRes.slice(0, 8)) {
      const b = document.createElement("button");
      b.className = "sfav";
      const app = r.app || "school";
      b.innerHTML = `<span class="mini" style="background:${(PF.appMeta[app] || PF.appMeta.school).color}">${PF.appIcon(app)}</span>
        <span>${esc(r.title)}</span>`;
      b.addEventListener("click", () => {
        if (PF.closeFlyouts) PF.closeFlyouts();
        if (r.app === "pigbang") {
          const parts = r.id.split("|");
          PF.jumpToPigbang(parts[1], parts.slice(2).join("|"));
        } else {
          const p = r.id.split("|");
          if (p.length === 4) PF.jumpToCard(p[0], +p[1], +p[2], +p[3]);
          else PF.openApp(r.app);
        }
      });
      box.appendChild(b);
    }
  };

  /* open dashboard via #stats */
  if (location.hash === "#stats") setTimeout(() => PF.showStats(), 1600);
})();
