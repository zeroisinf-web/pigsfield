(function () {
  "use strict";

  function initExamPage() {
    const PF = window.PF;
    const data = window.PF_DATA && window.PF_DATA.exams;
    const root = document.getElementById("exam-root");
    if (!PF || !data || !root || !PF.YouTube) return;

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

    function linkButtonFromClean(url, label) {
      const playable = isYouTubePlayable(url);
      const title = label || sourceName(url);
      const action = playable ? "Play" : "Open";
      const type = sourceType(url);
      const brand = sourceBrand(url, type);
      const safeTitle = title || "Exam resource";
      const playback = playable ? ` data-youtube-play data-title="${escapeHtml(safeTitle)}"` : "";
      const sourceLink = `<a class="link-button source-${escapeHtml(type)} source-brand-${escapeHtml(brand)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${playback} aria-label="${escapeHtml(`${action} ${safeTitle}`)}">${sourceMark(url, type)}<span class="source-label">${escapeHtml(safeTitle)}</span></a>`;
      return `<span class="source-link-pair">${sourceLink}</span>`;
    }

    function linkRow(urls, label) {
      const links = list(urls).map((url) => {
        const clean = cleanUrl(url);
        const source = clean ? sourceName(clean) : "";
        return clean ? linkButtonFromClean(clean, `${label}${source ? ` · ${source}` : ""}`) : "";
      }).filter(Boolean);
      return links.length ? `<div class="exam-link-row">${links.join("")}</div>` : "";
    }

    function resourceGroups(item) {
      const groups = [
        ["course", "Course"],
        ["marathon", "Marathon"],
        ["books", "Book"]
      ];
      if (!groups.some(([key]) => list(item && item[key]).length)) return "";
      return `<div class="exam-resource-groups">${groups.map(([key, label]) => {
        const links = linkRow(item && item[key], label);
        return `<div class="exam-resource-group"><span class="source-lane-label">${label}</span>${links || `<span class="source-empty">Not listed</span>`}</div>`;
      }).join("")}</div>`;
    }

    function panelBody(description, body) {
      return `<p>${escapeHtml(description)}</p>${body}`;
    }

    function panelShell(definition) {
      return `<details class="exam-panel" id="${escapeHtml(definition.id)}" data-exam-panel="${escapeHtml(definition.key)}"><summary><span>${escapeHtml(definition.title)}</span></summary><div class="exam-panel-body"></div></details>`;
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
        links || `<p>${escapeHtml("Mock-test links are being updated.")}</p>`
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
      return panelBody(description, `${syllabus}${renderEssentials(track, title)}`);
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

    const panelDefinitions = [
      { key: "roadmap", id: "exam-ncert-roadmap", title: "NCERT comparison roadmap", render: renderRoadmap },
      { key: "tests", id: "exam-mock-tests", title: "Mock tests and previous papers", render: renderMockTests },
      { key: "common", id: "exam-common-subjects", title: "Common competitive-exam subjects", render: renderCommonSubjects },
      { key: "ias", id: "exam-ias", title: "UPSC/ IAS Complete Foundation Course", render: () => renderExamTrack("ias", "UPSC/ IAS Complete Foundation Course", "Navigate Prelims, Mains, CSAT and essential primary sources in one place.") },
      { key: "ras", id: "exam-ras", title: "RAS Complete Foundation Course", render: () => renderExamTrack("ras", "RAS Complete Foundation Course", "Navigate Rajasthan Prelims, Mains and high-value primary sources in one place.") },
      { key: "channels", id: "exam-channels", title: "Exam channels and official portals", render: renderChannels }
    ];
    const panelsByKey = new Map(panelDefinitions.map((definition) => [definition.key, definition]));
    const panelKeyById = new Map(panelDefinitions.map((definition) => [definition.id, definition.key]));

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

    root.innerHTML = `<div class="exam-stack" id="exam-sections" data-accordion-scope>${panelDefinitions.map(panelShell).join("")}</div>`;
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

    window.addEventListener("hashchange", revealHashTarget);
    revealHashTarget();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initExamPage, { once: true });
  else initExamPage();
})();
