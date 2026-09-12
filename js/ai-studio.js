(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  // Mirrors MAX_MODELS in worker/model-rankings.mjs: the comparison lists the ten most
  // intelligent qualifying models, so a short table is worth explaining.
  const RANKED_MODELS = 10;

  function assetUrl(path) {
    const base = document.documentElement.getAttribute("data-base") || "/";
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }

  const studioStyle = document.createElement("link");
  studioStyle.rel = "stylesheet";
  studioStyle.href = assetUrl("css/ai-studio.css?v=d820564bbb66");
  document.head.append(studioStyle);

  // One line-art set, drawn to the same 24-grid and inheriting currentColor, replaces the
  // emoji that used to stand in for every control. Emoji are a different typeface on every
  // platform: they arrived at whatever weight and colour the OS felt like, sat off the
  // baseline next to the label, and made a considered interface look improvised.
  // Line art drawn to one 24-grid and inheriting currentColor, rather than emoji: emoji are
  // a different typeface on every platform, arriving at whatever weight and colour the OS
  // felt like and sitting off the baseline beside the label.
  const ICONS = {
    bolt: '<path d="M13.4 2 4.6 13.4h5.3L9.1 22l9-11.9h-5.4L13.4 2Z"/>',
    arrow: '<path d="M7.6 5.4h11v11h-1.9V8.6L6.9 18.4 5.6 17.1l9.8-9.8H7.6V5.4Z"/>',
    refresh: '<path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"/>'
  };

  // Each comparison row carries its company's own mark. A company the leaderboard names that
  // has no local mark gets a monogram instead of a broken image, so new labs appear on that
  // table without a deployment. The paths are whole string literals on purpose:
  // tools/build-assets.mjs stamps a content version onto each one, and without it a replaced
  // logo keeps being served from the week-long asset cache in _headers.
  const COMPANY_MARKS = {
    "Anthropic": { file: "assets/claude-symbol.svg?v=a4cc9a78d519" },
    "OpenAI": { file: "assets/chatgpt-symbol.svg?v=8326d397d1d8", mono: true },
    "Google": { file: "assets/gemini-symbol.svg?v=9294e427fb3e" },
    "SpaceXAI": { file: "assets/grok-symbol.svg?v=365459438e4a", mono: true },
    "Moonshot AI": { file: "assets/kimi-symbol.svg?v=93dd8dcaea08", mono: true },
    "Meta": { file: "assets/meta-symbol.svg?v=0974e509d66b" },
    "Alibaba": { file: "assets/qwen-symbol.svg?v=63e0c8b36a25" },
    "Z AI": { file: "assets/zai-symbol.svg?v=a3988f0efa5d", mono: true },
    "DeepSeek": { file: "assets/deepseek-symbol.svg?v=1f7d6dc2bdd3" }
  };

  function icon(name, extraClass) {
    return `<svg class="ai-icon${extraClass ? " " + extraClass : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
  }

  const STUDIO_MARKUP = `
    <div data-ai-studio-root class="ai-studio-v2">
      <section class="ai-panel ai-launchpad" aria-label="External AI launchpad">
        <div class="ai-panel-head">
          <span class="ai-launchpad-title">${icon("bolt")} Discover &amp; compare</span>
        </div>
        <div class="ai-launchpad-group">
          <a class="ai-ext-pill featured" href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener noreferrer" title="Open Artificial Analysis LLM Rankings">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/artificial-analysis-symbol.png?v=64685c6de905" alt="" width="24" height="24" aria-hidden="true"></span>
            <span class="pill-text"><span class="pill-label">LLM Rankings</span><span class="pill-description">Independent benchmarks</span></span>
            <span class="pill-go" aria-hidden="true">${icon("arrow")}</span>
          </a>
          <a class="ai-ext-pill featured" href="https://indus.sarvam.ai/" target="_blank" rel="noopener noreferrer" title="Open Indus by Sarvam">
            <span class="pill-logo-tile pill-monogram" aria-hidden="true">इ</span>
            <span class="pill-text"><span class="pill-label">Indus</span><span class="pill-description">By Sarvam</span></span>
            <span class="pill-go" aria-hidden="true">${icon("arrow")}</span>
          </a>
          <a class="ai-ext-pill featured" href="https://duck.ai/" target="_blank" rel="noopener noreferrer" title="Open Duck.ai by DuckDuckGo">
            <span class="pill-logo-tile"><img class="pill-logo" src="/assets/duckduckgo-symbol.svg?v=2fe1a0269c21" alt="" width="24" height="24" aria-hidden="true"></span>
            <span class="pill-text"><span class="pill-label">Duck.ai</span><span class="pill-description">By DuckDuckGo</span></span>
            <span class="pill-go" aria-hidden="true">${icon("arrow")}</span>
          </a>
        </div>
      </section>

      <section class="ai-panel ai-rankings" aria-label="AI model comparison">
        <div class="ai-panel-head">
          <h3>Intelligence, without the wait.</h3>
          <button type="button" class="ai-refresh-btn" data-refresh-rankings>${icon("refresh")} <span>Refresh</span></button>
        </div>
        <div class="ai-rankings-scroll">
          <table class="ai-rankings-table" role="table">
            <caption class="sr-only">The ten most intelligent models that answer end to end within 35 seconds, with at most two from any one company</caption>
            <thead role="rowgroup"><tr role="row"><th scope="col">Company &amp; model</th><th scope="col">Intelligence</th><th scope="col">USD / task</th><th scope="col">Total time</th></tr></thead>
            <tbody data-rankings-body role="rowgroup"></tbody>
          </table>
        </div>
        <p data-rankings-status role="status">Loading verified rankings…</p>
        <details class="ai-methodology"><summary>Source &amp; ranking method</summary><p>Data from <a href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener noreferrer">Artificial Analysis</a>, checked hourly while in use. The ten most intelligent models that answer end to end within 35 seconds, with at most two from any one company so a single lab cannot fill the table; ties use lower cost, then faster response. Cost is USD per benchmark task; timing is not a guarantee of chat website speed. Linked apps may not offer the exact model. Unlisted chat destinations link to the benchmark source.</p></details>
      </section>

    </div>`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  /** The company's own mark, or its initial when the leaderboard names a lab we have none for. */
  function companyMark(company) {
    const mark = COMPANY_MARKS[company];
    const tile = element("span", "ai-ranking-logo");
    if (!mark) {
      tile.classList.add("pill-monogram");
      tile.textContent = String(company || "?").trim().charAt(0).toUpperCase() || "?";
      tile.setAttribute("aria-hidden", "true");
      return tile;
    }
    const image = element("img", "pill-logo" + (mark.mono ? " is-mono" : ""));
    image.src = assetUrl(mark.file);
    image.alt = "";
    image.width = 24;
    image.height = 24;
    image.loading = "lazy";
    image.setAttribute("aria-hidden", "true");
    tile.append(image);
    return tile;
  }

  /** A metric cell: its small-screen label, the value, and — for the index — a share bar. */
  function metricCell(label, value, share) {
    const cell = element("td", "ai-ranking-metric");
    cell.setAttribute("role", "cell");
    const metricLabel = element("span", "ai-metric-label", label);
    metricLabel.setAttribute("aria-hidden", "true");
    cell.append(metricLabel, element("strong", "", value));
    if (Number.isFinite(share)) {
      const meter = element("span", "ai-meter");
      meter.setAttribute("aria-hidden", "true");
      const fill = element("span", "ai-meter-fill");
      fill.style.width = Math.max(6, Math.min(100, share * 100)).toFixed(1) + "%";
      meter.append(fill);
      cell.append(meter);
    }
    return cell;
  }

  function initRankings(root) {
    const body = root.querySelector("[data-rankings-body]");
    const status = root.querySelector("[data-rankings-status]");
    const refresh = root.querySelector("[data-refresh-rankings]");
    if (!body || !status || !refresh) return;
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      refresh.disabled = true;
      root.querySelector(".ai-rankings")?.classList.add("is-loading");
      try {
        const response = await fetch("/api/model-rankings", { signal: AbortSignal.timeout(25000), cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!Array.isArray(data.models) || !data.models.length || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error("Invalid rankings");
        // The bar is read against the leading model, so the spread between labs is visible
        // on a scale that never advertises an absolute score the source does not publish.
        const leader = data.models.reduce((best, model) => Math.max(best, model.intelligence), 0) || 1;
        const rows = data.models.map((model, index) => {
          const row = element("tr");
          row.setAttribute("role", "row");
          const company = element("td", "ai-ranking-model");
          company.setAttribute("role", "cell");
          const link = element("a", "ai-ranking-name", model.name);
          const url = new URL(model.website);
          if (url.protocol !== "https:") throw new Error("Invalid website");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const identity = element("span", "ai-ranking-identity");
          identity.append(link, element("span", "ai-ranking-company", model.company));
          // The row lays out inside the cell rather than as the cell, so the first column
          // still participates in table layout and stays aligned with its heading.
          const inner = element("span", "ai-ranking-model-inner");
          inner.append(element("span", "ai-ranking-rank", String(index + 1).padStart(2, "0")), companyMark(model.company), identity);
          company.append(inner);
          row.append(
            company,
            metricCell("Intelligence", model.intelligence, model.intelligence / leader),
            metricCell("USD / task", "$" + model.cost.toFixed(2)),
            metricCell("Total time", model.seconds.toFixed(2) + " s")
          );
          return row;
        });
        body.replaceChildren(...rows);
        const stale = data.stale || Date.now() - Date.parse(data.updatedAt) > 3600000;
        const shortfall = rows.length < RANKED_MODELS ? ` Only ${rows.length} ${rows.length === 1 ? "model has" : "models have"} verified qualifying results.` : "";
        status.textContent = `${stale ? "Source unavailable — showing last verified data. " : ""}Updated ${new Date(data.updatedAt).toLocaleString()}.${shortfall}`;
      } catch (_) {
        status.textContent = body.children.length ? "Refresh unavailable — showing previously loaded data. Try again shortly." : "Rankings unavailable. Open Artificial Analysis or try refreshing shortly.";
      } finally {
        loading = false;
        refresh.disabled = false;
        root.querySelector(".ai-rankings")?.classList.remove("is-loading");
      }
    }
    refresh.addEventListener("click", load);
    load();
    // Refresh a long-running open studio without making background requests in hidden tabs.
    window.setInterval(() => { if (document.visibilityState === "visible" && root.getClientRects().length) load(); }, 3600000);
  }

  function init(scope) {
    // scope is usually an element, but the DOMContentLoaded path below passes `document`,
    // which has querySelector and no matches(). Calling it threw on every /ai/ load, which
    // aborted this whole initializer before it bound a single control.
    const scopeElement = scope && typeof scope.querySelector === "function" ? scope : document;
    const root = typeof scopeElement.matches === "function" && scopeElement.matches("[data-ai-studio-root]")
      ? scopeElement
      : scopeElement.querySelector("[data-ai-studio-root]");

    if (!root) return null;
    if (root.dataset.aiStudioV2Initialized === "true") return root;

    // The markup names brand marks from the site root; a page nested under /learn/ or /ai/
    // resolves them through data-base instead.
    root.querySelectorAll("img.pill-logo").forEach((image) => {
      const src = image.getAttribute("src");
      if (src && src.startsWith("/")) image.src = assetUrl(src);
    });

    initRankings(root);
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
