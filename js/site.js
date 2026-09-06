(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const root = document.documentElement;
  const base = root.dataset.base || "./";
  const page = document.body.dataset.page || "home";
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const pageMap = {
    home: "",
    learn: "learn/",
    skills: "skills/",
    tools: "tools/",
    exams: "exams/",
    watch: "watch/",
    rights: "rights/",
    ai: "ai/",
    about: "about/",
    editorial: "editorial/",
    accessibility: "accessibility/",
    privacy: "privacy/",
    submit: "submit/"
  };

  const dataScripts = {
    school: "js/data/school.js",
    teach: "js/data/teach.js",
    tools: "js/data/tools.js",
    exams: "js/data/exams.js",
    pigbang: "js/data/pigbang.js",
    govt: "js/data/govt.js"
  };

  const dataPages = {
    school: "learn",
    teach: "skills",
    tools: "tools",
    exams: "exams",
    pigbang: "watch",
    govt: "rights"
  };

  // Where a catalogue entry actually lives. tools/build-topics.mjs splits each destination
  // into its own pages — by section for /learn/, by group everywhere else — so a search
  // result points at the page holding the resource instead of at the hub. A group with too
  // few resources for a page of its own has no slug here and falls back to the hub, which
  // still lists it. tools/validate-site.mjs fails the build if this drifts from DESTINATIONS.
  const topicRoutes = {
    school: { by: "section", slugs: ["nursery-to-class-5", "class-6-to-8", "class-9-to-12", "undergraduate", "postgraduate", "phd-and-research", "teacher-training"] },
    teach: { by: "group", slugs: ["government-skill-portals", "corporate-training", "coding-platforms"] },
    tools: { by: "group", slugs: ["ai-tools", "privacy-and-browsers", "files-and-remote-access", "creative-tools", "research-tools"] },
    govt: { by: "group", slugs: ["information-and-records", "anti-corruption", "courts-and-legal-remedies", "commissions-and-regulators", "grievance-portals", "social-audit", "parliament-and-representatives", "media-and-fraud-reporting", "criminal-and-financial-law", "digital-governance"] }
  };

  const dataLabels = {
    school: "Nursery to PhD",
    teach: "Vocational & Business",
    tools: "Digital Tools",
    exams: "Competitive Exams",
    pigbang: "PigBang",
    govt: "Make Govt Accountable"
  };

  let language = "en";
  const TRANSLATOR_OPTIONS = { sourceLanguage: "en", targetLanguage: "hi" };
  const LANGUAGE_STORAGE_KEY = "pf-language";
  const TRANSLATION_ENDPOINT = "/api/translate";
  const SERVER_TRANSLATION_MAX_ITEMS = 48;
  const SERVER_TRANSLATION_MAX_CHARACTERS = 10000;
  const SERVER_TRANSLATION_TIMEOUT_MS = 22000;
  const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"];
  const TRANSLATION_SKIP_SELECTOR = [
    "script", "style", "noscript", "template", "pre", "code", "kbd", "samp",
    "[translate='no']", "[contenteditable]:not([contenteditable='false'])",
    "[aria-hidden='true']", ".brand-lockup", "#site-toast",
    "#translation-help-dialog"
  ].join(",");

  const originalText = new Map();
  const originalAttributes = new Map();
  const translationCache = new Map();
  const expectedTextMutations = new WeakMap();
  const expectedAttributeMutations = new WeakMap();
  const pendingTranslationRoots = new Set();
  let translatorInstance = null;
  let translationProvider = "";
  let translationObserver = null;
  let translationQueue = Promise.resolve();
  let translationGeneration = 0;
  let queuedTranslationJobs = 0;
  let preparingTranslation = false;
  let translationBusy = false;
  let mutationFlushScheduled = false;
  let languageStatus = "";
  let compactLanguageStatus = "";

  PF.t = function (value) { return value; };
  PF.language = function () { return language; };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  PF.escapeHtml = escapeHtml;

  PF.slug = function (value) {
    const slug = String(value || "resource")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 88);
    return slug || "resource";
  };

  PF.path = function (key) {
    return base + (pageMap[key] || "");
  };

  /* pf:source-marks:start
   * One source-button vocabulary for the whole site. It used to live three times over —
   * js/catalog.js, js/watch.js and js/exams-page.js each carried their own copy of the
   * same marks, the same host tests and the same brand names, and they had already drifted.
   * tools/build-topics.mjs evaluates this exact slice when it generates the static topic
   * pages, so a generated page and a runtime page cannot disagree about what a YouTube
   * link looks like.
   */
  const SOURCE_MARK_PARTS = {
    youtube: '<span class="source-mark-body"><span class="source-mark-play"></span></span>',
    "google-play": '<span class="source-mark-play-triangle source-mark-play-triangle-a"></span><span class="source-mark-play-triangle source-mark-play-triangle-b"></span><span class="source-mark-play-triangle source-mark-play-triangle-c"></span>',
    "apple-store": '<span class="source-mark-apple-fruit"></span><span class="source-mark-apple-leaf"></span>',
    app: '<span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span><span class="source-mark-app-tile"></span>',
    document: '<span class="source-mark-page"><span class="source-mark-page-fold"></span><span class="source-mark-page-line"></span><span class="source-mark-page-line"></span></span>',
    website: '<span class="source-mark-globe"><span class="source-mark-globe-axis"></span><span class="source-mark-globe-ring"></span></span>'
  };
  const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

  // A youtube.com/results link is a search, not a video: 96 catalogue links point there,
  // and treating them as video gives a red play affordance to a page that plays nothing.
  function isYouTubeSearch(url) {
    try {
      const parsed = new URL(url);
      return /(?:^|\.)youtube\.com$/i.test(parsed.hostname) && parsed.pathname === "/results";
    } catch (_) {
      return false;
    }
  }

  function classifySource(url) {
    const value = String(url || "");
    if (isYouTubeSearch(value)) return "website";
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" && YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return "video";
    } catch (_) {}
    if (/play\.google|apps\.apple|microsoft\.com\/store|apps\.microsoft/i.test(value)) return "app";
    if (/\.pdf(?:$|\?)|drive\.google\.com|docs\.google\.com/i.test(value)) return "document";
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
    return '<span class="source-icon source-mark source-mark-' + brand + '" aria-hidden="true">' + (SOURCE_MARK_PARTS[brand] || SOURCE_MARK_PARTS.website) + "</span>";
  }

  PF.isYouTubeSearch = isYouTubeSearch;
  PF.classifySource = classifySource;
  PF.sourceBrand = sourceBrand;
  PF.sourceMark = sourceMark;
  /* pf:source-marks:end */

  PF.safeUrl = function (value, protocols = ["https:", "http:"]) {
    try {
      const parsed = new URL(value, location.href);
      return protocols.includes(parsed.protocol) ? parsed.href : "";
    } catch (_) {
      return "";
    }
  };

  const RESOURCE_ORGANIZATIONS = [
    { key: "ncert", symbol: "📚", match: /\bncert\b|epathshala|ncert\.nic\.in|epathshala\.nic\.in/ },
    { key: "swayam-nptel", symbol: "🎓", match: /\bswayam\b|\bnptel\b|swayam\.gov\.in|nptel\.ac\.in/ },
    { key: "diksha", symbol: "🏫", match: /\bdiksha\b|diksha\.gov\.in/ },
    { key: "ignou", symbol: "🏫", match: /\bignou\b|egyankosh|ignou\.ac\.in/ },
    { key: "pratham", symbol: "📖", match: /\bpratham\b|storyweaver|pratham(?:books|openschool|digital)?\.org|storyweaver\.org\.in/ },
    { key: "ndli", symbol: "📚", match: /national digital library|\bndli\b|ndl\.gov\.in/ },
    { key: "scratch", symbol: "🐱", match: /\bscratch(?:jr)?\b|scratch\.mit\.edu|scratchjr\.org/ },
    { key: "khan-academy", symbol: "🧮", match: /khan academy|khanacademy\.org/ },
    { key: "duolingo", symbol: "🦉", match: /\bduolingo\b|duolingo\.com/ },
    { key: "ted", symbol: "🎤", match: /\bted(?:-ed)?\b|ted\.com|ed\.ted\.com/ },
    { key: "mit", symbol: "🎓", match: /mit opencourseware|\bmit ocw\b|ocw\.mit\.edu/ },
    { key: "harvard", symbol: "🎓", match: /\bharvard\b|harvard\.edu/ },
    { key: "coursera", symbol: "🎓", match: /\bcoursera\b|coursera\.org/ },
    { key: "edx", symbol: "🎓", match: /\bedx\b|edx\.org/ },
    { key: "sampark-foundation", symbol: "🤝", match: /sampark foundation|samparkfoundation\.org/ },
    { key: "magnet-brains", symbol: "🧲", match: /magnet brains|magnetbrains\.com/ },
    { key: "mission-gyan", symbol: "💡", match: /mission gyan|missiongyan\.com/ },
    { key: "arvind-gupta-toys", symbol: "🧸", match: /arvind gupta toys|arvindguptatoys\.com/ },
    { key: "tiwari-academy", symbol: "📐", match: /tiwari academy|tiwariacademy\.com/ },
    { key: "bodhaguru", symbol: "🧠", match: /\bbodhaguru\b/ },
    { key: "aumsum", symbol: "🧪", match: /aumsum/ },
    { key: "veritasium", symbol: "🔬", match: /\bveritasium\b/ },
    { key: "pbs", symbol: "📺", match: /\bpbs(?: kids)?\b|pbs\.org|pbskids\.org/ },
    { key: "national-geographic", symbol: "🌍", match: /national geographic|natgeo|nationalgeographic\.com/ },
    { key: "bbc", symbol: "📡", match: /\bbbc\b|bbc\.(?:com|co\.uk)/ },
    { key: "internet-archive", symbol: "🏛️", match: /internet archive|archive\.org/ },
    { key: "netflix", symbol: "🍿", match: /\bnetflix\b|netflix\.com/ },
    { key: "prime-video", symbol: "🎞️", match: /prime video|primevideo\.com/ },
    { key: "hotstar", symbol: "⭐", match: /\bhotstar\b|hotstar\.com/ },
    { key: "sony-liv", symbol: "🎭", match: /sony\s*liv|sonyliv\.com/ },
    { key: "zee5", symbol: "🎬", match: /\bzee5\b|zee5\.com/ },
    { key: "steam", symbol: "🎮", match: /\bsteam\b|store\.steampowered\.com/ },
    { key: "vimeo", symbol: "🎥", match: /\bvimeo\b|vimeo\.com/ },
    { key: "dailymotion", symbol: "🎥", match: /\bdailymotion\b|dailymotion\.com/ },
    { key: "canva", symbol: "🎨", match: /\bcanva\b|canva\.com/ },
    { key: "github", symbol: "🐙", match: /\bgithub\b|github\.com/ },
    { key: "hugging-face", symbol: "🤗", match: /hugging face|huggingface\.co/ },
    { key: "openai", symbol: "🤖", match: /\bopenai\b|\bchatgpt\b|openai\.com/ },
    { key: "anthropic", symbol: "🤖", match: /\banthropic\b|\bclaude\b|claude\.ai|anthropic\.com/ },
    { key: "zerodha", symbol: "📈", match: /\bzerodha\b|zerodha\.com/ },
    { key: "investopedia", symbol: "💹", match: /\binvestopedia\b|investopedia\.com/ },
    { key: "pubmed", symbol: "🧬", match: /\bpubmed\b|pubmed\.ncbi\.nlm\.nih\.gov/ },
    { key: "arxiv", symbol: "📄", match: /\barxiv\b|arxiv\.org/ },
    { key: "kaggle", symbol: "📊", match: /\bkaggle\b|kaggle\.com/ },
    { key: "election-commission", symbol: "🗳️", match: /election commission|\beci\b|eci\.gov\.in|cvigil\.eci\.gov\.in|nvsp\.in/ },
    { key: "indian-courts", symbol: "⚖️", match: /supreme court|high court|e-?courts?|sci\.gov\.in|hcraj\.nic\.in|ecourts\.gov\.in/ }
  ];

  const RESOURCE_TOPIC_SYMBOLS = [
    [/legal|law|rights?|rti|grievance|consumer|citizen|justice|court|लोकपाल|अधिकार|शिकायत/, "⚖️"],
    [/government|govt|scheme|portal|certificate|aadhaar|passport|voter|ration|सरकार|योजना|प्रमाण/, "🏛️"],
    [/exam|test|quiz|competitive|upsc|ias|ssc|railway|prelims|mains|syllabus|परीक्षा/, "🎯"],
    [/math|mathematics|algebra|geometry|calculus|arithmetic|statistics|गणित/, "➗"],
    [/physics|chemistry|biology|science|laboratory|experiment|विज्ञान/, "🔬"],
    [/health|medical|medicine|doctor|hospital|nursing|wellness|mental|स्वास्थ्य/, "🩺"],
    [/artificial intelligence|machine learning|\bai\b|chatbot/, "🤖"],
    [/code|coding|developer|programming|python|javascript|computer|software|तकनीक/, "💻"],
    [/book|textbook|ncert|library|reading|literature|pdf|पुस्तक/, "📚"],
    [/teacher|teaching|pedagogy|classroom|educator|school|college|university|शिक्षक|विद्यालय/, "🏫"],
    [/career|job|employment|internship|resume|interview|skill|काम|नौकरी/, "💼"],
    [/language|english|hindi|grammar|writing|speaking|communication|भाषा|हिंदी/, "🔤"],
    [/art|design|drawing|painting|photography|creative|craft|कला/, "🎨"],
    [/music|song|audio|गीत/, "🎵"],
    [/movie|film|video|channel|playlist|media|वीडियो/, "🎬"],
    [/finance|money|bank|investment|tax|insurance|economics|वित्त|पैसा/, "📈"],
    [/history|geography|culture|heritage|civilization|इतिहास|भूगोल/, "🌍"],
    [/environment|climate|nature|agriculture|farming|water|forest|पर्यावरण|कृषि/, "🌱"],
    [/sport|fitness|cricket|football|yoga|खेल|योग/, "⚽"],
    [/research|journal|citation|paper|scholar|phd|survey|अनुसंधान/, "🔎"],
    [/safety|security|cyber|emergency|disaster|सुरक्षा|आपदा/, "🛡️"],
    [/business|startup|entrepreneur|marketing|commerce|व्यवसाय/, "🚀"],
    [/transport|travel|train|road|aviation|यात्रा|परिवहन/, "🚆"],
    [/child|children|kids|early learning|बाल|बच्चे/, "🧸"],
    [/women|girl|gender|equality|महिला|लड़की/, "🤝"],
    [/accessib|disability|disabled|दिव्यांग/, "♿"],
    [/architecture|engineering|construction|civil|mechanical|इंजीनियर/, "⚙️"],
    [/weather|rain|storm|earthquake|flood|मौसम/, "🌦️"],
    [/food|nutrition|cook|recipe|खाना|पोषण/, "🍎"]
  ];

  const RESOURCE_TYPE_SYMBOLS = {
    rights: "⚖️",
    ai: "🤖",
    code: "💻",
    book: "📚",
    teaching: "🏫",
    research: "🔬",
    video: "🎬",
    app: "📱",
    document: "📄",
    group: "🧭",
    web: "🌐",
    website: "🌐"
  };

  function resourceHosts(values) {
    return (Array.isArray(values) ? values : [values]).map((value) => {
      const candidate = value && typeof value === "object" ? value.url : value;
      try { return new URL(candidate, location.href).hostname.toLowerCase().replace(/^www\./, ""); } catch (_) { return ""; }
    }).filter(Boolean);
  }

  function registrableResourceHost(host) {
    const parts = String(host || "").split(".").filter(Boolean);
    if (parts.length < 3) return parts.join(".");
    const indianInstitution = /\.(?:ac|co|edu|gov|nic|org)\.in$/.test(host);
    return parts.slice(indianInstitution ? -3 : -2).join(".");
  }

  function isGenericResourceHost(host) {
    return /^(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|play\.google\.com|apps\.apple\.com|drive\.google\.com|docs\.google\.com)$/.test(String(host || ""));
  }

  function normalizeResourceTitle(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function resolveResourceIdentity(options = {}) {
    const title = String(options.title || options.name || "");
    const type = String(options.type || "website").toLowerCase();
    const hosts = resourceHosts(options.urls || options.url || []);
    const organizationHosts = [...new Set(hosts.filter((host) => !isGenericResourceHost(host)))].sort();
    const organizationHost = organizationHosts[0] || "";
    const organizationSearchable = `${title} ${organizationHosts.join(" ")}`.toLowerCase();
    const organization = RESOURCE_ORGANIZATIONS.find((candidate) => candidate.match.test(organizationSearchable));
    const canonicalTitle = normalizeResourceTitle(title).replace(/\s+/g, "-");
    const organizationKey = organization
      ? organization.key
      : (organizationHost ? registrableResourceHost(organizationHost) : canonicalTitle) || type;
    // Prose cannot change resource identity.
    const topic = RESOURCE_TOPIC_SYMBOLS.find(([pattern]) => pattern.test(title.toLowerCase()));
    const publicInstitution = hosts.some((host) => /\.(?:gov|nic)\.in$/.test(host));
    const symbol = organization && organization.symbol
      ? organization.symbol
      : topic ? topic[1]
        : publicInstitution ? "🏛️"
          : (RESOURCE_TYPE_SYMBOLS[type] || RESOURCE_TYPE_SYMBOLS.website);
    return { key: organizationKey, organization: organizationKey, symbol, type };
  }

  PF.resourceIdentityFor = function (options) {
    return resolveResourceIdentity(options);
  };

  PF.resourceOrganizationKeyFor = function (options) {
    return resolveResourceIdentity(options).key;
  };

  PF.resourceSymbolFor = function (options) {
    return resolveResourceIdentity(options).symbol;
  };

  // Kept for older page modules. Legacy seeds are ignored so card indexes can never affect identity.
  PF.resourceEmoji = function (text, _seed, type, urls) {
    return PF.resourceSymbolFor({ title: text, type, urls });
  };

  // Clear pf-recent-v2: a log of opened resources that nothing read back. See git log.
  try { localStorage.removeItem("pf-recent-v2"); } catch (_) {}

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function setJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try { localStorage.setItem("pf-theme", theme); } catch (_) {}
    qsa("[data-theme-toggle]").forEach((button) => {
      const dark = theme === "dark";
      button.textContent = dark ? "☀" : "☾";
      button.setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
      button.title = dark ? "Use light theme" : "Use dark theme";
    });
  }

  function setLanguageState(next) {
    language = next === "hi" ? "hi" : "en";
    root.lang = language === "hi" ? "hi-IN" : "en-IN";
    root.dataset.lang = language;
    updateLanguageControls();
  }

  function savedLanguage() {
    try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "hi" ? "hi" : "en"; } catch (_) { return "en"; }
  }

  function rememberLanguage(next) {
    try {
      if (next === "hi") localStorage.setItem(LANGUAGE_STORAGE_KEY, "hi");
      else localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    } catch (_) {}
  }

  function translationClientId() {
    try {
      const key = "pigsfield-ai-client-v1";
      let value = localStorage.getItem(key) || "";
      if (!/^[a-z0-9-]{12,80}$/i.test(value)) {
        if (!window.crypto || typeof window.crypto.randomUUID !== "function") return "anonymous";
        value = window.crypto.randomUUID();
        localStorage.setItem(key, value);
      }
      return value;
    } catch (_) {
      return "anonymous";
    }
  }

  function refreshTranslationBusy() {
    translationBusy = preparingTranslation || queuedTranslationJobs > 0;
    updateLanguageControls();
  }

  function setLanguageProgress(message = "", compact = "") {
    languageStatus = message;
    compactLanguageStatus = compact;
    updateLanguageControls();
  }

  function updateLanguageControls() {
    qsa("[data-lang-toggle]").forEach((button) => {
      const defaultLabel = language === "hi" ? "EN" : "हिन्दी";
      const defaultTitle = language === "hi"
        ? "Restore the original English page"
        : "Translate this page to Hindi";
      const nextLabel = translationBusy && compactLanguageStatus ? compactLanguageStatus : defaultLabel;
      if (button.textContent !== nextLabel) button.textContent = nextLabel;
      button.disabled = translationBusy;
      button.setAttribute("aria-busy", String(translationBusy));
      button.setAttribute("aria-label", translationBusy && languageStatus ? languageStatus : defaultTitle);
      button.title = translationBusy && languageStatus ? languageStatus : defaultTitle;
    });
    const live = qs("#translation-live-status");
    if (live) live.textContent = languageStatus;
  }

  function isTechnicalValue(value) {
    const text = String(value || "").trim();
    if (!text || !/[A-Za-z]/.test(text)) return true;
    if (/[\u0900-\u097F]/.test(text)) return true;
    if (/^(?:https?:|mailto:|tel:|upi:|www\.)/i.test(text)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true;
    if (/^(?:[\w-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i.test(text)) return true;
    return false;
  }

  function isSkippedElement(element, textNode = false) {
    if (!element || !(element instanceof Element)) return true;
    if (element.closest(TRANSLATION_SKIP_SELECTOR)) return true;
    if (textNode && element.closest("textarea")) return true;
    return false;
  }

  function shouldTranslateText(node, source) {
    return node && node.nodeType === Node.TEXT_NODE &&
      !isSkippedElement(node.parentElement, true) && !isTechnicalValue(source);
  }

  function shouldTranslateAttribute(element, source) {
    return element && !isSkippedElement(element, false) && !isTechnicalValue(source);
  }

  function collectTranslationTargets(scope) {
    const targets = [];
    let rootNode = scope || document.body;
    if (rootNode === document) rootNode = document.body;
    if (!rootNode) return targets;

    if (rootNode.nodeType === Node.TEXT_NODE) {
      const source = originalText.has(rootNode) ? originalText.get(rootNode) : rootNode.nodeValue;
      if (shouldTranslateText(rootNode, source)) targets.push({ kind: "text", node: rootNode });
      return targets;
    }
    if (!(rootNode instanceof Element)) return targets;

    if (!isSkippedElement(rootNode, true)) {
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const source = originalText.has(node) ? originalText.get(node) : node.nodeValue;
          return shouldTranslateText(node, source) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      let textNode;
      while ((textNode = walker.nextNode())) targets.push({ kind: "text", node: textNode });
    }

    const attributeElements = [rootNode, ...qsa("[placeholder], [title], [aria-label]", rootNode)];
    attributeElements.forEach((element) => {
      TRANSLATABLE_ATTRIBUTES.forEach((name) => {
        if (!element.hasAttribute(name)) return;
        const stored = originalAttributes.get(element);
        const source = stored && stored.has(name) ? stored.get(name) : element.getAttribute(name);
        if (shouldTranslateAttribute(element, source)) targets.push({ kind: "attribute", element, name });
      });
    });
    return targets;
  }

  function splitWhitespace(value) {
    const match = String(value || "").match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { leading: match ? match[1] : "", core: match ? match[2] : String(value || ""), trailing: match ? match[3] : "" };
  }

  function translatedValue(source) {
    const parts = splitWhitespace(source);
    if (!parts.core) return source;
    return `${parts.leading}${translationCache.get(parts.core) || parts.core}${parts.trailing}`;
  }

  function translationBatches(values) {
    const batches = [];
    let batch = [];
    let characters = 0;
    values.forEach((value) => {
      if (value.length > SERVER_TRANSLATION_MAX_CHARACTERS) {
        const error = new Error("A visible page string is too long to translate safely.");
        error.code = "server-translation-input-too-large";
        throw error;
      }
      if (batch.length && (batch.length >= SERVER_TRANSLATION_MAX_ITEMS || characters + value.length > SERVER_TRANSLATION_MAX_CHARACTERS)) {
        batches.push(batch);
        batch = [];
        characters = 0;
      }
      batch.push(value);
      characters += value.length;
    });
    if (batch.length) batches.push(batch);
    return batches;
  }

  function translationIsCurrent(generation) {
    return language === "hi" && generation === translationGeneration;
  }

  async function requestServerTranslations(texts, generation) {
    if (!translationIsCurrent(generation)) return null;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SERVER_TRANSLATION_TIMEOUT_MS);
    try {
      const response = await fetch(TRANSLATION_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Pigsfield-Client": translationClientId()
        },
        body: JSON.stringify({ text: texts })
      });
      if (!translationIsCurrent(generation)) return null;
      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!translationIsCurrent(generation)) return null;
      if (!response.ok) {
        const error = new Error(payload && payload.error || "Pigsfield's Hindi translation service is unavailable.");
        error.code = "server-translation-unavailable";
        error.status = response.status;
        throw error;
      }
      const translations = payload && payload.translations;
      if (!Array.isArray(translations) || translations.length !== texts.length || translations.some((value) => typeof value !== "string" || !value.trim())) {
        const error = new Error("Pigsfield's Hindi translation service returned an incomplete result.");
        error.code = "server-translation-invalid-result";
        throw error;
      }
      return translations;
    } catch (error) {
      if (!translationIsCurrent(generation)) return null;
      if (error && /^server-translation-/.test(error.code || "")) throw error;
      const failed = new Error(error && error.name === "AbortError"
        ? "Pigsfield's Hindi translation request timed out."
        : "Pigsfield's Hindi translation service could not be reached.");
      failed.code = error && error.name === "AbortError" ? "server-translation-timeout" : "server-translation-network-error";
      failed.status = 503;
      throw failed;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function translateValuesOnServer(values, announceProgress, generation, alreadyCompleted = 0, total = values.length) {
    if (!translationIsCurrent(generation)) return;
    const missing = values.filter((value) => !translationCache.has(value));
    if (!missing.length) return;
    translationProvider = "server";
    const batches = translationBatches(missing);
    let completed = alreadyCompleted;
    for (const batch of batches) {
      if (!translationIsCurrent(generation)) return;
      const results = await requestServerTranslations(batch, generation);
      if (!translationIsCurrent(generation) || !results) return;
      batch.forEach((source, index) => translationCache.set(source, results[index] || source));
      completed += batch.length;
      if (announceProgress) {
        const percent = Math.min(100, Math.round((completed / Math.max(1, total)) * 100));
        setLanguageProgress(`Translating this page through Pigsfield's Cloudflare Hindi service: ${percent}%`, `HI ${percent}%`);
      }
    }
  }

  function destroyNativeTranslator() {
    if (!translatorInstance) return;
    try {
      if (typeof translatorInstance.destroy === "function") translatorInstance.destroy();
    } catch (_) {}
    translatorInstance = null;
  }

  async function prepareTranslations(values, announceProgress, generation) {
    if (!translationIsCurrent(generation)) return;
    const missing = [...new Set(values)].filter((value) => value && !translationCache.has(value));
    if (!missing.length) return;
    if (translationProvider !== "native" || !translatorInstance) {
      await translateValuesOnServer(missing, announceProgress, generation, 0, missing.length);
      return;
    }

    for (let index = 0; index < missing.length; index += 1) {
      if (!translationIsCurrent(generation)) return;
      const source = missing[index];
      try {
        const result = await translatorInstance.translate(source);
        if (!translationIsCurrent(generation)) return;
        translationCache.set(source, String(result || source));
        if (announceProgress) {
          const percent = Math.round(((index + 1) / missing.length) * 100);
          setLanguageProgress(`Translating this page to Hindi on your device: ${percent}%`, `HI ${percent}%`);
        }
      } catch (_) {
        if (!translationIsCurrent(generation)) return;
        destroyNativeTranslator();
        const remaining = missing.slice(index).filter((value) => !translationCache.has(value));
        await translateValuesOnServer(remaining, announceProgress, generation, index, missing.length);
        return;
      }
    }
  }

  function writeTranslatedText(node, value) {
    if (node.nodeValue === value) return;
    expectedTextMutations.set(node, value);
    node.nodeValue = value;
  }

  function writeTranslatedAttribute(element, name, value) {
    if (element.getAttribute(name) === value) return;
    let expected = expectedAttributeMutations.get(element);
    if (!expected) {
      expected = new Map();
      expectedAttributeMutations.set(element, expected);
    }
    expected.set(name, value);
    element.setAttribute(name, value);
  }

  async function translateScope(scope, generation, announceProgress) {
    if (!translationIsCurrent(generation)) return;
    const targets = collectTranslationTargets(scope);
    if (!targets.length) return;
    const preparedTargets = [];
    const sourceValues = [];
    targets.forEach((target) => {
      if (target.kind === "text") {
        if (!target.node.isConnected) return;
        if (!originalText.has(target.node)) originalText.set(target.node, target.node.nodeValue);
        const source = originalText.get(target.node);
        if (!shouldTranslateText(target.node, source)) return;
        const parts = splitWhitespace(source);
        preparedTargets.push({ ...target, source });
        if (parts.core) sourceValues.push(parts.core);
      } else {
        if (!target.element.isConnected || !target.element.hasAttribute(target.name)) return;
        let stored = originalAttributes.get(target.element);
        if (!stored) {
          stored = new Map();
          originalAttributes.set(target.element, stored);
        }
        if (!stored.has(target.name)) stored.set(target.name, target.element.getAttribute(target.name));
        const source = stored.get(target.name);
        if (!shouldTranslateAttribute(target.element, source)) return;
        const parts = splitWhitespace(source);
        preparedTargets.push({ ...target, source });
        if (parts.core) sourceValues.push(parts.core);
      }
    });

    await prepareTranslations(sourceValues, announceProgress, generation);
    if (language !== "hi" || generation !== translationGeneration) return;
    preparedTargets.forEach((target) => {
      if (target.kind === "text") {
        if (target.node.isConnected) writeTranslatedText(target.node, translatedValue(target.source));
      } else if (target.element.isConnected && target.element.hasAttribute(target.name)) {
        writeTranslatedAttribute(target.element, target.name, translatedValue(target.source));
      }
    });
  }

  function browserTranslationGuidance() {
    const ua = navigator.userAgent;
    const mobile = /(?:Android|Mobile|CriOS|EdgA|EdgiOS)/.test(ua);
    if (/Edg(?:A|iOS)?\//.test(ua)) {
      return mobile
        ? "In Edge, open the browser menu, choose Translate, and select Hindi."
        : "In Edge, select the Translate icon in the address bar, choose Hindi, then select Translate.";
    }
    if (/Firefox\//.test(ua)) return "In Firefox, open the browser menu and choose Translate page, or use the translation icon in the toolbar, then choose Hindi.";
    if (/Safari\//.test(ua) && !/(?:Chrome|Chromium|CriOS)\//.test(ua)) return "In Safari, open the Page menu in the address bar and choose Translate Website, then choose Hindi if it is offered.";
    if (/(?:Chrome|Chromium|CriOS)\//.test(ua)) {
      return mobile
        ? "In Chrome, open the browser menu (⋮ or …), choose Translate, and select Hindi."
        : "In Chrome, right-click the page and choose Translate to…, or select the Translate icon in the address bar, then choose Hindi.";
    }
    return "Open your browser's page menu or address-bar translation control, choose Translate page, and select Hindi.";
  }

  function translationFailureReason(error) {
    if (error && error.status === 429) return "Pigsfield's shared Hindi translation capacity is busy, and this browser could not translate on-device. Please wait one minute and try again.";
    if (error && error.status === 503) return "Pigsfield's Hindi translation service is temporarily unavailable, and this browser could not translate on-device.";
    return "Neither this browser's on-device translator nor Pigsfield's same-origin Hindi service is available right now.";
  }

  function showTranslationHelp(error) {
    const reason = qs("#translation-help-reason");
    const guidance = qs("#translation-browser-guidance");
    if (reason) reason.textContent = translationFailureReason(error);
    if (guidance) guidance.textContent = browserTranslationGuidance();
    showDialog(qs("#translation-help-dialog"));
  }

  function createNativeTranslatorFromClick() {
    if (translatorInstance) return Promise.resolve(translatorInstance);
    if (!("Translator" in window) || typeof window.Translator.create !== "function") {
      const error = new Error("Translator API unavailable");
      error.code = "translator-api-missing";
      return Promise.reject(error);
    }
    let creation;
    try {
      creation = window.Translator.create({
        ...TRANSLATOR_OPTIONS,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            const percent = Math.max(0, Math.min(100, Math.round(Number(event.loaded || 0) * 100)));
            setLanguageProgress(`Downloading the browser's Hindi language pack: ${percent}%`, `HI ${percent}%`);
          });
        }
      });
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve(creation).then((instance) => {
      translatorInstance = instance;
      return instance;
    });
  }

  function restoreOriginalEnglish() {
    translationGeneration += 1;
    stopTranslationObserver();
    destroyNativeTranslator();
    translationProvider = "";
    rememberLanguage("en");
    setLanguageState("en");
    originalText.forEach((value, node) => {
      if (node.isConnected) node.nodeValue = value;
    });
    originalAttributes.forEach((attributes, element) => {
      if (!element.isConnected) return;
      attributes.forEach((value, name) => {
        if (value == null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      });
    });
    originalText.clear();
    originalAttributes.clear();
    pendingTranslationRoots.clear();
    setLanguageProgress("Original English restored.", "");
    PF.toast("Original English restored.");
    setTimeout(() => {
      if (!translationBusy && language === "en") setLanguageProgress("", "");
    }, 1200);
  }

  function handleTranslationFailure(error) {
    destroyNativeTranslator();
    translationProvider = "";
    rememberLanguage("en");
    if (language === "hi") {
      translationGeneration += 1;
      stopTranslationObserver();
      setLanguageState("en");
      originalText.forEach((value, node) => { if (node.isConnected) node.nodeValue = value; });
      originalAttributes.forEach((attributes, element) => {
        if (!element.isConnected) return;
        attributes.forEach((value, name) => {
          if (value == null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        });
      });
      originalText.clear();
      originalAttributes.clear();
      pendingTranslationRoots.clear();
    }
    setLanguageProgress("Hindi translation is unavailable right now.", "");
    showTranslationHelp(error);
  }

  function enqueueTranslation(scope, announceProgress = false) {
    if (language !== "hi") return Promise.resolve();
    const generation = translationGeneration;
    queuedTranslationJobs += 1;
    if (queuedTranslationJobs === 1) {
      const destination = translationProvider === "native"
        ? "on your device"
        : "through Pigsfield's Cloudflare Hindi service";
      setLanguageProgress(`${announceProgress ? "Translating this page" : "Translating newly added content"} to Hindi ${destination}…`, "HI …");
    }
    refreshTranslationBusy();
    const job = translationQueue.then(() => translateScope(scope, generation, announceProgress));
    const handled = job.catch((error) => {
      if (translationIsCurrent(generation)) handleTranslationFailure(error);
    });
    translationQueue = handled;
    return handled.finally(() => {
      queuedTranslationJobs = Math.max(0, queuedTranslationJobs - 1);
      if (!queuedTranslationJobs) {
        const ready = translationProvider === "native"
          ? "Hindi translation is ready on this device."
          : "Hindi translation is ready through Pigsfield's Cloudflare service.";
        setLanguageProgress(language === "hi" ? ready : languageStatus, "");
      }
      refreshTranslationBusy();
    });
  }

  function flushPendingTranslationRoots() {
    mutationFlushScheduled = false;
    if (language !== "hi") {
      pendingTranslationRoots.clear();
      return;
    }
    const roots = Array.from(pendingTranslationRoots).filter((node) => node && node.isConnected);
    pendingTranslationRoots.clear();
    const outermost = roots.filter((node, index) => !roots.some((other, otherIndex) => {
      if (index === otherIndex || !(other instanceof Element)) return false;
      return other.contains(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    }));
    outermost.forEach((node) => enqueueTranslation(node, false));
  }

  function queueTranslationRoot(scope) {
    if (language !== "hi" || !scope) return;
    pendingTranslationRoots.add(scope);
    if (mutationFlushScheduled) return;
    mutationFlushScheduled = true;
    queueMicrotask(flushPendingTranslationRoots);
  }

  function startTranslationObserver() {
    if (translationObserver || !("MutationObserver" in window)) return;
    translationObserver = new MutationObserver((mutations) => {
      if (language !== "hi") return;
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          if (isSkippedElement(mutation.target.parentElement, true)) return;
          const expected = expectedTextMutations.get(mutation.target);
          if (expected === mutation.target.nodeValue) {
            expectedTextMutations.delete(mutation.target);
            return;
          }
          originalText.set(mutation.target, mutation.target.nodeValue);
          queueTranslationRoot(mutation.target);
          return;
        }
        if (mutation.type === "attributes") {
          if (isSkippedElement(mutation.target, false)) return;
          const expected = expectedAttributeMutations.get(mutation.target);
          if (expected && expected.get(mutation.attributeName) === mutation.target.getAttribute(mutation.attributeName)) {
            expected.delete(mutation.attributeName);
            if (!expected.size) expectedAttributeMutations.delete(mutation.target);
            return;
          }
          let stored = originalAttributes.get(mutation.target);
          if (!stored) {
            stored = new Map();
            originalAttributes.set(mutation.target, stored);
          }
          stored.set(mutation.attributeName, mutation.target.getAttribute(mutation.attributeName));
          queueTranslationRoot(mutation.target);
          return;
        }
        if (isSkippedElement(mutation.target, false)) return;
        mutation.addedNodes.forEach((node) => queueTranslationRoot(node));
      });
    });
    translationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
  }

  function stopTranslationObserver() {
    if (!translationObserver) return;
    translationObserver.disconnect();
    translationObserver = null;
    pendingTranslationRoots.clear();
    mutationFlushScheduled = false;
  }

  async function toggleLanguage() {
    if (translationBusy) {
      PF.toast(languageStatus || "Translation is already in progress.");
      return;
    }
    if (language === "hi") {
      restoreOriginalEnglish();
      return;
    }

    // Translator.create() must run directly in the click activation path.
    const nativeCreation = createNativeTranslatorFromClick();
    preparingTranslation = true;
    setLanguageProgress("Preparing Hindi translation…", "HI …");
    refreshTranslationBusy();
    try {
      try {
        await nativeCreation;
        translationProvider = "native";
      } catch (_) {
        destroyNativeTranslator();
        translationProvider = "server";
      }
      translationGeneration += 1;
      setLanguageState("hi");
      rememberLanguage("hi");
      startTranslationObserver();
      preparingTranslation = false;
      refreshTranslationBusy();
      PF.toast("Translating this page to Hindi…");
      await enqueueTranslation(document.body, true);
      if (language === "hi") PF.toast("Hindi translation is ready. Use EN to restore the original instantly.");
    } catch (error) {
      preparingTranslation = false;
      refreshTranslationBusy();
      handleTranslationFailure(error);
    }
  }

  function restoreSavedHindi() {
    translationProvider = "server";
    translationGeneration += 1;
    setLanguageState("hi");
    startTranslationObserver();
    setLanguageProgress("Restoring Hindi through Pigsfield's Cloudflare service…", "HI …");
    enqueueTranslation(document.body, true);
  }

  PF.applyLanguageTo = function (scope) {
    queueTranslationRoot(scope || document.body);
  };

  function initialTheme() {
    try {
      const saved = localStorage.getItem("pf-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  setTheme(initialTheme());

  function navLink(key, label) {
    const current = page === key ? ' aria-current="page"' : "";
    const pigbang = key === "watch" ? " data-pigbang-link" : "";
    return `<a href="${escapeHtml(PF.path(key))}"${pigbang}${current}>${escapeHtml(label)}</a>`;
  }

  function buildHeader() {
    const mount = qs("[data-site-header]");
    if (!mount) return;
    mount.className = "site-header";
    mount.innerHTML = `
      <div class="container header-inner">
        <a class="brand-lockup" href="${escapeHtml(PF.path("home"))}" aria-label="Pigsfield home">
          <img src="${escapeHtml(base + "assets/pigsfield-logo-ui.webp")}" alt="" width="38" height="38" decoding="async">
          <span>Pigsfield</span>
        </a>
        <nav class="site-nav" id="site-nav" aria-label="Primary navigation">
          ${navLink("learn", "Learn")}
          ${navLink("watch", "PigBang")}
          ${navLink("exams", "Exams")}
          ${navLink("skills", "Skills")}
          ${navLink("tools", "Tools")}
          ${navLink("rights", "Rights")}
          ${navLink("about", "About")}
        </nav>
        <div class="header-actions">
          <button class="search-trigger" type="button" data-open-search aria-label="Search all Pigsfield resources">
            <b aria-hidden="true">⌕</b><span>Search</span><kbd>Ctrl K</kbd>
          </button>
          <button class="icon-button saved-trigger" type="button" data-open-saved aria-label="Open saved resources" title="Saved resources">♡</button>
          <button class="icon-button lang-toggle" type="button" data-lang-toggle translate="no" aria-label="Translate this page to Hindi" title="Translate this page to Hindi">हिन्दी</button>
          <span class="sr-only" id="translation-live-status" role="status" aria-live="polite" translate="no"></span>
          <button class="icon-button" type="button" data-theme-toggle aria-label="Change theme">☾</button>
          <button class="icon-button menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open navigation">≡</button>
        </div>
      </div>`;
  }

  /**
   * The header carries no border until the page has moved.
   *
   * A hairline drawn across the top of an untouched page cuts the hero's artwork off at the
   * fold, which is the one thing this design cannot afford. It appears on the first scroll
   * and goes again at the top, so the chrome only asserts itself once there is content
   * behind it to separate.
   */
  function watchHeaderScroll() {
    const header = qs("[data-site-header]");
    if (!header) return;
    let scrolled = null;
    const sync = () => {
      const next = window.scrollY > 8;
      if (next === scrolled) return;
      scrolled = next;
      header.dataset.scrolled = String(next);
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
  }

  function buildFooter() {
    const mount = qs("[data-site-footer]");
    if (!mount) return;
    mount.className = "site-footer";
    mount.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a class="brand-lockup" href="${escapeHtml(PF.path("home"))}">
              <img src="${escapeHtml(base + "assets/pigsfield-logo-ui.webp")}" alt="" width="38" height="38" loading="lazy" decoding="async">
              <span>Pigsfield</span>
            </a>
            <p>Education within reach: learn freely, build practical capability and hold public systems to account. A volunteer-led, free-first discovery platform built for people across India.</p>
            <nav class="footer-social" aria-labelledby="official-social-title" translate="no">
              <h2 class="footer-title" id="official-social-title">Our Official Social Media Handles</h2>
              <ul class="footer-social-list">
                <li><a href="https://www.facebook.com/61579505132769/" target="_blank" rel="noopener noreferrer" aria-label="Pigsfield on Facebook"><span class="social-mark facebook-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13.6 22v-8h2.8l.4-3h-3.2V9.1c0-.9.3-1.5 1.6-1.5H17V5c-.4-.1-1.4-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V11H7.5v3h2.8v8h3.3Z"/></svg></span><span>Facebook</span></a></li>
                <li><a href="https://www.youtube.com/@pigsfield" target="_blank" rel="noopener noreferrer" aria-label="Pigsfield on YouTube"><span class="social-mark youtube-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9.5 7.8 7 4.2-7 4.2V7.8Z"/></svg></span><span>YouTube</span></a></li>
                <li><a href="https://www.instagram.com/pigsfield" target="_blank" rel="noopener noreferrer" aria-label="Pigsfield on Instagram"><span class="social-mark instagram-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.4"/><circle cx="12" cy="12" r="3.5"/><circle class="social-dot" cx="17.4" cy="6.8" r="1"/></svg></span><span>Instagram</span></a></li>
                <li><a href="https://x.com/pigsfield" target="_blank" rel="noopener noreferrer" aria-label="Pigsfield on X"><span class="social-mark x-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18.24 2.25h3.31l-7.23 8.26 8.51 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z"/></svg></span><span>X</span></a></li>
                <li><a href="https://in.linkedin.com/in/priyadarshan-meghwal-431656210" target="_blank" rel="noopener noreferrer" aria-label="Pigsfield on LinkedIn"><span class="social-mark linkedin-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.4 8.2H3.2V21h3.2V8.2ZM4.8 3a1.9 1.9 0 1 0 0 3.8A1.9 1.9 0 0 0 4.8 3ZM20.8 13.7c0-3.9-2.1-5.8-4.9-5.8-2.3 0-3.3 1.2-3.9 2.1V8.2H8.8V21H12v-6.3c0-1.7.3-3.3 2.4-3.3 2 0 2.1 1.9 2.1 3.4V21h3.2l1.1-7.3Z"/></svg></span><span>LinkedIn</span></a></li>
              </ul>
            </nav>
          </div>
          <div>
            <div class="footer-title">Explore</div>
            <div class="footer-links">
              ${navLink("learn", "Nursery to PhD")}${navLink("watch", "PigBang")}${navLink("exams", "Competitive Exams")}${navLink("skills", "Vocational & Business")}${navLink("tools", "Digital Tools")}${navLink("rights", "Make Govt Accountable")}
            </div>
          </div>
          <div>
            <div class="footer-title">Mission</div>
            <div class="footer-links">
              ${navLink("about", "Why Pigsfield")}${navLink("submit", "Suggest a resource")}
            </div>
          </div>
          <div>
            <div class="footer-title">Trust</div>
            <div class="footer-links">
              ${navLink("editorial", "How we choose resources")}${navLink("accessibility", "Accessibility")}${navLink("privacy", "Privacy & terms")}
              <a href="mailto:zeroisinf@gmail.com?subject=Pigsfield%20correction">Report a problem</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Pigsfield. Resource ownership remains with original providers.</span>
          <span>Made for access, dignity and opportunity.</span>
        </div>
      </div>`;
  }

  function dialogMarkup() {
    const mount = document.createElement("div");
    mount.innerHTML = `
      <aside class="support-dock" aria-label="AI studio, support and feedback">
        <button class="support-action ai-action" type="button" data-open-ai><span class="ai-dock-mark" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z"/></svg></span> AI Studio</button>
        <button class="support-action" type="button" data-open-donate><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.7 3.9 12.9a5 5 0 0 1 7.1-7l1 1 1-1a5 5 0 0 1 7.1 7L12 20.7Z"/></svg> Donate</button>
        <button class="support-action feedback" type="button" data-open-feedback><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 4.8H4a1.2 1.2 0 0 0-1.2 1.2v9.2A1.2 1.2 0 0 0 4 16.4h3.1v3.3l3.9-3.3H20a1.2 1.2 0 0 0 1.2-1.2V6A1.2 1.2 0 0 0 20 4.8Z"/></svg> Feedback</button>
      </aside>

      <dialog class="site-dialog ai-studio-dialog" id="ai-studio-dialog" aria-labelledby="global-ai-title">
        <div class="dialog-head ai-dialog-head">
          <h2 id="global-ai-title"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z"/></svg> AI Studio</h2>
          <button class="icon-button" type="button" data-close-dialog aria-label="Close AI studio">×</button>
        </div>
        <div class="dialog-body ai-dialog-body">
          <div id="global-ai-studio-mount"><div class="ai-studio-loading" role="status"><strong>Loading the studio…</strong></div></div>
        </div>
      </dialog>

      <dialog class="site-dialog wide" id="search-dialog" aria-labelledby="search-title">
        <div class="dialog-head"><h2 id="search-title">Search all resources</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close search">×</button></div>
        <div class="dialog-body">
          <form class="global-search-form" id="global-search-form" role="search">
            <label class="sr-only" for="global-search-input">Search Pigsfield</label>
            <input id="global-search-input" type="search" autocomplete="off" placeholder="Try “NCERT physics”, “UPSC”, “RTI” or “coding”">
            <button class="button small" type="submit">Search</button>
          </form>
          <div class="search-status" id="global-search-status">Search 880+ curated entries across every Pigsfield path.</div>
          <div class="global-results" id="global-search-results"></div>
        </div>
      </dialog>

      <dialog class="site-dialog" id="saved-dialog" aria-labelledby="saved-title">
        <div class="dialog-head"><h2 id="saved-title">Saved for later</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close saved resources">×</button></div>
        <div class="dialog-body"><div class="saved-list" id="saved-list"></div></div>
      </dialog>

      <dialog class="site-dialog" id="translation-help-dialog" aria-labelledby="translation-help-title" translate="no">
        <div class="dialog-head"><h2 id="translation-help-title">Hindi translation needs browser help</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close translation help">×</button></div>
        <div class="dialog-body">
          <p id="translation-help-reason">Neither Pigsfield's same-origin Hindi service nor this browser's on-device translator is available right now.</p>
          <p><strong id="translation-browser-guidance">Open your browser's page menu, choose Translate page, and select Hindi.</strong></p>
          <p>A website cannot press or open privileged browser-toolbar controls for you. This guide stays on Pigsfield and never sends you to a translation website.</p>
          <button class="button small" type="button" data-close-dialog>Got it</button>
        </div>
      </dialog>

      <dialog class="site-dialog" id="donate-dialog" aria-labelledby="donate-title">
        <div class="dialog-head"><h2 id="donate-title">Keep access open</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close donation details">×</button></div>
        <div class="dialog-body">
          <p>Pigsfield is volunteer-led. A donation helps with research, review and keeping the platform available. Please verify the receiver name in your UPI app before paying.</p>
          <div class="upi-box">
            <div class="upi-code"><span>UPI ID</span><code>zeroisinf@ibl</code><button class="button small ghost" type="button" data-copy="zeroisinf@ibl">Copy</button></div>
            <a class="button brand" href="upi://pay?pa=zeroisinf@ibl&amp;pn=Pigsfield&amp;cu=INR">Open a UPI app</a>
          </div>
        </div>
      </dialog>

      <dialog class="site-dialog" id="feedback-dialog" aria-labelledby="feedback-title">
        <div class="dialog-head"><h2 id="feedback-title">Help Pigsfield improve</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close feedback">×</button></div>
        <div class="dialog-body">
          <p>Found a broken link, missing resource or unclear explanation? Tell us. Corrections, volunteers and thoughtful criticism are welcome.</p>
          <div class="action-grid">
            <a class="action-option" href="mailto:zeroisinf@gmail.com?subject=Pigsfield%20feedback"><b>@</b><span><strong>Send feedback</strong><small>zeroisinf@gmail.com</small></span></a>
            <a class="action-option" href="${escapeHtml(PF.path("submit"))}"><b>+</b><span><strong>Suggest a resource</strong><small>Use the contribution guide</small></span></a>
          </div>
        </div>
      </dialog>
      <div class="toast" id="site-toast" role="status" aria-live="polite"></div>`;
    document.body.append(...mount.children);
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    const focusTarget = qs("input, button, a", dialog);
    if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.id === "ai-studio-dialog" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  let toastTimer;
  PF.toast = function (message) {
    const toast = qs("#site-toast");
    if (!toast) return;
    toast.textContent = String(message || "").trim();
    if (!toast.textContent) {
      toast.classList.remove("show");
      return;
    }
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toast.textContent = "";
    }, 2600);
  };

  PF.copy = async function (text, success = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    PF.toast(success);
  };

  const SAVED_KEY = "pf-saved-v2";
  let saved = readJson(SAVED_KEY, []);
  if (!Array.isArray(saved)) saved = [];

  PF.isSaved = function (id) { return saved.some((item) => item.id === id); };

  PF.toggleSaved = function (item) {
    const index = saved.findIndex((savedItem) => savedItem.id === item.id);
    if (index >= 0) {
      saved.splice(index, 1);
      PF.toast("Removed from saved");
    } else {
      saved.unshift({
        id: item.id,
        title: item.title,
        description: item.description || "",
        url: item.url,
        section: item.section || "Pigsfield"
      });
      saved = saved.slice(0, 100);
      PF.toast("Saved for later");
    }
    setJson(SAVED_KEY, saved);
    document.dispatchEvent(new CustomEvent("pf:saved-changed", { detail: { id: item.id } }));
    return index < 0;
  };

  // Read/replace the saved list. js/account.js uses these to sync with an optional
  // account; the list itself stays in this browser for anyone who never signs in.
  PF.getSaved = function () {
    return saved.slice();
  };

  PF.replaceSaved = function (items) {
    if (!Array.isArray(items)) return PF.getSaved();
    saved = items.slice(0, 100);
    setJson(SAVED_KEY, saved);
    renderSaved();
    document.dispatchEvent(new CustomEvent("pf:saved-changed", { detail: { id: "" } }));
    return PF.getSaved();
  };

  function renderSaved() {
    const list = qs("#saved-list");
    if (!list) return;
    if (!saved.length) {
      list.innerHTML = `<div class="empty-state"><strong>Nothing saved yet</strong><p>Use the heart button on any resource to build a personal list on this device.</p></div>`;
      PF.applyLanguageTo(list);
      return;
    }
    list.innerHTML = saved.map((item) => `
      <div class="saved-item"${item.section === "PigBang" ? " data-pigbang-item" : ""}>
        <div><a${item.section === "PigBang" ? " data-pigbang-link" : ""} href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a><small>${escapeHtml(item.section)}</small></div>
        <button class="icon-button" type="button" data-remove-saved="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}">×</button>
      </div>`).join("");
    qsa("[data-remove-saved]", list).forEach((button) => {
      button.addEventListener("click", () => {
        saved = saved.filter((item) => item.id !== button.dataset.removeSaved);
        setJson(SAVED_KEY, saved);
        renderSaved();
        document.dispatchEvent(new CustomEvent("pf:saved-changed", { detail: { id: button.dataset.removeSaved } }));
      });
    });
    PF.applyLanguageTo(list);
  }

  /* Save buttons on pages that are plain HTML.
   *
   * The generated topic pages under /learn/, /skills/, /tools/ and /rights/ ship their
   * cards as markup, so there is no page module to bind a heart to. A button that carries
   * its own title and section is therefore hydrated and delegated here instead. Buttons
   * rendered by a page module (PigBang) describe themselves through that module and carry
   * no data-save-title, so they are left to it.
   */
  function staticSaveState(button) {
    const isSaved = PF.isSaved(button.dataset.save);
    button.classList.toggle("is-saved", isSaved);
    button.textContent = isSaved ? "\u2665" : "\u2661";
    button.setAttribute("aria-pressed", String(isSaved));
    button.setAttribute("aria-label", `${isSaved ? "Remove" : "Save"} ${button.dataset.saveTitle || "this resource"}`);
  }

  function initStaticSaveButtons() {
    const buttons = qsa("[data-save][data-save-title]");
    if (!buttons.length) return;
    buttons.forEach(staticSaveState);
    document.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-save][data-save-title]");
      if (!button) return;
      PF.toggleSaved({
        id: button.dataset.save,
        title: button.dataset.saveTitle,
        description: button.dataset.saveDescription || "",
        section: button.dataset.saveSection || "Pigsfield",
        // A save id is "<catalogue>:<anchor>", and the anchor is the card's own element id.
        url: `${location.origin}${location.pathname}#${encodeURIComponent(button.dataset.save.split(":").pop())}`
      });
    });
    document.addEventListener("pf:saved-changed", () => qsa("[data-save][data-save-title]").forEach(staticSaveState));
  }

  PF.openExternal = function (url, title = "Resource") {
    const safe = PF.safeUrl(url);
    if (!safe) {
      PF.toast("This link could not be opened safely.");
      return;
    }
    const opened = window.open(safe, "_blank", "noopener");
    if (opened) opened.opener = null;
  };

  let scriptPromises = {};
  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = base + src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        delete scriptPromises[src];
        reject(new Error(`Could not load ${src}`));
      };
      document.head.appendChild(script);
    });
    return scriptPromises[src];
  }

  let aiStudioPromise = null;
  async function openAIStudio() {
    const dialog = qs("#ai-studio-dialog");
    const mount = qs("#global-ai-studio-mount");
    if (!dialog || !mount) return;
    showDialog(dialog);
    if (!aiStudioPromise) {
      aiStudioPromise = loadScript("js/ai-studio.js")
        .then(() => {
          if (typeof PF.mountAIStudio !== "function") throw new Error("The studio could not start.");
          mount.replaceChildren();
          if (!PF.mountAIStudio(mount)) throw new Error("The studio could not be mounted safely.");
          PF.applyLanguageTo(dialog);
        })
        .catch((error) => {
          aiStudioPromise = null;
          mount.innerHTML = `<div class="empty-state"><strong>AI studio is temporarily unavailable</strong><p>${escapeHtml(error && error.message ? error.message : "Please check your connection and try again.")}</p><button class="button small" type="button" data-retry-ai>Try again</button></div>`;
          const retry = qs("[data-retry-ai]", mount);
          if (retry) retry.addEventListener("click", openAIStudio, { once: true });
          PF.applyLanguageTo(mount);
        });
    }
    await aiStudioPromise;
  }
  PF.openAIStudio = openAIStudio;

  function loadData(key) {
    window.PF_DATA = window.PF_DATA || {};
    if (window.PF_DATA[key]) return Promise.resolve(window.PF_DATA[key]);
    return loadScript(dataScripts[key]).then(() => window.PF_DATA[key]);
  }

  let searchIndex = null;
  function genericSearchEntries(key, data) {
    const entries = [];
    (data.sections || []).forEach((section, sectionIndex) => {
      (section.groups || []).forEach((group, groupIndex) => {
        (group.items || []).forEach((item, itemIndex) => {
          const id = PF.slug(`${item.title}-${section.resourceIdSection||1+sectionIndex}-${1+groupIndex}-${1+itemIndex}`);
          const route = topicRoutes[key];
          const slug = route ? route.slugs[route.by === "section" ? sectionIndex : groupIndex] : "";
          entries.push({
            title: item.title || item.desc || "Resource",
            description: item.desc || group.title || section.title || "",
            section: dataLabels[key],
            url: `${PF.path(dataPages[key])}${slug ? `${slug}/` : ""}#${encodeURIComponent(id)}`,
            haystack: `${item.title || ""} ${item.desc || ""} ${group.title || ""} ${section.title || ""}`.toLowerCase()
          });
        });
      });
    });
    return entries;
  }

  function examSearchEntries(data) {
    const entries = [];
    (data.roadmap && data.roadmap.rows || []).forEach((row) => {
      const id = `ncert-${PF.slug(row.subject)}`;
      entries.push({ title: `${row.subject} NCERT roadmap`, description: row.books || "UPSC, RAS and SSC reading path", section: "Competitive Exams", url: `${PF.path("exams")}#${id}`, haystack: JSON.stringify(row).toLowerCase() });
    });
    (data.common && data.common.subjects || []).forEach((subject) => {
      const id = `subject-${PF.slug(subject.subject)}`;
      entries.push({ title: subject.subject, description: `${subject.exam || "Competitive Exams"} courses, marathons and books`, section: "Competitive Exams", url: `${PF.path("exams")}#${id}`, haystack: JSON.stringify(subject).toLowerCase() });
    });
    return entries;
  }

  function watchSearchEntries(data) {
    const entries = [];
    (data.tabs || []).forEach((tab) => {
      (tab.items || []).forEach((item, itemIndex) => {
        const id = PF.slug(`${item.name}-${tab.id}-${itemIndex + 1}`);
        entries.push({
          title: item.name || "PigBang resource",
          description: `${item.subject || ""}${item.desc ? ` · ${item.desc}` : ""}`,
          section: "PigBang",
          kind: "pigbang",
          url: `${PF.path("watch")}#${encodeURIComponent(id)}`,
          haystack: `${item.name || ""} ${item.subject || ""} ${item.desc || ""} ${(item.classes || []).join(" ")} ${item.price || ""}`.toLowerCase()
        });
      });
    });
    return entries;
  }

  async function ensureSearchIndex() {
    if (searchIndex) return searchIndex;
    const keys = Object.keys(dataScripts);
    const datasets = await Promise.all(keys.map((key) => loadData(key)));
    searchIndex = [];
    keys.forEach((key, index) => {
      const data = datasets[index];
      if (!data) return;
      if (key === "pigbang") searchIndex.push(...watchSearchEntries(data));
      else if (key === "exams") searchIndex.push(...examSearchEntries(data));
      else searchIndex.push(...genericSearchEntries(key, data));
    });
    return searchIndex;
  }

  function searchEntries(query, entries) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return entries
      .map((entry) => {
        const title = entry.title.toLowerCase();
        if (!terms.every((term) => entry.haystack.includes(term))) return null;
        let score = 0;
        terms.forEach((term) => {
          if (title === term) score += 12;
          else if (title.startsWith(term)) score += 8;
          else if (title.includes(term)) score += 5;
          else score += 1;
        });
        return { entry, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
      .slice(0, 48)
      .map((result) => result.entry);
  }

  function renderSearchResults(results, query) {
    const target = qs("#global-search-results");
    const status = qs("#global-search-status");
    if (!results.length) {
      status.textContent = `No close matches for “${query}”. Try a broader stage, subject, exam or tool.`;
      target.innerHTML = `<div class="empty-state"><strong>No dead end</strong><p>Suggest the missing resource and help the next learner find it.</p><a class="button ghost small" href="${escapeHtml(PF.path("submit"))}">Suggest a resource</a></div>`;
      PF.applyLanguageTo(status);
      PF.applyLanguageTo(target);
      return;
    }
    status.textContent = `${results.length} best matches. Results open the exact collection and resource.`;
    target.innerHTML = results.map((item) => `
      <a class="global-result"${item.kind === "pigbang" ? " data-pigbang-link" : ""} href="${escapeHtml(item.url)}">
        <span class="result-monogram">${escapeHtml(item.section.slice(0, 2).toUpperCase())}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span>
        <em>${escapeHtml(item.section)}</em>
      </a>`).join("");
    PF.applyLanguageTo(status);
    PF.applyLanguageTo(target);
  }

  async function performGlobalSearch(query) {
    const status = qs("#global-search-status");
    const target = qs("#global-search-results");
    if (!query.trim()) {
      status.textContent = "Search 880+ curated entries across every Pigsfield path.";
      target.innerHTML = "";
      PF.applyLanguageTo(status);
      return;
    }
    status.textContent = "Opening the full Pigsfield map…";
    target.innerHTML = `<div class="empty-state"><strong>Searching every path</strong><p>The catalog loads only when you need it, keeping the rest of the site fast.</p></div>`;
    PF.applyLanguageTo(status);
    PF.applyLanguageTo(target);
    try {
      const entries = await ensureSearchIndex();
      renderSearchResults(searchEntries(query, entries), query);
    } catch (_) {
      status.textContent = "The catalog could not load. Check your connection and try again.";
      target.innerHTML = "";
      PF.applyLanguageTo(status);
    }
  }

  function openSearch(query = "") {
    const dialog = qs("#search-dialog");
    const input = qs("#global-search-input");
    showDialog(dialog);
    input.value = query;
    if (query) performGlobalSearch(query);
    setTimeout(() => input.focus(), 40);
  }

  const detailsMotion = new WeakMap();
  let detailsObserver = null;
  let pinnedSummaryTimer = 0;

  function isDetailsElement(element) {
    return Boolean(element && element.tagName === "DETAILS");
  }

  function directDetailsSummary(details) {
    return Array.from(details.children || []).find((child) => child.tagName === "SUMMARY") || null;
  }

  function detailsKind(details) {
    const explicit = details.getAttribute("data-accordion-key");
    if (explicit) return `key:${explicit}`;
    const kinds = ["exam-panel", "faq-item", "resource-notes"];
    return kinds.find((kind) => details.classList.contains(kind)) || "generic-details";
  }

  function detailsScope(details) {
    const parent = details.parentElement;
    if (!parent) return null;
    const directPeers = Array.from(parent.children).filter(isDetailsElement);
    if (directPeers.length > 1) return { root: parent, direct: true };
    const root = details.closest("[data-accordion-scope]");
    return root && root !== details ? { root, direct: false } : { root: parent, direct: true };
  }

  function accordionPeers(details) {
    // A card's Practical guide is an independent disclosure, not a catalog-level tab.
    if (details.classList.contains("resource-notes") || details.hasAttribute("data-accordion-independent")) return [];
    const scope = detailsScope(details);
    if (!scope) return [];
    const kind = detailsKind(details);
    const candidates = scope.direct
      ? Array.from(scope.root.children)
      : Array.from(scope.root.querySelectorAll("details")).filter((candidate) => candidate.closest("[data-accordion-scope]") === scope.root);
    return candidates.filter((candidate) => candidate !== details && isDetailsElement(candidate) && detailsKind(candidate) === kind);
  }

  function motionState(details) {
    let state = detailsMotion.get(details);
    if (!state) {
      state = { desired: Boolean(details.open), animation: null, frame: 0, token: 0, initialized: false, internalTransitions: [] };
      detailsMotion.set(details, state);
    }
    return state;
  }

  function writeNativeDetailsState(details, open) {
    if (details.open === open) return;
    motionState(details).internalTransitions.push(Boolean(open));
    details.open = Boolean(open);
  }

  function syncDetailsAria(details) {
    const summary = directDetailsSummary(details);
    if (summary) summary.setAttribute("aria-expanded", String(Boolean(details.open)));
  }

  function clearDetailsMotion(details) {
    details.style.removeProperty("height");
    details.style.removeProperty("overflow");
    details.style.removeProperty("will-change");
  }

  function cancelDetailsMotion(details) {
    const state = motionState(details);
    if (state.frame) {
      window.cancelAnimationFrame(state.frame);
      state.frame = 0;
    }
    if (state.animation) {
      state.animation.onfinish = null;
      state.animation.oncancel = null;
      state.animation.cancel();
      state.animation = null;
    }
  }

  function reducedDetailsMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function nativeDetailsMotion() {
    return Boolean(window.CSS && typeof window.CSS.supports === "function"
      && window.CSS.supports("selector(details::details-content)")
      && window.CSS.supports("interpolate-size: allow-keywords"));
  }

  function detailBorderHeight(details) {
    if (typeof window.getComputedStyle !== "function") return 0;
    const style = window.getComputedStyle(details);
    return (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  }

  function closedDetailsHeight(details, summary) {
    return Math.max(0, summary.getBoundingClientRect().height + detailBorderHeight(details));
  }

  function expandedDetailsHeight(details, summary) {
    return Math.max(closedDetailsHeight(details, summary), Number(details.scrollHeight || 0) + detailBorderHeight(details));
  }

  function settleDetails(details, open, token) {
    const state = motionState(details);
    if (token !== state.token || state.desired !== open) return;
    state.animation = null;
    state.frame = 0;
    writeNativeDetailsState(details, open);
    clearDetailsMotion(details);
    syncDetailsAria(details);
  }

  function animateDetailsState(details, open, options = {}) {
    const summary = directDetailsSummary(details);
    if (!summary) return;
    const state = motionState(details);
    const wasDesired = state.desired;
    const wasAnimating = Boolean(state.animation || state.frame);
    const currentHeight = details.getBoundingClientRect().height;
    state.desired = Boolean(open);
    const token = ++state.token;
    cancelDetailsMotion(details);

    // Browsers with ::details-content use the CSS transition; older browsers get WAAPI.
    if (options.instant || reducedDetailsMotion() || nativeDetailsMotion() || typeof details.animate !== "function") {
      writeNativeDetailsState(details, open);
      clearDetailsMotion(details);
      syncDetailsAria(details);
      return;
    }

    let fromHeight = currentHeight;
    if (open) {
      if (!details.open || (options.fromNativeMutation && !wasAnimating && !wasDesired)) fromHeight = closedDetailsHeight(details, summary);
      writeNativeDetailsState(details, true);
    } else if (!details.open) {
      // An external `.open = false` has already hidden the content. Restore it before paint so it can close smoothly.
      writeNativeDetailsState(details, true);
      fromHeight = expandedDetailsHeight(details, summary);
    }
    if (!fromHeight) fromHeight = open ? closedDetailsHeight(details, summary) : expandedDetailsHeight(details, summary);

    details.style.height = `${fromHeight}px`;
    details.style.overflow = "hidden";
    details.style.willChange = "height";
    syncDetailsAria(details);

    const startAnimation = () => {
      if (state.token !== token || state.desired !== open) return;
      state.frame = 0;
      const liveFrom = details.getBoundingClientRect().height || fromHeight;
      const target = open ? expandedDetailsHeight(details, summary) : closedDetailsHeight(details, summary);
      if (Math.abs(target - liveFrom) < 1) {
        settleDetails(details, open, token);
        return;
      }
      const duration = Math.max(180, Math.min(420, 170 + Math.abs(target - liveFrom) * 0.16));
      const animation = details.animate(
        [{ height: `${liveFrom}px` }, { height: `${target}px` }],
        { duration, easing: "cubic-bezier(.22, 1, .36, 1)" }
      );
      state.animation = animation;
      animation.onfinish = () => settleDetails(details, open, token);
      animation.oncancel = () => {};
    };

    // Opening a catalog section can render its contents in response to `toggle`.
    // Measuring on the next frame includes that dynamic content in the target height.
    state.frame = window.requestAnimationFrame(startAnimation);
  }

  function pinActivatedSummary(summary, peers, activeDetails) {
    if (!summary || reducedDetailsMotion() || typeof window.scrollBy !== "function") return;
    const siblings = activeDetails.parentElement ? Array.from(activeDetails.parentElement.children) : [];
    const activeIndex = siblings.indexOf(activeDetails);
    const closingAbove = peers.some((peer) => siblings.indexOf(peer) > -1 && siblings.indexOf(peer) < activeIndex && motionState(peer).desired);
    if (!closingAbove) return;
    if (pinnedSummaryTimer) clearTimeout(pinnedSummaryTimer);
    const originalTop = summary.getBoundingClientRect().top;
    const originalScrollY = window.scrollY;
    // Let native scroll anchoring handle the transition. Correct once after it
    // settles instead of forcing layout on every animation frame.
    pinnedSummaryTimer = setTimeout(() => {
      pinnedSummaryTimer = 0;
      if (!summary.isConnected || Math.abs(window.scrollY - originalScrollY) > 2) return;
      const delta = summary.getBoundingClientRect().top - originalTop;
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: "smooth" });
    }, nativeDetailsMotion() ? 320 : 460);
  }

  function setDetailsOpen(details, open, options = {}) {
    if (!isDetailsElement(details)) return;
    const state = motionState(details);
    if (state.desired === Boolean(open) && !options.force && details.open === Boolean(open)) {
      syncDetailsAria(details);
      return;
    }
    if (open) {
      const peers = accordionPeers(details);
      pinActivatedSummary(directDetailsSummary(details), peers, details);
      peers.forEach((peer) => {
        if (motionState(peer).desired || peer.open) animateDetailsState(peer, false);
      });
    }
    animateDetailsState(details, Boolean(open), options);
  }

  function initializeDetails(details, preserveCurrentState = false) {
    if (!isDetailsElement(details)) return;
    const state = motionState(details);
    cancelDetailsMotion(details);
    state.desired = preserveCurrentState ? Boolean(details.open) : false;
    state.initialized = true;
    state.token += 1;
    if (!preserveCurrentState) writeNativeDetailsState(details, false);
    // Initialization happens before observation (or represents one added subtree),
    // so no queued native transition should leak into a later user activation.
    state.internalTransitions.length = 0;
    clearDetailsMotion(details);
    syncDetailsAria(details);
  }

  function detailsInNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return [];
    return [isDetailsElement(node) ? node : null, ...Array.from(node.querySelectorAll ? node.querySelectorAll("details") : [])].filter(Boolean);
  }

  function processOpenMutations(records, initialized) {
    const byTarget = new Map();
    records.filter((record) => record.type === "attributes" && record.attributeName === "open" && isDetailsElement(record.target)).forEach((record) => {
      if (!byTarget.has(record.target)) byTarget.set(record.target, []);
      byTarget.get(record.target).push(record);
    });
    byTarget.forEach((targetRecords, details) => {
      if (initialized.has(details)) return;
      const state = motionState(details);
      targetRecords.forEach((record, index) => {
        const next = targetRecords[index + 1];
        const newOpen = next ? next.oldValue !== null : details.hasAttribute("open");
        if (state.internalTransitions.length && state.internalTransitions[0] === newOpen) {
          state.internalTransitions.shift();
          return;
        }
        setDetailsOpen(details, newOpen, { fromNativeMutation: true, force: true });
      });
    });
  }

  function initializeAccordions(scope = document) {
    const initial = scope === document
      ? qsa("details")
      : [isDetailsElement(scope) ? scope : null, ...qsa("details", scope)].filter(Boolean);
    initial.forEach(initializeDetails);

    if (!detailsObserver && "MutationObserver" in window) {
      detailsObserver = new MutationObserver((records) => {
        const initialized = new Set();
        records.filter((record) => record.type === "childList").forEach((record) => {
          record.addedNodes.forEach((node) => detailsInNode(node).forEach((details) => {
            if (motionState(details).initialized) return;
            // Preserve a same-task deep-link opening while still requiring every
            // authored/generated disclosure to be closed in its markup.
            initializeDetails(details, true);
            initialized.add(details);
          }));
        });
        processOpenMutations(records, initialized);
      });
      detailsObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["open"] });
    }
  }

  function handleSummaryActivation(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    const summary = event.target.closest && event.target.closest("summary");
    if (!summary) return;
    const details = summary.parentElement;
    if (!isDetailsElement(details) || directDetailsSummary(details) !== summary) return;
    const interactive = event.target.closest("a, button, input, select, textarea, [contenteditable='true']");
    if (interactive && interactive !== summary) return;
    event.preventDefault();
    const state = motionState(details);
    setDetailsOpen(details, !state.desired);
  }

  PF.setDetailsOpen = setDetailsOpen;
  PF.initializeAccordions = initializeAccordions;

  function bindUi() {
    document.addEventListener("click", handleSummaryActivation);
    qsa("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark")));
    qsa("[data-lang-toggle]").forEach((button) => button.addEventListener("click", toggleLanguage));

    const menu = qs("#site-nav");
    const toggle = qs(".menu-toggle");
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        const open = menu.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
        toggle.textContent = open ? "×" : "≡";
      });
      qsa("a", menu).forEach((link) => link.addEventListener("click", () => {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "≡";
      }));
    }

    qsa("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
    qsa("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    }));
    const aiDialog = qs("#ai-studio-dialog");
    if (aiDialog) aiDialog.addEventListener("close", () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });

    qsa("[data-open-search]").forEach((button) => button.addEventListener("click", () => openSearch()));
    qsa("[data-open-saved]").forEach((button) => button.addEventListener("click", () => { renderSaved(); showDialog(qs("#saved-dialog")); }));
    qsa("[data-open-ai]").forEach((button) => button.addEventListener("click", openAIStudio));
    qsa("[data-open-donate]").forEach((button) => button.addEventListener("click", () => showDialog(qs("#donate-dialog"))));
    qsa("[data-open-feedback]").forEach((button) => button.addEventListener("click", () => showDialog(qs("#feedback-dialog"))));
    qsa("[data-copy]").forEach((button) => button.addEventListener("click", () => PF.copy(button.dataset.copy)));

    const globalForm = qs("#global-search-form");
    globalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = qs("#global-search-input").value.trim();
      performGlobalSearch(query);
      if (query) history.replaceState(null, "", `${location.pathname}?q=${encodeURIComponent(query)}`);
    });

    let searchTimer;
    qs("#global-search-input").addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      const query = event.target.value.trim();
      searchTimer = setTimeout(() => performGlobalSearch(query), 220);
    });

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        openSearch();
      }
    });

    const params = new URLSearchParams(location.search);
    if (params.get("q")) openSearch(params.get("q"));
    if (params.get("studio") === "ai" || page === "ai") openAIStudio();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    window.addEventListener("load", () => {
      const register = () => navigator.serviceWorker.register(base + "sw.js").catch(() => {});
      if ("requestIdleCallback" in window) window.requestIdleCallback(register, { timeout: 4000 });
      else window.setTimeout(register, 1500);
    }, { once: true });
  }

  function init() {
    buildHeader();
    watchHeaderScroll();
    buildFooter();
    dialogMarkup();
    initializeAccordions();
    bindUi();
    initStaticSaveButtons();
    setTheme(root.dataset.theme || initialTheme());
    if (savedLanguage() === "hi") restoreSavedHindi();
    else setLanguageState("en");
    registerServiceWorker();
    document.documentElement.classList.add("js-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
