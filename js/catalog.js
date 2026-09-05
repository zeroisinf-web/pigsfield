(function () {
  "use strict";

  const PF = window.PF;
  const key = document.body.dataset.catalog;
  const data = window.PF_DATA && window.PF_DATA[key];
  const root = document.querySelector("#catalog-root");
  if (!PF || !key || !data || !root) return;

  const sectionsTarget = document.querySelector("#catalog-sections");
  const searchTarget = document.querySelector("#catalog-search-results");
  const input = document.querySelector("#catalog-search");
  const countTarget = document.querySelector("#catalog-count");
  const filterTarget = document.querySelector("#catalog-filters");
  const collapsibleGroups = root.dataset.collapsibleGroups === "true";
  const directSections = root.dataset.directSections === "true";
  const destinationName = ({
    school: "Nursery to PhD",
    teach: "Vocational & Business",
    tools: "Digital Tools",
    govt: "Make Govt Accountable"
  })[key] || document.title.split("|")[0].trim();
  const blockedHosts = new Set([
    "cineby.at", "www.cineby.at", "themoviebox.org", "www.themoviebox.org",
    "yarrlist.net", "www.yarrlist.net", "kisskh.nl", "www.kisskh.nl",
    "animesalt.in", "animesalt.ac", "hianimes.se", "www.hianimes.se"
  ]);
  const sourceMarkParts = {
    youtube: '<span class="source-mark-body"><span class="source-mark-play"></span></span>',
    "google-play": '<span class="source-mark-play-triangle source-mark-play-triangle-a"></span><span class="source-mark-play-triangle source-mark-play-triangle-b"></span><span class="source-mark-play-triangle source-mark-play-triangle-c"></span>',
    "apple-store": '<span class="source-mark-apple-fruit"></span><span class="source-mark-apple-leaf"></span>',
    app: '<span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span>',
    document: '<span class="source-mark-page"><span class="source-mark-page-fold"></span><span class="source-mark-page-line"></span><span class="source-mark-page-line"></span></span>',
    website: '<span class="source-mark-globe"><span class="source-mark-globe-axis"></span><span class="source-mark-globe-ring"></span></span>'
  };
  let activeType = "all";
  let searchTimer;
  const entriesById = new Map();
  const entriesBySaveId = new Map();
  const entriesBySectionGroup = (data.sections || []).map((section) =>
    (section.groups || []).map(() => [])
  );

  function cleanUrl(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || blockedHosts.has(url.hostname.toLowerCase())) return "";
      Array.from(url.searchParams.keys()).forEach((name) => {
        if (/^utm_/i.test(name) || ["fbclid", "gclid", "ref"].includes(name.toLowerCase())) url.searchParams.delete(name);
      });
      return url.href;
    } catch (_) {
      return "";
    }
  }

  // A youtube.com/results link is a search, not a video. isYouTube() says true for any
  // YouTube host, so without this these 96 catalogue links get the red play affordance
  // and a "Tutorial" label for a page that plays nothing.
  function isYouTubeSearch(url) {
    try {
      const parsed = new URL(url);
      return /(?:^|\.)youtube\.com$/i.test(parsed.hostname) && parsed.pathname === "/results";
    } catch (_) {
      return false;
    }
  }

  function classifyUrl(url) {
    const lower = url.toLowerCase();
    if (isYouTubeSearch(url)) return "website";
    if (PF.YouTube && PF.YouTube.isYouTube(url)) return "video";
    if (/play\.google\.com|apps\.apple\.com|microsoft\.com\/store/.test(lower)) return "app";
    if (/\.pdf(?:$|\?)|drive\.google\.com|docs\.google\.com/.test(lower)) return "document";
    return "website";
  }

  function flattenLinks(item) {
    const output = [];
    const seen = new Set();
    (item.links || []).forEach((group) => {
      (group.urls || []).forEach((value) => {
        const url = cleanUrl(value);
        if (!url || seen.has(url)) return;
        seen.add(url);
        output.push({
          url,
          type: classifyUrl(url),
          label: group.label || ""
        });
      });
    });
    return output;
  }

  function resourceIdFor(item, section, sectionIndex, groupIndex, itemIndex) {
    return PF.slug(`${item.title}-${section.resourceIdSection || sectionIndex + 1}-${groupIndex + 1}-${itemIndex + 1}`);
  }

  function legacyTeacherTrainingIds(section) {
    const ids = new Set();
    (section.groups || []).forEach((group, groupIndex) => {
      (group.items || []).forEach((item, itemIndex) => {
        ids.add(resourceIdFor(item, section, 0, groupIndex, itemIndex));
      });
    });
    return ids;
  }

  function redirectLegacyTeacherTrainingHash() {
    if (key !== "teach" || !location.hash) return false;
    const teacherTraining = window.PF_DATA && window.PF_DATA.teacherTraining;
    if (!teacherTraining) return false;
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch (_) {
      return false;
    }
    if (!id || !legacyTeacherTrainingIds(teacherTraining).has(id)) return false;
    const target = new URL(PF.path("learn"), location.href);
    if (target.origin !== location.origin) return false;
    target.hash = id;
    location.replace(target.href);
    return true;
  }

  if (redirectLegacyTeacherTrainingHash()) return;

  const entries = [];
  (data.sections || []).forEach((section, sectionIndex) => {
    (section.groups || []).forEach((group, groupIndex) => {
      (group.items || []).forEach((item, itemIndex) => {
        const id = resourceIdFor(item, section, sectionIndex, groupIndex, itemIndex);
        const saveId = `${section.saveKey || key}:${id}`;
        const links = flattenLinks(item);
        const entry = {
          item,
          section,
          group,
          sectionIndex,
          groupIndex,
          itemIndex,
          id,
          saveId,
          links,
          types: new Set(links.map((link) => link.type)),
          haystack: `${item.title || ""} ${item.desc || ""} ${item.badge || ""} ${group.title || ""} ${section.title || ""} ${(item.extra || []).map((part) => `${part.label || ""} ${part.text || ""}`).join(" ")}`.toLowerCase(),
          cardMarkup: null
        };
        entries.push(entry);
        entriesById.set(id, entry);
        entriesBySaveId.set(saveId, entry);
        entriesBySectionGroup[sectionIndex][groupIndex].push(entry);
      });
    });
  });

  function localUrl(id) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = id;
    return url.href;
  }

  function externalLabel(link) {
    if (isYouTubeSearch(link.url)) return "Search YouTube";
    let host = "Source";
    try { host = new URL(link.url).hostname.replace(/^www\./, ""); } catch (_) {}
    const label = String(link.label || "").replace(/\b(?:youtube|website|web|app|pdf)\b/gi, "").replace(/\s{2,}/g, " ").trim();
    if (label && !/^(url|link)$/i.test(label)) return label.length > 52 ? host : label;
    return host;
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

  function visualHue(value) {
    let hash = 0;
    for (const char of String(value || "Pigsfield")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % 360;
  }

  function resourceSymbolType(entry) {
    const title = String(entry.item.title || "");
    const lower = `${title} ${entry.item.desc || ""}`.toLowerCase();
    if (/rti|legal|law|grievance|consumer|citizen|सरकार|अधिकार|शिकायत/.test(lower)) return "rights";
    if (/artificial intelligence|\bai\b|machine learning|chatgpt/.test(lower)) return "ai";
    if (/code|coding|developer|programming|python|javascript/.test(lower)) return "code";
    if (/book|textbook|ncert|library|reading|pdf/.test(lower)) return "book";
    if (/teacher|teaching|pedagogy|classroom|educator/.test(lower)) return "teaching";
    if (/research|phd|journal|citation|paper|scholar/.test(lower)) return "research";
    if (entry.types.has("video")) return "video";
    if (entry.types.has("app")) return "app";
    return "web";
  }

  function resourceSymbol(entry) {
    const type = resourceSymbolType(entry);
    const emoji = PF.resourceSymbolFor({
      title: entry.item.title,
      description: entry.item.desc,
      context: `${entry.group.title || ""} ${entry.section.title || ""}`,
      urls: entry.links.map((link) => link.url),
      type
    });
    return `<span class="resource-emoji resource-emoji-card" aria-hidden="true">${emoji}</span>`;
  }

  function primaryDomain(entry) {
    try { return new URL(entry.links[0].url).hostname.replace(/^www\./, ""); } catch (_) { return "Pigsfield resource"; }
  }

  function displaySectionTitle(value) {
    return String(value || "")
      .replace(/^\s*(?:section|भाग)\s*(?:\d+)?\s*(?:—|–|-|:)?\s*/i, "")
      .replace(/^\s*\d+\s*(?:—|–|-|:)\s*/, "")
      .trim();
  }

  function renderExtra(extra) {
    const useful = (extra || []).filter((part) => part && part.text && part.text.replace(/[|\s]/g, ""));
    if (!useful.length) return "";
    return `<details class="resource-links resource-notes">
      <summary>Practical guide</summary>
      <div class="link-list extra-list">${useful.map((part) => `<div><strong>${PF.escapeHtml(part.label || "More information")}</strong><p>${PF.escapeHtml(part.text)}</p></div>`).join("")}</div>
    </details>`;
  }

  function renderCard(entry) {
    const item = entry.item;
    const saveId = entry.saveId;
    const saved = PF.isSaved(saveId);
    const cacheIndex = saved ? 1 : 0;
    const cardMarkup = entry.cardMarkup || (entry.cardMarkup = []);
    if (cardMarkup[cacheIndex]) return cardMarkup[cacheIndex];
    const tags = [];
    if (item.badge) tags.push(item.badge);
    if (entry.links.some((link) => /(?:\.gov\.in|\.nic\.in|ncert\.nic\.in|ugc\.gov\.in|swayam\.gov\.in)/i.test(link.url))) tags.unshift("Public source");

    const links = entry.links.length ? entry.links.map((link) => {
      const directVideo = link.type === "video" && PF.YouTube && PF.YouTube.parse(link.url);
      const brand = sourceBrand(link.url, link.type);
      if (directVideo) {
        return `<span class="source-link-pair"><a class="link-button source-video source-brand-${brand}" href="${PF.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-youtube-play data-title="${PF.escapeHtml(item.title || "Video")}">${sourceMark(link.url, link.type)}<span>${PF.escapeHtml(externalLabel(link))}</span></a></span>`;
      }
      return `<span class="source-link-pair"><a class="link-button source-${link.type} source-brand-${brand}" href="${PF.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${sourceMark(link.url, link.type)}<span>${PF.escapeHtml(externalLabel(link))}</span></a></span>`;
    }).join("") : `<span class="link-button"><span>Source is being reviewed</span></span>`;

    const markup = `<article class="resource-card" id="${PF.escapeHtml(entry.id)}" data-entry-id="${PF.escapeHtml(saveId)}">
      <div class="resource-visual resource-visual-${resourceSymbolType(entry)}" style="--visual-hue:${visualHue(item.title)}" aria-hidden="true">${resourceSymbol(entry)}<span class="resource-domain">${PF.escapeHtml(primaryDomain(entry))}</span></div>
      <div class="resource-topline">
        <span class="tag">${PF.escapeHtml(displaySectionTitle(entry.group.title || entry.section.title || "Curated"))}</span>
        <div class="card-tools">
          <button class="card-tool${saved ? " is-saved" : ""}" type="button" data-save="${PF.escapeHtml(saveId)}" aria-label="${saved ? "Remove from" : "Save to"} your list" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
        </div>
      </div>
      ${tags.length ? `<div class="resource-tags">${Array.from(new Set(tags)).slice(0, 4).map((tag) => `<span class="tag">${PF.escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <h3>${PF.escapeHtml(item.title || item.desc || "Untitled resource")}</h3>
      ${item.desc ? `<p>${PF.escapeHtml(item.desc)}</p>` : ""}
      ${item.warning ? `<p class="resource-warning" role="note">${PF.escapeHtml(item.warning)}</p>` : ""}
      <div class="resource-actions">
        ${renderExtra(item.extra)}
        <div class="direct-links" aria-label="Original resource links">${links}</div>
      </div>
    </article>`;
    cardMarkup[cacheIndex] = markup;
    return markup;
  }

  function handleCatalogClick(event) {
    const summary = event.target.closest && event.target.closest("summary");
    const groupDetails = summary && summary.parentElement;
    if (groupDetails && groupDetails.matches("details.catalog-group") && root.contains(groupDetails)) {
      renderGroup(groupDetails);
      return;
    }

    const anchor = event.target.closest && event.target.closest("a[data-youtube-play]");
    if (anchor && root.contains(anchor)) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!PF.YouTube || typeof PF.YouTube.play !== "function") return;
      event.preventDefault();
      PF.YouTube.play(anchor.href, anchor.dataset.title || "Video");
      return;
    }

    const button = event.target.closest && event.target.closest("[data-save]");
    if (!button || !root.contains(button)) return;
    const entry = entriesBySaveId.get(button.dataset.save);
    if (!entry) return;
    const nowSaved = PF.toggleSaved({
      id: button.dataset.save,
      title: entry.item.title || "Resource",
      description: entry.item.desc || "",
      section: destinationName,
      url: localUrl(entry.id)
    });
    button.classList.toggle("is-saved", nowSaved);
    button.textContent = nowSaved ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(nowSaved));
  }

  function sectionEntries(sectionIndex) {
    return (entriesBySectionGroup[sectionIndex] || []).flat();
  }

  function renderGroup(details) {
    const content = details.querySelector(".catalog-group-content");
    if (!content || content.dataset.rendered === "true") return;
    const sectionIndex = Number(details.dataset.sectionIndex);
    const groupIndex = Number(details.dataset.groupIndex);
    const sectionGroups = entriesBySectionGroup[sectionIndex] || [];
    const groupEntries = sectionGroups[groupIndex] || [];
    content.innerHTML = `<div class="resource-grid">${groupEntries.map((entry) => renderCard(entry)).join("")}</div>`;
    content.dataset.rendered = "true";
    if (PF.applyLanguageTo) PF.applyLanguageTo(content);
  }

  function renderSection(details, sectionIndex) {
    const content = details.querySelector(".section-content");
    if (content.dataset.rendered === "true") return;
    const groups = data.sections[sectionIndex].groups || [];
    const groupMarkup = groups.map((group, groupIndex) => {
      const groupEntries = entriesBySectionGroup[sectionIndex][groupIndex];
      const title = displaySectionTitle(group.title) || "Curated resources";
      const headingTag = directSections ? "h3" : "h2";
      if (!collapsibleGroups) return `<section class="group-block">${group.title ? `<${headingTag} class="group-title">${PF.escapeHtml(title)}</${headingTag}>` : ""}<div class="resource-grid">${groupEntries.map((entry) => renderCard(entry)).join("")}</div></section>`;
      const groupId = `catalog-group-${sectionIndex}-${groupIndex}`;
      const symbol = PF.resourceSymbolFor({
        title,
        context: data.sections[sectionIndex].title,
        type: "group"
      });
      return `<details class="group-block catalog-group" id="${groupId}" data-catalog-group data-section-index="${sectionIndex}" data-group-index="${groupIndex}">
        <summary class="catalog-group-summary"><span class="catalog-group-symbol" aria-hidden="true">${symbol}</span><span>${PF.escapeHtml(title)}<small class="summary-meta">${groupEntries.length} ${groupEntries.length === 1 ? "resource" : "resources"}</small></span></summary>
        <div class="catalog-group-content"></div>
      </details>`;
    }).join("");
    if (collapsibleGroups && groups.length) {
      const groupsId = `catalog-groups-${sectionIndex}`;
      content.innerHTML = `<div class="catalog-groups" id="${groupsId}" data-accordion-scope>${groupMarkup}</div>`;
    } else {
      content.innerHTML = groupMarkup;
    }
    content.dataset.rendered = "true";
    // Fill the category accordions now too, for the same reason as the sections
    // themselves: content that only appears on a click is content a crawler and a
    // no-JS reader never see.
    if (collapsibleGroups) content.querySelectorAll("details.catalog-group").forEach(renderGroup);
    if (PF.applyLanguageTo) PF.applyLanguageTo(content);
  }

  function buildSections() {
    if (directSections) {
      sectionsTarget.innerHTML = (data.sections || []).map((section, index) => `
        <section class="catalog-direct-section${section.highlight ? " catalog-section-highlight" : ""}" data-section-index="${index}">
          <h2 class="catalog-direct-title">${PF.escapeHtml(displaySectionTitle(section.title) || "Curated pathway")}</h2>
          ${section.note ? `<p class="catalog-section-note">${PF.escapeHtml(section.note)}</p>` : ""}
          <div class="section-content"></div>
        </section>`).join("");
      sectionsTarget.querySelectorAll(".catalog-direct-section").forEach((section) => {
        renderSection(section, Number(section.dataset.sectionIndex));
      });
      return;
    }
    sectionsTarget.innerHTML = (data.sections || []).map((section, index) => {
      const count = sectionEntries(index).length;
      return `<details class="catalog-section${section.highlight ? " catalog-section-highlight" : ""}" data-section-index="${index}">
        <summary><span>${PF.escapeHtml(displaySectionTitle(section.title) || "Curated pathway")}<small class="summary-meta">${count} curated ${count === 1 ? "resource" : "resources"}</small>${section.note ? `<small class="catalog-section-note">${PF.escapeHtml(section.note)}</small>` : ""}</span></summary>
        <div class="section-content"></div>
      </details>`;
    }).join("");

    // Render every section up front rather than on the first toggle. Content that
    // only appears after a click is invisible to search engines (they do not click),
    // to AI answer engines, to social previews and to anyone browsing without JS —
    // which previously meant the entire catalog. Cheap to do eagerly because
    // .resource-card sets content-visibility:auto, so offscreen cards still skip
    // layout and paint; the sections stay visually collapsed exactly as before.
    Array.from(sectionsTarget.querySelectorAll(".catalog-section"))
      .forEach((item) => renderSection(item, Number(item.dataset.sectionIndex)));
  }

  function buildFilters() {
    const types = [
      ["all", "All formats"],
      ["video", "Video"],
      ["website", "Websites"],
      ["document", "Documents"],
      ["app", "Apps"]
    ].filter(([type]) => type === "all" || entries.some((entry) => entry.types.has(type)));
    filterTarget.innerHTML = types.map(([type, label]) => `<button class="filter-chip${type === activeType ? " active" : ""}" type="button" data-type="${type}">${label}</button>`).join("");
    filterTarget.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => {
      activeType = button.dataset.type;
      filterTarget.querySelectorAll("[data-type]").forEach((chip) => chip.classList.toggle("active", chip === button));
      runFilter();
    }));
    if (PF.applyLanguageTo) PF.applyLanguageTo(filterTarget);
  }

  function filteredEntries() {
    const query = input.value.trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    return entries.filter((entry) => {
      if (activeType !== "all" && !entry.types.has(activeType)) return false;
      return !terms.length || terms.every((term) => entry.haystack.includes(term));
    });
  }

  function runFilter() {
    const query = input.value.trim();
    if (!query && activeType === "all") {
      searchTarget.hidden = true;
      sectionsTarget.hidden = false;
      countTarget.textContent = `${entries.length} resources`;
      return;
    }
    const matches = filteredEntries();
    sectionsTarget.hidden = true;
    searchTarget.hidden = false;
    countTarget.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
    if (!matches.length) {
      searchTarget.innerHTML = `<div class="empty-state"><strong>No close match</strong><p>Try fewer words or a different format. You can also suggest what is missing.</p><a class="button ghost small" href="${PF.escapeHtml(PF.path("submit"))}">Suggest a resource</a></div>`;
      if (PF.applyLanguageTo) PF.applyLanguageTo(searchTarget);
      return;
    }
    searchTarget.innerHTML = `<div class="resource-grid">${matches.map((entry) => renderCard(entry)).join("")}</div>`;
    if (PF.applyLanguageTo) PF.applyLanguageTo(searchTarget);
  }

  function revealHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const entry = entriesById.get(id);
    if (!entry) return;
    const details = sectionsTarget.querySelector(`[data-section-index="${entry.sectionIndex}"]`);
    if (!details) return;
    if (details instanceof HTMLDetailsElement) details.open = true;
    renderSection(details, entry.sectionIndex);
    requestAnimationFrame(() => {
      const group = sectionsTarget.querySelector(`details.catalog-group[data-section-index="${entry.sectionIndex}"][data-group-index="${entry.groupIndex}"]`);
      if (group) {
        renderGroup(group);
        group.open = true;
      }
      requestAnimationFrame(() => {
        const card = (group || details).querySelector(`#${CSS.escape(id)}`);
        if (!card) return;
        card.classList.add("deep-linked");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => card.classList.remove("deep-linked"), 3500);
      });
    });
  }

  buildSections();
  buildFilters();
  countTarget.textContent = `${entries.length} resources`;
  root.addEventListener("click", handleCatalogClick);
  root.addEventListener("toggle", (event) => {
    const details = event.target;
    if (details && details.matches && details.matches("details.catalog-group") && details.open) renderGroup(details);
  }, true);

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runFilter, 160);
  });
  window.addEventListener("hashchange", revealHash);
  document.addEventListener("pf:saved-changed", (event) => {
    root.querySelectorAll(`[data-save="${CSS.escape(event.detail.id)}"]`).forEach((button) => {
      const isSaved = PF.isSaved(event.detail.id);
      button.classList.toggle("is-saved", isSaved);
      button.textContent = isSaved ? "♥" : "♡";
      button.setAttribute("aria-pressed", String(isSaved));
    });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", revealHash, { once: true });
  else revealHash();
})();
