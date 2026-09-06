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
  const billboard = document.querySelector("#watch-billboard");
  const featured = document.querySelector("#watch-featured");
  const rowsTarget = document.querySelector("#watch-rows");
  const resultsTarget = document.querySelector("#watch-results");
  const PAGE_SIZE = 24;
  const ROW_LIMIT = 20;
  const tabLabels = { movies: "Films & shows", channels: "Channels & playlists", apps: "Learning apps" };
  // Curriculum order, not alphabetical: a shelf list that runs Nursery to PhD is a reading
  // of the catalogue, and "6-8" sorted next to "9-12" alphabetically is not.
  const LEVEL_SHELVES = [
    ["N-5", "Nursery to Class 5"],
    ["6-8", "Class 6 to 8"],
    ["9-12", "Class 9 to 12"],
    ["UG", "Undergraduate"],
    ["PG", "Postgraduate"],
    ["PhD", "PhD & research"],
    ["Vocational & Business", "Vocational & business"],
    ["Teacher Training", "Teacher training"]
  ];
  let activeTab = "all";
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

  // Classification, brand names and the marks themselves come from js/site.js, which every
  // page already loads. See the pf:source-marks block there.
  const sourceType = PF.classifySource;
  const sourceBrand = PF.sourceBrand;
  const sourceMark = PF.sourceMark;

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

  function entryLinks(entry) {
    const item = entry.item;
    const urls = entryUrls(entry);
    if (!urls.length) return `<span class="link-button"><span>Source is being reviewed</span></span>`;
    return urls.map((url) => {
      const type = sourceType(url);
      const brand = sourceBrand(url, type);
      const playable = PF.YouTube && PF.YouTube.parse(url);
      if (playable) return `<span class="source-link-pair"><a class="link-button source-video source-brand-${brand}" href="${PF.escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-youtube-play data-title="${PF.escapeHtml(item.name || "PigBang")}">${sourceMark(url, type)}<span>${PF.escapeHtml(sourceLabel(url))}</span></a></span>`;
      return `<span class="source-link-pair"><a class="link-button source-${type} source-brand-${brand}" href="${PF.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${sourceMark(url, type)}<span>${PF.escapeHtml(sourceLabel(url))}</span></a></span>`;
    }).join("");
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
    const links = entryLinks(entry);

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

  /* ---------------------------------------------------------------------------
   * The OTT surface: a billboard, then shelves.
   *
   * PigBang held 589 titles behind three chip rows and one flat grid, which is a database
   * view — you had to know what you wanted before it showed you anything. A streaming
   * service answers the opposite question, so the default view is now browsing: one
   * featured title, then shelves you scroll sideways. The grid is still here, and it is
   * what a search or a filter switches to, because that is when a flat ranked list is
   * actually the right shape.
   * ------------------------------------------------------------------------- */

  function levelText(entry) {
    return (entry.classes || []).join(" · ");
  }

  function priceText(entry) {
    const price = String(entry.item.price || "").trim();
    return price || "Check source";
  }

  function playableUrl(entry) {
    if (!PF.YouTube || typeof PF.YouTube.parse !== "function") return "";
    return entryUrls(entry).find((url) => PF.YouTube.parse(url)) || "";
  }

  function openUrl(entry) {
    return playableUrl(entry) || entryUrls(entry)[0] || "";
  }

  function tile(entry) {
    const item = entry.item;
    const art = artworkFor(entry);
    const saveId = `pigbang:${entry.id}`;
    const saved = PF.isSaved(saveId);
    const play = playableUrl(entry);
    const open = openUrl(entry);
    const action = play
      ? `<a class="ott-play" href="${PF.escapeHtml(play)}" target="_blank" rel="noopener noreferrer" data-youtube-play data-title="${PF.escapeHtml(item.name || "PigBang")}" aria-label="Play ${PF.escapeHtml(item.name || "this title")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7.5 8 4.5-8 4.5v-9Z"/></svg></a>`
      : open
        ? `<a class="ott-play" href="${PF.escapeHtml(open)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${PF.escapeHtml(item.name || "this title")} at its source"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v2h3.6l-8.3 8.3 1.4 1.4L19 6.4V10h2V3h-7Zm5 16H5V5h5V3H3v18h18v-7h-2v5Z"/></svg></a>`
        : "";
    return `<li class="ott-tile">
      <div class="ott-art watch-art watch-art-${entry.tab}" style="--visual-hue:${visualHue(item.name)}">${watchSymbol(entry)}${art ? `<img class="watch-art-img" src="${PF.escapeHtml(art.src)}" width="${art.width}" height="${art.height}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
        <div class="ott-tile-overlay">${action}<button class="card-tool${saved ? " is-saved" : ""}" type="button" data-save="${PF.escapeHtml(saveId)}" aria-label="${saved ? "Remove from" : "Save to"} your list" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button></div>
      </div>
      <button class="ott-tile-title" type="button" data-detail="${PF.escapeHtml(entry.id)}">${PF.escapeHtml(item.name || "Untitled")}</button>
      <p class="ott-tile-meta">${PF.escapeHtml([levelText(entry), priceText(entry)].filter(Boolean).join(" · "))}</p>
    </li>`;
  }

  function shelves() {
    const list = [];
    const free = entries.filter((entry) => entry.price === "free");
    if (free.length) list.push({ id: "free", title: "Free to watch", entries: free, filter: { price: "free" } });
    (data.tabs || []).forEach((tab) => {
      const tabEntries = entriesByTab.get(tab.id) || [];
      if (tabEntries.length) list.push({ id: `tab-${tab.id}`, title: tabLabels[tab.id] || tab.id, entries: tabEntries, filter: { tab: tab.id } });
    });
    LEVEL_SHELVES.forEach(([level, title]) => {
      const forLevel = entries.filter((entry) => entry.classes.includes(level));
      if (forLevel.length >= 8) list.push({ id: `level-${PF.slug(level)}`, title, entries: forLevel, filter: { level } });
    });
    return list;
  }

  const shelfEntries = new Map();

  function buildRows() {
    const list = shelves();
    list.forEach((shelf) => shelfEntries.set(shelf.id, shelf));
    rowsTarget.innerHTML = list.map((shelf) => `<section class="ott-row" data-shelf="${PF.escapeHtml(shelf.id)}">
      <div class="ott-row-head">
        <h2>${PF.escapeHtml(shelf.title)}</h2>
        <button class="ott-row-all" type="button" data-shelf-all="${PF.escapeHtml(shelf.id)}">See all ${shelf.entries.length}</button>
      </div>
      <div class="ott-row-scroll">
        <button class="ott-row-arrow" type="button" data-scroll="-1" aria-label="Scroll ${PF.escapeHtml(shelf.title)} left" hidden>‹</button>
        <ul class="ott-row-track" aria-label="${PF.escapeHtml(shelf.title)}"></ul>
        <button class="ott-row-arrow next" type="button" data-scroll="1" aria-label="Scroll ${PF.escapeHtml(shelf.title)} right" hidden>›</button>
      </div>
    </section>`).join("");

    // Shelves fill when they are about to be seen. Thirteen shelves of twenty tiles is 260
    // cards, and a browser asked to lay all of them out before the first paint is a browser
    // that paints late.
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver((records) => {
        records.forEach((record) => {
          if (!record.isIntersecting) return;
          fillRow(record.target);
          observer.unobserve(record.target);
        });
      }, { rootMargin: "600px 0px" })
      : null;
    rowsTarget.querySelectorAll(".ott-row").forEach((row, index) => {
      if (!observer || index < 2) fillRow(row);
      else observer.observe(row);
    });
  }

  function fillRow(row) {
    const track = row.querySelector(".ott-row-track");
    if (!track || track.dataset.filled === "true") return;
    const shelf = shelfEntries.get(row.dataset.shelf);
    if (!shelf) return;
    track.innerHTML = shelf.entries.slice(0, ROW_LIMIT).map(tile).join("");
    track.dataset.filled = "true";
    updateArrows(row);
    if (PF.applyLanguageTo) PF.applyLanguageTo(track);
  }

  function updateArrows(row) {
    const track = row.querySelector(".ott-row-track");
    const [previous, next] = row.querySelectorAll(".ott-row-arrow");
    if (!track || !previous || !next) return;
    const overflow = track.scrollWidth - track.clientWidth;
    previous.hidden = track.scrollLeft <= 4;
    next.hidden = overflow <= 4 || track.scrollLeft >= overflow - 4;
  }

  function handleRowsClick(event) {
    const scroller = event.target.closest && event.target.closest("[data-scroll]");
    if (scroller) {
      const track = scroller.parentElement.querySelector(".ott-row-track");
      if (track) track.scrollBy({ left: Number(scroller.dataset.scroll) * track.clientWidth * 0.85, behavior: reduceMotion() ? "auto" : "smooth" });
      return;
    }
    const all = event.target.closest && event.target.closest("[data-shelf-all]");
    if (all) {
      applyShelfFilter(shelfEntries.get(all.dataset.shelfAll));
      return;
    }
    const detail = event.target.closest && event.target.closest("[data-detail]");
    if (detail) {
      openDetail(entriesById.get(detail.dataset.detail));
      return;
    }
    handleGridClick(event);
  }

  function applyShelfFilter(shelf) {
    if (!shelf) return;
    const filter = shelf.filter || {};
    activeTab = filter.tab || "all";
    activeLevel = filter.level || "all";
    activePrice = filter.price || "all";
    input.value = "";
    visible = PAGE_SIZE;
    syncFilterButtons();
    render();
    if (resultsTarget) resultsTarget.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  }

  function reduceMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* The billboard: one title, chosen by the day rather than at random, so a visitor who
   * comes back in an hour is not shown a different front page for no reason. */
  function featuredEntry() {
    const candidates = entries.filter((entry) => entry.item.desc && artworkUrl(entry) && entryUrls(entry).length);
    if (!candidates.length) return null;
    const day = Math.floor(Date.now() / 86400000);
    return candidates[day % candidates.length];
  }

  function buildBillboard() {
    const entry = featuredEntry();
    if (!billboard || !featured || !entry) return;
    const item = entry.item;
    const art = artworkFor(entry);
    const saveId = `pigbang:${entry.id}`;
    const saved = PF.isSaved(saveId);
    const play = playableUrl(entry);
    const open = openUrl(entry);
    const primary = play
      ? `<a class="button brand" href="${PF.escapeHtml(play)}" target="_blank" rel="noopener noreferrer" data-youtube-play data-title="${PF.escapeHtml(item.name || "PigBang")}"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7.5 8 4.5-8 4.5v-9Z"/></svg> Play</a>`
      : `<a class="button brand" href="${PF.escapeHtml(open)}" target="_blank" rel="noopener noreferrer">Open at the source</a>`;
    const media = document.querySelector("#watch-billboard-media");
    if (media && art) media.innerHTML = `<img src="${PF.escapeHtml(art.src)}" width="${art.width}" height="${art.height}" alt="" decoding="async" referrerpolicy="no-referrer">`;
    featured.innerHTML = `<p class="ott-billboard-kicker">Featured today</p>
      <h2 class="ott-billboard-title">${PF.escapeHtml(item.name || "PigBang")}</h2>
      <p class="ott-billboard-meta">${PF.escapeHtml([tabLabels[entry.tab] || "", levelText(entry), priceText(entry), item.subject || ""].filter(Boolean).join("  ·  "))}</p>
      <p class="ott-billboard-desc">${PF.escapeHtml(item.desc || "")}</p>
      <div class="ott-billboard-actions">
        ${primary}
        <button class="button ghost" type="button" data-detail="${PF.escapeHtml(entry.id)}">More info</button>
        <button class="card-tool${saved ? " is-saved" : ""}" type="button" data-save="${PF.escapeHtml(saveId)}" aria-label="${saved ? "Remove from" : "Save to"} your list" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
      </div>`;
    if (PF.applyLanguageTo) PF.applyLanguageTo(featured);
  }

  /* More info: everything the shelf tile could not say, including every original link. */
  let detailDialog = null;

  function ensureDetailDialog() {
    if (detailDialog) return detailDialog;
    detailDialog = document.createElement("dialog");
    detailDialog.className = "site-dialog wide ott-detail";
    detailDialog.id = "watch-detail-dialog";
    document.body.appendChild(detailDialog);
    detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
    detailDialog.addEventListener("click", (event) => {
      if (event.target.closest && event.target.closest("[data-close-dialog]")) detailDialog.close();
    });
    detailDialog.addEventListener("click", handleGridClick);
    // Same artwork contract as the shelves: drop a poster that will not load, and let the
    // generated symbol out of the way when one does.
    detailDialog.addEventListener("error", (event) => {
      const image = event.target;
      if (image instanceof HTMLImageElement && image.classList.contains("watch-art-img")) image.remove();
    }, true);
    detailDialog.addEventListener("load", (event) => {
      const image = event.target;
      if (image instanceof HTMLImageElement && image.classList.contains("watch-art-img")) image.parentElement.classList.add("has-art");
    }, true);
    return detailDialog;
  }

  function openDetail(entry) {
    if (!entry) return;
    const dialog = ensureDetailDialog();
    const item = entry.item;
    const art = artworkFor(entry);
    const saveId = `pigbang:${entry.id}`;
    const saved = PF.isSaved(saveId);
    dialog.innerHTML = `<div class="dialog-head"><h2>${PF.escapeHtml(item.name || "PigBang")}</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close details">×</button></div>
      <div class="dialog-body ott-detail-body">
        <div class="ott-detail-art watch-art watch-art-${entry.tab}" style="--visual-hue:${visualHue(item.name)}">${watchSymbol(entry)}${art ? `<img class="watch-art-img" src="${PF.escapeHtml(art.src)}" width="${art.width}" height="${art.height}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</div>
        <div class="resource-tags">
          <span class="tag">${PF.escapeHtml(tabLabels[entry.tab] || "PigBang")}</span>
          ${(entry.classes || []).map((level) => `<span class="tag">${PF.escapeHtml(level)}</span>`).join("")}
          <span class="tag ${/^free$/i.test(priceText(entry)) ? "free" : /^paid$/i.test(priceText(entry)) ? "paid" : ""}">${PF.escapeHtml(priceText(entry))}</span>
          ${item.subject ? `<span class="tag">${PF.escapeHtml(item.subject)}</span>` : ""}
        </div>
        ${item.desc ? `<p>${PF.escapeHtml(item.desc)}</p>` : ""}
        <div class="direct-links" aria-label="Original resource links">${entryLinks(entry)}</div>
        <div class="ott-detail-actions"><button class="card-tool${saved ? " is-saved" : ""}" type="button" data-save="${PF.escapeHtml(saveId)}" aria-label="${saved ? "Remove from" : "Save to"} your list" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button><span>Save to your list</span></div>
      </div>`;
    if (PF.applyLanguageTo) PF.applyLanguageTo(dialog);
    if (typeof dialog.showModal === "function") { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute("open", "");
  }

  function browsing() {
    return !input.value.trim() && activeTab === "all" && activeLevel === "all" && activePrice === "all";
  }

  function handleGridClick(event) {
    const anchor = event.target.closest && event.target.closest("a[data-youtube-play]");
    if (anchor) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!PF.YouTube || typeof PF.YouTube.play !== "function") return;
      event.preventDefault();
      PF.YouTube.play(anchor.href, anchor.dataset.title || "PigBang");
      return;
    }

    const button = event.target.closest && event.target.closest("[data-save]");
    if (!button) return;
    const entry = entriesBySaveId.get(button.dataset.save);
    if (!entry) return;
    const saved = PF.toggleSaved({ id: button.dataset.save, title: entry.item.name || "PigBang item", description: entry.item.desc || "", section: "PigBang", url: localUrl(entry.id) });
    button.classList.toggle("is-saved", saved);
    button.textContent = saved ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(saved));
  }

  function matches() {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pool = activeTab === "all" ? entries : (entriesByTab.get(activeTab) || []);
    return pool.filter((entry) => {
      if (activeLevel !== "all" && !entry.classes.includes(activeLevel)) return false;
      if (activePrice !== "all" && entry.price !== activePrice) return false;
      return terms.every((term) => entry.haystack.includes(term));
    });
  }

  function render(appendFrom = -1, filtered = matches()) {
    // Browsing is the default: shelves and a billboard. A search or a filter is a question
    // with a ranked answer, so that switches to the grid.
    const browse = browsing();
    if (rowsTarget) rowsTarget.hidden = !browse;
    if (resultsTarget) resultsTarget.hidden = browse;
    if (featured) featured.hidden = !browse;
    if (browse) {
      countTarget.textContent = `${entries.length} titles`;
      return;
    }
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

  function syncFilterButtons() {
    updatePressed(tabButtons, (button) => button.dataset.tab === activeTab);
    updatePressed(levelButtons, (button) => button.dataset.level === activeLevel);
    updatePressed(priceButtons, (button) => button.dataset.price === activePrice);
  }

  function buildFilters() {
    tabsTarget.innerHTML = [["all", "Browse all"]].concat(data.tabs.map((tab) => [tab.id, tabLabels[tab.id] || tab.id]))
      .map(([id, label]) => `<button class="filter-chip${id === activeTab ? " active" : ""}" type="button" data-tab="${PF.escapeHtml(id)}" aria-pressed="${id === activeTab}">${PF.escapeHtml(label)}</button>`).join("");
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
    // A deep link is a request for one title, so it lands in the grid rather than leaving
    // the reader to find it on a shelf.
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
  buildBillboard();
  buildRows();
  render();
  if (billboard) billboard.addEventListener("click", (event) => {
    const detail = event.target.closest && event.target.closest("[data-detail]");
    if (detail) {
      openDetail(entriesById.get(detail.dataset.detail));
      return;
    }
    handleGridClick(event);
  });
  if (rowsTarget) {
    rowsTarget.addEventListener("click", handleRowsClick);
    rowsTarget.addEventListener("scroll", (event) => {
      const row = event.target.closest && event.target.closest(".ott-row");
      if (row) updateArrows(row);
    }, true);
    // Artwork failures and arrivals are handled for the shelves exactly as for the grid.
    rowsTarget.addEventListener("error", (event) => {
      const image = event.target;
      if (image instanceof HTMLImageElement && image.classList.contains("watch-art-img")) image.remove();
    }, true);
    rowsTarget.addEventListener("load", (event) => {
      const image = event.target;
      if (image instanceof HTMLImageElement && image.classList.contains("watch-art-img")) image.parentElement.classList.add("has-art");
    }, true);
    window.addEventListener("resize", () => rowsTarget.querySelectorAll(".ott-row").forEach(updateArrows));
  }
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
    document.querySelectorAll(`[data-save="${CSS.escape(event.detail.id)}"]`).forEach((button) => {
      const saved = PF.isSaved(event.detail.id);
      button.classList.toggle("is-saved", saved);
      button.textContent = saved ? "♥" : "♡";
      button.setAttribute("aria-pressed", String(saved));
    });
  });
  revealHash();
})();
