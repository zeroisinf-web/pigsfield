(function () {
  "use strict";

  // Panel order, ids and titles. The ids are deep-link targets, so they must not change.
  // A panel with a `page` has its own URL under /exams/ (written by tools/build-exams.mjs);
  // the rest stay on the hub.
  const PANELS = [
    { key: "roadmap", id: "exam-ncert-roadmap", page: "ncert-books-for-upsc-ras-ssc", title: "NCERT comparison roadmap", share: "Which NCERT books each exam needs, class by class." },
    { key: "tests", id: "exam-mock-tests", title: "Mock tests and previous papers", share: "Free mock tests and previous papers in one list." },
    { key: "common", id: "exam-common-subjects", page: "ssc", title: "Common competitive-exam subjects", share: "Free courses and books for every common exam subject." },
    { key: "ias", id: "exam-ias", page: "upsc", title: "UPSC/ IAS Complete Foundation Course", share: "The whole UPSC syllabus with free courses, marathons and books for each paper." },
    { key: "ras", id: "exam-ras", page: "ras", title: "RAS Complete Foundation Course", share: "The whole RAS syllabus with free courses, marathons and books for each paper." },
    { key: "jee", id: "exam-jee", title: "JEE Main", share: "Free JEE Main preparation: official syllabus, past papers, free mock tests and courses.", optional: true },
    { key: "neet", id: "exam-neet", title: "NEET-UG", share: "Free NEET-UG preparation: official syllabus, past papers, free mock tests and courses.", optional: true },
    { key: "cuet", id: "exam-cuet", title: "CUET-UG", share: "Free CUET-UG preparation: official syllabus, past papers and free mock tests.", optional: true },
    { key: "channels", id: "exam-channels", title: "Exam channels and official portals", share: "Official exam portals and the channels worth following." }
  ];

  /**
   * The exam page's markup, built from PF_DATA.exams without touching the DOM.
   *
   * tools/build-exams.mjs runs this at build time and writes every panel, closed, into
   * exams/index.html. Before that the page shipped an empty #exam-root and filled each
   * panel only when someone opened it, so search engines, AI answer engines and link
   * previews saw six headings and none of the UPSC, RAS, SSC or NCERT material under them.
   */
  function createExamMarkup(PF, data) {
    const escapeHtml = PF.escapeHtml;
    const list = (value) => Array.isArray(value) ? value : [];

    function cleanUrl(value) {
      if (typeof value !== "string") return "";
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") return "";
        Array.from(url.searchParams.keys()).forEach((key) => {
          if (/^utm_/i.test(key)) url.searchParams.delete(key);
        });
        return url.href;
      } catch (_) {
        return "";
      }
    }

    function sourceName(value) {
      try {
        const host = new URL(value).hostname.replace(/^www\./i, "");
        return /(?:youtube|youtu\.be)/i.test(host) ? "YouTube" : /play\.google/i.test(host) ? "Google Play" : /apps\.apple/i.test(host) ? "App Store" : host;
      } catch (_) {
        return "";
      }
    }

    // Classification, brand names and marks come from the pf:source-marks block in js/site.js.
    const sourceType = PF.classifySource;
    const sourceBrand = PF.sourceBrand;
    const sourceMark = PF.sourceMark;

    function isYouTubePlayable(value) {
      try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const path = url.pathname.replace(/\/+$/, "") || "/";
        if (host === "youtu.be") return path !== "/";
        if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) return false;
        if (path === "/watch") return url.searchParams.has("v") || url.searchParams.has("list");
        if (path === "/playlist") return url.searchParams.has("list");
        return /^\/(?:embed|live|shorts)\/[^/]+/.test(path);
      } catch (_) {
        return false;
      }
    }

    // `shown` replaces the visible text only; the accessible name and player title keep
    // the full label, so a link under a "Marathon" column can read just "YouTube".
    function linkButtonFromClean(url, label, shown) {
      const playable = isYouTubePlayable(url);
      const title = label || sourceName(url);
      const action = playable ? "Play" : "Open";
      const type = sourceType(url);
      const brand = sourceBrand(url, type);
      const safeTitle = title || "Exam resource";
      const playback = playable ? ` data-youtube-play data-title="${escapeHtml(safeTitle)}"` : "";
      const sourceLink = `<a class="link-button source-${escapeHtml(type)} source-brand-${escapeHtml(brand)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${playback} aria-label="${escapeHtml(`${action} ${safeTitle}`)}">${sourceMark(url, type)}<span class="source-label">${escapeHtml(shown || safeTitle)}</span></a>`;
      return `<span class="source-link-pair">${sourceLink}</span>`;
    }

    function linkRow(urls, label) {
      const links = list(urls).map((url) => {
        const clean = cleanUrl(url);
        const source = clean ? sourceName(clean) : "";
        return clean ? linkButtonFromClean(clean, `${label}${source ? ` · ${source}` : ""}`, source) : "";
      }).filter(Boolean);
      return links.length ? `<div class="exam-link-row">${links.join("")}</div>` : "";
    }

    /** Labelled official links — past papers, answer keys, free practice — in one row. */
    function officialRow(items) {
      const links = list(items).map((item) => {
        const clean = cleanUrl(item && item.url);
        return clean ? linkButtonFromClean(clean, item.label) : "";
      }).filter(Boolean);
      return links.length ? `<div class="exam-link-row">${links.join("")}</div>` : "";
    }

    function resourceGroups(item) {
      const groups = [
        ["course", "Course"],
        ["marathon", "Marathon"],
        ["books", "Book"]
      ];
      const filled = groups.map(([key, label]) => [label, linkRow(item && item[key], label)]).filter(([, links]) => links);
      if (!filled.length) return "";
      return `<div class="exam-resource-groups lanes-${filled.length}">${filled.map(([label, links]) => `<div class="exam-resource-group"><span class="source-lane-label">${label}</span>${links}</div>`).join("")}</div>`;
    }

    function panelBody(description, body) {
      return `<p>${escapeHtml(description)}</p>${body}`;
    }

    function panelShell(definition, body, open) {
      return `<details class="exam-panel" id="${escapeHtml(definition.id)}" data-exam-panel="${escapeHtml(definition.key)}"${open ? " open" : ""}><summary><h2 class="exam-panel-heading">${escapeHtml(definition.title)}</h2></summary><button class="card-tool card-share exam-share" type="button" data-share="${escapeHtml(definition.id)}" data-share-title="${escapeHtml(definition.title)}" data-share-text="${escapeHtml(definition.share)}" aria-label="Send ${escapeHtml(definition.title)} to your study group"></button><div class="exam-panel-body">${typeof body === "string" ? body : ""}</div></details>`;
    }

    function renderRoadmap() {
      const roadmap = data.roadmap || {};
      const note = roadmap.note || {};
      const noteLinks = linkRow(note.urls, "Textbook source");
      const noteMarkup = note.text || noteLinks
        ? `<div class="syllabus-item">${note.text ? `<p>${escapeHtml(note.text)}</p>` : ""}${noteLinks}</div>`
        : "";
      const headers = list(roadmap.headers);
      const rows = list(roadmap.rows).map((row) => {
        const values = [row.subject, row.upsc, row.ras, row.ssc, row.books];
        const id = `ncert-${PF.slug(row.subject)}`;
        return `<tr id="${escapeHtml(id)}">${values.map((value, index) => `<td>${index === 0 ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(value)}</td>`).join("")}</tr>`;
      }).join("");
      const table = headers.length && rows
        ? `<div class="table-scroll"><table class="data-table"><caption class="sr-only">${escapeHtml("NCERT requirements for UPSC, RAS and SSC")}</caption><thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p>${escapeHtml("The NCERT comparison roadmap is being updated.")}</p>`;
      return panelBody(
        "Compare the class levels and core reading needed for UPSC, RAS and SSC preparation.",
        `${noteMarkup}${table}`
      );
    }

    function renderMockTests() {
      const links = linkRow(data.tests && data.tests.urls, "Mock test");
      return panelBody(
        "Practise with free mock tests, official previous papers and current-affairs revision sources.",
        `${officialRow(data.tests && data.tests.official)}${links || `<p>${escapeHtml("Mock-test links are being updated.")}</p>`}`
      );
    }

    function groupedSubjects() {
      const groups = new Map();
      list(data.common && data.common.subjects).forEach((subject) => {
        const name = String(subject && subject.subject || "Other subjects");
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(subject || {});
      });
      return Array.from(groups, ([subject, variants]) => ({ subject, variants }));
    }

    function renderSubjectVariant(variant, showExam) {
      const exam = variant.exam ? `<p><strong>${escapeHtml("For:")}</strong> ${escapeHtml(variant.exam)}</p>` : "";
      const extraMarkup = list(variant.extras).map((extra, index) => {
        const url = cleanUrl(extra);
        const source = url ? sourceName(url) : "";
        return url
          ? linkButtonFromClean(url, `Extra${source ? ` · ${source}` : ""}`)
          : `<p>${escapeHtml(extra)}</p>`;
      }).join("");
      return `<div>${showExam ? exam : ""}${resourceGroups(variant)}${extraMarkup ? `<div class="exam-link-row">${extraMarkup}</div>` : ""}</div>`;
    }

    function renderCommonSubjects() {
      const cards = groupedSubjects().map((group) => {
        const id = `subject-${PF.slug(group.subject)}`;
        return `<article class="exam-subject" id="${escapeHtml(id)}"><h4>${escapeHtml(group.subject)}</h4>${group.variants.map((variant) => renderSubjectVariant(variant, Boolean(variant.exam))).join("")}</article>`;
      }).join("");
      const body = cards
        ? `<div class="exam-subject-grid">${cards}</div>`
        : `<p>${escapeHtml("Common-subject resources are being updated.")}</p>`;
      return panelBody(
        "Use complete courses for learning, marathons for revision and books for focused practice.",
        body
      );
    }

    function renderSyllabusNode(item) {
      const source = cleanUrl(item && item.src);
      const name = source ? sourceName(source) : "";
      const sourceLink = source ? `<div class="exam-link-row">${linkButtonFromClean(source, `Official syllabus${name ? ` · ${name}` : ""}`)}</div>` : "";
      const children = list(item && item.subs);
      const childMarkup = children.length ? `<div class="syllabus-list">${children.map(renderSyllabusNode).join("")}</div>` : "";
      return `<article class="syllabus-item"><h4>${escapeHtml(item && item.name || "Syllabus topic")}</h4>${item && item.marks ? `<p><strong>${escapeHtml("Marks:")}</strong> ${escapeHtml(item.marks)}</p>` : ""}${item && item.topics ? `<p>${escapeHtml(item.topics)}</p>` : ""}${sourceLink}${resourceGroups(item || {})}${childMarkup}</article>`;
    }

    function renderEssentials(track, examName) {
      const essentials = list(track && track.essentials);
      if (!essentials.length) return "";
      const cards = essentials.map((essential) => {
        const source = cleanUrl(essential.srcUrl);
        const name = source ? sourceName(source) : "";
        const sourceLink = source ? `<div class="exam-link-row">${linkButtonFromClean(source, `Original source${name ? ` · ${name}` : ""}`)}</div>` : "";
        return `<article class="syllabus-item"><h4>${escapeHtml(essential.topic || `${examName} essential`)}</h4>${essential.srcText ? `<p>${escapeHtml(essential.srcText)}</p>` : ""}${sourceLink}</article>`;
      }).join("");
      return `<h3>${escapeHtml(track.essTitle || `${examName} essentials`)}</h3><div class="syllabus-list">${cards}</div>`;
    }

    function renderExamTrack(key, title, description) {
      const track = data[key] || {};
      const sections = list(track.sections).map((section) => {
        const items = list(section.items).map(renderSyllabusNode).join("");
        return `<section class="syllabus-item"><h3>${escapeHtml(section.title || `${title} syllabus section`)}</h3>${section.sub ? `<p>${escapeHtml(section.sub)}</p>` : ""}${items ? `<div class="syllabus-list">${items}</div>` : ""}</section>`;
      }).join("");
      const syllabus = sections ? `<div class="syllabus-list">${sections}</div>` : `<p>${escapeHtml("Syllabus details are being updated.")}</p>`;
      return panelBody(description, `${officialRow(track.official)}${syllabus}${renderEssentials(track, title)}`);
    }

    function renderChannels() {
      const cards = list(data.channels).map((channel) => {
        const links = linkRow(channel.urls, "Channel resource");
        return `<article class="exam-subject"><h4>${escapeHtml(channel.focus || "Exam channel")}</h4>${channel.exams ? `<p>${escapeHtml(channel.exams)}</p>` : ""}${links}</article>`;
      }).join("");
      return panelBody(
        "Follow focused learning channels and verify notices on official exam portals.",
        cards ? `<div class="exam-subject-grid">${cards}</div>` : `<p>${escapeHtml("Channel links are being updated.")}</p>`
      );
    }

    /** JEE, NEET and CUET: official links first, then one free course per subject. */
    function renderQuickTrack(key) {
      const track = data[key] || {};
      const subjects = list(track.subjects).map((subject) => {
        const clean = cleanUrl(subject && subject.url);
        return clean ? linkButtonFromClean(clean, `${subject.name} course`, subject.name) : "";
      }).filter(Boolean);
      return panelBody(track.description || "", `${officialRow(track.links)}${subjects.length ? `<h3>${escapeHtml("Free courses")}</h3><div class="exam-link-row">${subjects.join("")}</div>` : ""}`);
    }

    const renderers = {
      roadmap: renderRoadmap,
      tests: renderMockTests,
      common: renderCommonSubjects,
      ias: () => renderExamTrack("ias", "UPSC/ IAS Complete Foundation Course", "Navigate Prelims, Mains, CSAT and essential primary sources in one place."),
      ras: () => renderExamTrack("ras", "RAS Complete Foundation Course", "Navigate Rajasthan Prelims, Mains and high-value primary sources in one place."),
      jee: () => renderQuickTrack("jee"),
      neet: () => renderQuickTrack("neet"),
      cuet: () => renderQuickTrack("cuet"),
      channels: renderChannels
    };
    const panelDefinitions = PANELS.filter((panel) => !panel.optional || data[panel.key]).map((panel) => Object.assign({}, panel, { render: renderers[panel.key] }));

    return {
      panelDefinitions,
      panelShell,
      // The panels with their bodies: closed on the hub, the one panel open on its own page.
      prerendered: (keys, open) => `<div class="exam-stack" id="exam-sections" data-accordion-scope data-prerendered>${panelDefinitions.filter((definition) => !keys || keys.includes(definition.key)).map((definition) => panelShell(definition, definition.render(), open)).join("")}</div>`
    };
  }

  window.PF = window.PF || {};
  window.PF.examMarkup = createExamMarkup;
  window.PF.examPanels = PANELS;

  /* A link shared before UPSC, RAS, the NCERT roadmap and the SSC subjects moved to their own
     pages still names the old anchor on /exams/. Send it to the page that holds it now. */
  function relocatePanelHash() {
    const root = document.getElementById("exam-root");
    if (!root || root.dataset.examPage || !location.hash) return false;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return false; }
    const key = id.startsWith("ncert-") ? "roadmap" : id.startsWith("subject-") ? "common" : (PANELS.find((panel) => panel.id === id) || {}).key;
    const panel = PANELS.find((candidate) => candidate.key === key && candidate.page);
    if (!panel) return false;
    location.replace(`${panel.page}/${location.hash}`);
    return true;
  }

  function initExamPage() {
    if (relocatePanelHash()) return;
    const PF = window.PF;
    const data = window.PF_DATA && window.PF_DATA.exams;
    const root = document.getElementById("exam-root");
    const prerendered = root && root.querySelector(".exam-stack[data-prerendered]");
    if (!PF || !root || !PF.YouTube || (!prerendered && !data)) return;

    // The shipped page already holds every panel body. Only an older or hand-edited page
    // without it falls back to building panels here, one at a time as they are opened.
    const { panelDefinitions, panelShell } = prerendered ? { panelDefinitions: PANELS, panelShell: null } : createExamMarkup(PF, data);
    const panelsByKey = new Map(panelDefinitions.map((definition) => [definition.key, definition]));
    const panelKeyById = new Map(PANELS.map((definition) => [definition.id, definition.key]));

    function renderPanel(details) {
      if (!details || details.dataset.rendered === "true") return;
      const definition = panelsByKey.get(details.dataset.examPanel);
      const body = details.querySelector(".exam-panel-body");
      if (!definition || !body) return;
      body.innerHTML = definition.render();
      details.dataset.rendered = "true";
      if (PF.applyLanguageTo) PF.applyLanguageTo(body);
    }

    function panelKeyForHash(id) {
      if (panelKeyById.has(id)) return panelKeyById.get(id);
      if (id.startsWith("ncert-")) return "roadmap";
      if (id.startsWith("subject-")) return "common";
      return "";
    }

    if (prerendered) root.querySelectorAll("details.exam-panel").forEach((details) => { details.dataset.rendered = "true"; });
    else root.innerHTML = `<div class="exam-stack" id="exam-sections" data-accordion-scope>${panelDefinitions.map(panelShell).join("")}</div>`;
    if (PF.applyLanguageTo) PF.applyLanguageTo(root);

    root.addEventListener("click", (event) => {
      const summary = event.target.closest && event.target.closest("summary");
      const details = summary && summary.parentElement;
      if (details && details.matches("details.exam-panel") && root.contains(details)) renderPanel(details);

      const anchor = event.target.closest("a[data-youtube-play]");
      if (!anchor || !root.contains(anchor)) return;
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!PF.YouTube || typeof PF.YouTube.play !== "function") return;
      event.preventDefault();
      PF.YouTube.play(anchor.href, anchor.dataset.title || "Exam resource");
    });
    root.addEventListener("toggle", (event) => {
      const details = event.target;
      if (details && details.matches && details.matches("details.exam-panel") && details.open) renderPanel(details);
    }, true);

    function revealHashTarget() {
      if (!location.hash) return;
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
      const panelKey = panelKeyForHash(id);
      const panel = panelKey ? root.querySelector(`[data-exam-panel="${panelKey}"]`) : null;
      if (panel) renderPanel(panel);
      const target = document.getElementById(id);
      if (!target || !root.contains(target)) return;
      const parentPanel = target.closest("details.exam-panel");
      if (parentPanel) parentPanel.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
    }

    window.addEventListener("hashchange", () => { if (!relocatePanelHash()) revealHashTarget(); });
    revealHashTarget();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initExamPage, { once: true });
  else initExamPage();
})();
