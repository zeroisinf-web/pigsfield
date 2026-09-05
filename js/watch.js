(function () {
  "use strict";

  const PF = window.PF;
  const data = window.PF_DATA && window.PF_DATA.pigbang;
  if (!PF || !data) return;

  const tabsTarget = document.querySelector("#watch-tabs");
  const levelsTarget = document.querySelector("#watch-levels");
  const grid = document.querySelector("#watch-grid");
  const countTarget = document.querySelector("#watch-count");
  const input = document.querySelector("#watch-search");
  const moreButton = document.querySelector("#watch-more");
  const PAGE_SIZE = 24;
  const tabLabels = { movies: "Films & shows", channels: "Channels & playlists", apps: "Learning apps" };
  const sourceMarkParts = {
    youtube: '<span class="source-mark-body"><span class="source-mark-play"></span></span>',
    "google-play": '<span class="source-mark-play-triangle source-mark-play-triangle-a"></span><span class="source-mark-play-triangle source-mark-play-triangle-b"></span><span class="source-mark-play-triangle source-mark-play-triangle-c"></span>',
    "apple-store": '<span class="source-mark-apple-fruit"></span><span class="source-mark-apple-leaf"></span>',
    app: '<span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span>',
    document: '<span class="source-mark-page"><span class="source-mark-page-fold"></span><span class="source-mark-page-line"></span><span class="source-mark-page-line"></span></span>',
    website: '<span class="source-mark-globe"><span class="source-mark-globe-axis"></span><span class="source-mark-globe-ring"></span></span>'
  };
  let activeTab = data.tabs[0] ? data.tabs[0].id : "movies";
  let activeLevel = "all";
  let activePrice = "all";
  let visible = PAGE_SIZE;
  let searchTimer;
  let currentMatches = [];
  let tabButtons = [];
  let levelButtons = [];
  const priceButtons = Array.from(document.querySelectorAll("[data-price]"));
  const priceTarget = priceButtons[0] && priceButtons[0].parentElement;
  const entriesById = new Map();
  const entriesBySaveId = new Map();
  const entriesByTab = new Map((data.tabs || []).map((tab) => [tab.id, []]));

  const entries = [];
  (data.tabs || []).forEach((tab) => {
    (tab.items || []).forEach((item, itemIndex) => {
      const id = PF.slug(`${item.name}-${tab.id}-${itemIndex + 1}`);
      const entry = {
        tab: tab.id,
        item,
        itemIndex,
        id,
        urls: null,
        classes: item.classes || [],
        price: String(item.price || "unlabelled").toLowerCase(),
        haystack: `${item.name || ""} ${item.subject || ""} ${item.desc || ""} ${(item.classes || []).join(" ")} ${item.price || ""}`.toLowerCase(),
        cardMarkup: null
      };
      entries.push(entry);
      entriesById.set(id, entry);
      entriesBySaveId.set(`pigbang:${id}`, entry);
      entriesByTab.get(tab.id).push(entry);
    });
  });

  const levels = Array.from(new Set(entries.flatMap((entry) => entry.item.classes || []))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function cleanUrl(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return "";
      Array.from(url.searchParams.keys()).forEach((name) => { if (/^utm_/i.test(name)) url.searchParams.delete(name); });
      return url.href;
    } catch (_) { return ""; }
  }

  function itemUrls(item) {
    const seen = new Set();
    const urls = [];
    (item.urls || []).forEach((value) => {
      const url = cleanUrl(value);
      if (!url || seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    });
    return urls;
  }

  function entryUrls(entry) {
    if (!entry.urls) entry.urls = itemUrls(entry.item);
    return entry.urls;
  }

  function localUrl(id) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = id;
    return url.href;
  }

  function visualHue(value) {
    let hash = 0;
    for (const char of String(value || "PigBang")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % 360;
  }

  function sourceLabel(url) {
    let host = "Original source";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
    if (/play\.google/.test(host)) return "Play Store";
    if (/apps\.apple/.test(host)) return "App Store";
    return host;
  }

  function sourceType(url) {
    if (PF.YouTube && PF.YouTube.isYouTube(url)) return "video";
    if (/play\.google|apps\.apple|microsoft\.com\/store|apps\.microsoft/i.test(url)) return "app";
    if (/\.pdf(?:$|\?)/i.test(url)) return "document";
    return "website";
  }

  function sourceBrand(url, type) {
    const lower = String(url || "").toLowerCase();
    if (type === "video" && /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/.test(lower)) return "youtube";
    if (/play\.google\.com/.test(lower)) return "google-play";
    if (/apps\.apple\.com/.test(lower)) return "apple-store";
    return type === "app" ? "app" : type;
  }

  function sourceMark(url, type) {
    const brand = sourceBrand(url, type);
    return `<span class="source-icon source-mark source-mark-${brand}" aria-hidden="true">${sourceMarkParts[brand] || sourceMarkParts.website}</span>`;
  }

  // Real cover art for every entry, resolved same-origin by /api/poster.
  //
  // Deriving artwork from the link itself only ever worked for two providers — a YouTube
  // video id and a Steam app id — so most of the grid fell back to a generated tile. Every
  // provider here publishes cover art as Open Graph metadata for link previews, and the
  // Worker reads it at the edge and streams the image back from this origin. The browser
  // therefore makes no third-party request to paint a card, and the image is lazy so a card
  // that is never scrolled to never costs anything.
  //
  // Entries carry several links. Preference goes to the one whose provider publishes the
  // most representative art: a specific video or title page over a store listing, and a
  // store listing over a channel or a bare homepage.
  const ARTWORK_PREFERENCE = [
    /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/(?:shorts|live|embed)\/)/i,
    /(?:netflix\.com|hotstar\.com|primevideo\.com|amazon\.[a-z.]+\/(?:gp\/video|dp)|jiocinema\.com|sonyliv\.com|zee5\.com|mubi\.com|criterion|apple\.com\/[a-z-]+\/movie)/i,
    /archive\.org\/details\//i,
    /(?:store\.steampowered\.com\/app|play\.google\.com\/store|apps\.apple\.com)/i,
    /[?&]list=/i,
    /./
  ];

  function artworkUrl(entry) {
    const urls = entryUrls(entry).filter((url) => /^https:/i.test(url));
    for (const pattern of ARTWORK_PREFERENCE) {
      const match = urls.find((url) => pattern.test(url));
      if (match) return match;
    }
    return "";
  }

  function artworkFor(entry) {
    const source = artworkUrl(entry);
    if (!source) return null;
    // 16:9 at the size the tile actually paints, so the row reserves its space before the
    // image arrives and nothing below it jumps.
    return { src: `/api/poster?u=${encodeURIComponent(source)}`, width: 480, height: 270 };
  }

  function watchSymbol(entry) {
    const emojiType = entry.tab === "apps" ? "app" : "video";
    const emoji = PF.resourceSymbolFor({
      title: entry.item.name,
      description: entry.item.desc,
      context: entry.item.subject,
      urls: entryUrls(entry),
      type: emojiType
    });
    return `<span class="resource-emoji resource-emoji-card watch-emoji" aria-hidden="true">${emoji}</span>`;
  }

  function card(entry) {
    const item = entry.item;
    const urls = entryUrls(entry);
    const saveId = `pigbang:${entry.id}`;
    const saved = PF.isSaved(saveId);
    const cacheIndex = saved ? 1 : 0;
    const cardMarkup = entry.cardMarkup || (entry.cardMarkup = []);
    if (cardMarkup[cacheIndex]) return cardMarkup[cacheIndex];
    const price = String(item.price || "").trim();
    const art = artworkFor(entry);
    const priceClass = /^free$/i.test(price) ? "free" : /^paid$/i.test(price) ? "paid" : "";
    const links = urls.length ? urls.map((url) => {
      const type = sourceType(url);
      const brand = sourceBrand(url, type);
      const playable = PF.YouTube && PF.YouTube.parse(url);
      if (playable) return `<span class="source-link-pair"><a class="link-button source-video source-brand-${brand}" href="${PF.escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-youtube-play data-title="${PF.escapeHtml(item.name || "PigBang")}">${sourceMark(url, type)}<span>${PF.escapeHtml(sourceLabel(url))}</span></a></span>`;
      return `<span class="source-link-pair"><a class="link-button source-${type} source-brand-${brand}" href="${PF.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${sourceMark(url, type)}<span>${PF.escapeHtml(sourceLabel(url))}</span></a></span>`;
    }).join("") : `<span class="link-button"><span>Source is being reviewed</span></span>`;

    const markup = `<article class="resource-card watch-card" id="${PF.escapeHtml(entry.id)}" data-entry-id="${PF.escapeHtml(saveId)}">
      <div class="watch-art watch-art-${entry.tab}" style="--visual-hue:${visualHue(item.name)}" aria-hidden="true">${watchSymbol(entry)}${art ? `<img class="watch-art-img" src="${PF.escapeHtml(art.src)}" width="${art.width}" height="${art.height}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</div>
      <div class="resource-topline">
        <span class="tag">${PF.escapeHtml(tabLabels[entry.tab] || "PigBang")}</span>
        <div class="card-tools">
          <button class="card-tool${saved ? " is-saved" : ""}" type="button" data-save="${PF.escapeHtml(saveId)}" aria-label="${saved ? "Remove from" : "Save to"} your list" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
        </div>
      </div>
      <div class="resource-tags">
        ${price ? `<span class="tag ${priceClass}">${PF.escapeHtml(price)}</span>` : `<span class="tag">Check source</span>`}
        ${item.subject ? `<span class="tag">${PF.escapeHtml(item.subject)}</span>` : ""}
      </div>
      <h3>${PF.escapeHtml(item.name || "Untitled")}</h3>
      ${item.desc ? `<p>${PF.escapeHtml(item.desc)}</p>` : ""}
      <div class="resource-actions"><div class="direct-links" aria-label="Original resource links">${links}</div></div>
    </article>`;
    cardMarkup[cacheIndex] = markup;
    return markup;
  }

  function handleGridClick(event) {
    const anchor = event.target.closest && event.target.closest("a[data-youtube-play]");
    if (anchor && grid.contains(anchor)) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!PF.YouTube || typeof PF.YouTube.play !== "function") return;
      event.preventDefault();
      PF.YouTube.play(anchor.href, anchor.dataset.title || "PigBang");
      return;
    }

    const button = event.target.closest && event.target.closest("[data-save]");
    if (!button || !grid.contains(button)) return;
    const entry = entriesBySaveId.get(button.dataset.save);
    if (!entry) return;
    const saved = PF.toggleSaved({ id: button.dataset.save, title: entry.item.name || "PigBang item", description: entry.item.desc || "", section: "PigBang", url: localUrl(entry.id) });
    button.classList.toggle("is-saved", saved);
    button.textContent = saved ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(saved));
  }

  function matches() {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (entriesByTab.get(activeTab) || []).filter((entry) => {
      if (activeLevel !== "all" && !entry.classes.includes(activeLevel)) return false;
      if (activePrice !== "all" && entry.price !== activePrice) return false;
      return terms.every((term) => entry.haystack.includes(term));
    });
  }

  function render(appendFrom = -1, filtered = matches()) {
    currentMatches = filtered;
    const shown = filtered.slice(0, visible);
    countTarget.textContent = `${filtered.length} ${filtered.length === 1 ? "result" : "results"}`;
    moreButton.hidden = shown.length >= filtered.length;
    if (!shown.length) {
      grid.innerHTML = `<div class="empty-state"><strong>No close match</strong><p>Try another level, price or fewer search words.</p></div>`;
      if (PF.applyLanguageTo) PF.applyLanguageTo(grid);
      return;
    }
    if (appendFrom >= 0 && grid.children.length === appendFrom) {
      const additions = filtered.slice(appendFrom, visible);
      grid.insertAdjacentHTML("beforeend", additions.map(card).join(""));
    } else {
      grid.innerHTML = shown.map(card).join("");
    }
    if (PF.applyLanguageTo) PF.applyLanguageTo(grid);
  }

  function updatePressed(buttons, isSelected) {
    buttons.forEach((button) => {
      const selected = isSelected(button);
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setTab(tab) {
    activeTab = tab;
    visible = PAGE_SIZE;
    updatePressed(tabButtons, (button) => button.dataset.tab === tab);
    render();
  }

  function buildFilters() {
    tabsTarget.innerHTML = data.tabs.map((tab) => `<button class="filter-chip${tab.id === activeTab ? " active" : ""}" type="button" data-tab="${PF.escapeHtml(tab.id)}" aria-pressed="${tab.id === activeTab}">${PF.escapeHtml(tabLabels[tab.id] || tab.id)}</button>`).join("");
    tabButtons = Array.from(tabsTarget.querySelectorAll("[data-tab]"));
    tabsTarget.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-tab]");
      if (button && tabsTarget.contains(button)) setTab(button.dataset.tab);
    });

    levelsTarget.innerHTML = `<button class="filter-chip active" type="button" data-level="all" aria-pressed="true">All levels</button>${levels.map((level) => `<button class="filter-chip" type="button" data-level="${PF.escapeHtml(level)}" aria-pressed="false">${PF.escapeHtml(level)}</button>`).join("")}`;
    levelButtons = Array.from(levelsTarget.querySelectorAll("[data-level]"));
    levelsTarget.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-level]");
      if (!button || !levelsTarget.contains(button)) return;
      activeLevel = button.dataset.level;
      visible = PAGE_SIZE;
      updatePressed(levelButtons, (chip) => chip === button);
      render();
    });

    if (priceTarget) priceTarget.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-price]");
      if (!button || !priceTarget.contains(button)) return;
      activePrice = button.dataset.price;
      visible = PAGE_SIZE;
      updatePressed(priceButtons, (chip) => chip === button);
      render();
    });
    if (PF.applyLanguageTo) {
      PF.applyLanguageTo(tabsTarget);
      PF.applyLanguageTo(levelsTarget);
      priceButtons.forEach((button) => PF.applyLanguageTo(button));
    }
  }

  function revealHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const entry = entriesById.get(id);
    if (!entry) return;
    activeTab = entry.tab;
    activeLevel = "all";
    activePrice = "all";
    input.value = "";
    const tabEntries = entriesByTab.get(activeTab) || [];
    visible = Math.max(PAGE_SIZE, tabEntries.findIndex((candidate) => candidate.id === id) + 1);
    updatePressed(tabButtons, (button) => button.dataset.tab === activeTab);
    updatePressed(levelButtons, (button) => button.dataset.level === "all");
    updatePressed(priceButtons, (button) => button.dataset.price === "all");
    render();
    requestAnimationFrame(() => {
      const card = document.getElementById(id);
      if (!card) return;
      card.classList.add("deep-linked");
      const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      setTimeout(() => card.classList.remove("deep-linked"), 3500);
    });
  }

  buildFilters();
  render();
  // Artwork is third-party and will sometimes 404 or be blocked. "error" does not bubble,
  // so this listens in the capture phase and drops the image, revealing the generated
  // symbol underneath instead of an empty tile.
  grid.addEventListener("error", (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.classList.contains("watch-art-img")) image.remove();
  }, true);
  // The generated symbol is the fallback, so it stays painted until real art arrives — at
  // which point it must get out of the way rather than sit on top of the poster. "load"
  // does not bubble either, hence the capture phase.
  grid.addEventListener("load", (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.classList.contains("watch-art-img")) {
      image.parentElement.classList.add("has-art");
    }
  }, true);
  grid.addEventListener("click", handleGridClick);
  input.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { visible = PAGE_SIZE; render(); }, 160); });
  moreButton.addEventListener("click", () => {
    const appendFrom = Math.min(visible, grid.children.length);
    visible += PAGE_SIZE;
    render(appendFrom, currentMatches);
  });
  window.addEventListener("hashchange", revealHash);
  document.addEventListener("pf:saved-changed", (event) => {
    grid.querySelectorAll(`[data-save="${CSS.escape(event.detail.id)}"]`).forEach((button) => {
      const saved = PF.isSaved(event.detail.id);
      button.classList.toggle("is-saved", saved);
      button.textContent = saved ? "♥" : "♡";
      button.setAttribute("aria-pressed", String(saved));
    });
  });
  revealHash();
})();
