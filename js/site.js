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

  const dataLabels = {
    school: "Learn",
    teach: "Skills",
    tools: "Tools",
    exams: "Exams",
    pigbang: "PigBang",
    govt: "Make Government Accountable"
  };

  let language = "en";
  const TRANSLATOR_OPTIONS = { sourceLanguage: "en", targetLanguage: "hi" };
  const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"];
  const TRANSLATION_SKIP_SELECTOR = [
    "script", "style", "noscript", "template", "pre", "code", "kbd", "samp",
    "[translate='no']", "[contenteditable]:not([contenteditable='false'])",
    "[aria-hidden='true']", ".resource-domain", ".brand-lockup", "#site-toast",
    "#translation-help-dialog"
  ].join(",");

  const originalText = new Map();
  const originalAttributes = new Map();
  const translationCache = new Map();
  const expectedTextMutations = new WeakMap();
  const expectedAttributeMutations = new WeakMap();
  const pendingTranslationRoots = new Set();
  let translatorInstance = null;
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
    // Prose changes must not silently rebrand a resource or change its main card symbol.
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
        : "Translate this page to Hindi on this device";
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

  async function translateValue(source) {
    const parts = splitWhitespace(source);
    if (!parts.core) return source;
    if (!translationCache.has(parts.core)) {
      const result = await translatorInstance.translate(parts.core);
      translationCache.set(parts.core, String(result || parts.core));
    }
    return `${parts.leading}${translationCache.get(parts.core)}${parts.trailing}`;
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
    const targets = collectTranslationTargets(scope);
    if (!targets.length) return;
    let lastPercent = -1;

    for (let index = 0; index < targets.length; index += 1) {
      if (language !== "hi" || generation !== translationGeneration) return;
      const target = targets[index];
      if (target.kind === "text") {
        if (!target.node.isConnected) continue;
        if (!originalText.has(target.node)) originalText.set(target.node, target.node.nodeValue);
        const source = originalText.get(target.node);
        if (shouldTranslateText(target.node, source)) writeTranslatedText(target.node, await translateValue(source));
      } else {
        if (!target.element.isConnected || !target.element.hasAttribute(target.name)) continue;
        let stored = originalAttributes.get(target.element);
        if (!stored) {
          stored = new Map();
          originalAttributes.set(target.element, stored);
        }
        if (!stored.has(target.name)) stored.set(target.name, target.element.getAttribute(target.name));
        const source = stored.get(target.name);
        if (shouldTranslateAttribute(target.element, source)) {
          writeTranslatedAttribute(target.element, target.name, await translateValue(source));
        }
      }

      if (announceProgress) {
        const percent = Math.round(((index + 1) / targets.length) * 100);
        if (percent === 100 || percent >= lastPercent + 4) {
          lastPercent = percent;
          setLanguageProgress(`Translating this page to Hindi on your device: ${percent}%`, `HI ${percent}%`);
        }
      }
    }
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
    if (error && error.code === "translator-api-missing") {
      return "This browser does not expose its on-device Translator API to this website.";
    }
    if (error && error.code === "translator-pair-unavailable") {
      return "This browser cannot currently provide its English-to-Hindi language pack.";
    }
    if (error && error.name === "NotAllowedError") {
      return "The browser blocked the language-pack request or did not allow it for this page.";
    }
    if (error && error.name === "NetworkError") {
      return "The Hindi language pack could not be downloaded. Check the connection and try again.";
    }
    return "On-device Hindi translation could not start in this browser.";
  }

  function showTranslationHelp(error) {
    const reason = qs("#translation-help-reason");
    const guidance = qs("#translation-browser-guidance");
    if (reason) reason.textContent = translationFailureReason(error);
    if (guidance) guidance.textContent = browserTranslationGuidance();
    showDialog(qs("#translation-help-dialog"));
    PF.toast("Hindi translation is unavailable here. Browser instructions are open.");
  }

  async function ensureNativeTranslator() {
    if (translatorInstance) return translatorInstance;
    if (!("Translator" in window) || typeof window.Translator.availability !== "function" || typeof window.Translator.create !== "function") {
      const error = new Error("Translator API unavailable");
      error.code = "translator-api-missing";
      throw error;
    }

    const availability = await window.Translator.availability(TRANSLATOR_OPTIONS);
    if (!availability || availability === "unavailable") {
      const error = new Error("English-to-Hindi translation unavailable");
      error.code = "translator-pair-unavailable";
      throw error;
    }
    if (availability === "downloadable" || availability === "downloading") {
      setLanguageProgress("Preparing the browser's on-device Hindi language pack…", "HI ↓");
    }

    translatorInstance = await window.Translator.create({
      ...TRANSLATOR_OPTIONS,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const percent = Math.max(0, Math.min(100, Math.round(Number(event.loaded || 0) * 100)));
          setLanguageProgress(`Downloading the browser's Hindi language pack: ${percent}%`, `HI ${percent}%`);
        });
      }
    });
    return translatorInstance;
  }

  function restoreOriginalEnglish() {
    translationGeneration += 1;
    stopTranslationObserver();
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
    if (translatorInstance) {
      try {
        if (typeof translatorInstance.destroy === "function") translatorInstance.destroy();
      } catch (_) {}
      translatorInstance = null;
    }
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
    }
    setLanguageProgress("Hindi translation is unavailable in this browser.", "");
    showTranslationHelp(error);
  }

  function enqueueTranslation(scope, announceProgress = false) {
    if (language !== "hi") return Promise.resolve();
    const generation = translationGeneration;
    queuedTranslationJobs += 1;
    if (queuedTranslationJobs === 1) {
      setLanguageProgress(
        announceProgress ? "Translating this page to Hindi on your device…" : "Translating newly added content to Hindi on your device…",
        "HI …"
      );
    }
    refreshTranslationBusy();
    const job = translationQueue.then(() => translateScope(scope, generation, announceProgress));
    const handled = job.catch((error) => handleTranslationFailure(error));
    translationQueue = handled;
    return handled.finally(() => {
      queuedTranslationJobs = Math.max(0, queuedTranslationJobs - 1);
      if (!queuedTranslationJobs) {
        setLanguageProgress(language === "hi" ? "Hindi translation is ready and remains on this device." : languageStatus, "");
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

    preparingTranslation = true;
    setLanguageProgress("Checking for the browser's on-device Hindi translator…", "HI …");
    refreshTranslationBusy();
    try {
      await ensureNativeTranslator();
      translationGeneration += 1;
      setLanguageState("hi");
      startTranslationObserver();
      preparingTranslation = false;
      refreshTranslationBusy();
      PF.toast("Translating this page to Hindi on your device…");
      await enqueueTranslation(document.body, true);
      if (language === "hi") PF.toast("Hindi translation is ready. Use EN to restore the original instantly.");
    } catch (error) {
      preparingTranslation = false;
      refreshTranslationBusy();
      handleTranslationFailure(error);
    }
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
          <span>Pigsfield<small>India's open learning map</small></span>
        </a>
        <nav class="site-nav" id="site-nav" aria-label="Primary navigation">
          ${navLink("learn", "Learn")}
          ${navLink("skills", "Skills")}
          ${navLink("tools", "Tools")}
          ${navLink("exams", "Exams")}
          ${navLink("watch", "PigBang")}
          ${navLink("rights", "Make Government Accountable")}
          ${navLink("about", "About")}
        </nav>
        <div class="header-actions">
          <button class="search-trigger" type="button" data-open-search aria-label="Search all Pigsfield resources">
            <b aria-hidden="true">⌕</b><span>Search</span><kbd>Ctrl K</kbd>
          </button>
          <button class="icon-button saved-trigger" type="button" data-open-saved aria-label="Open saved resources" title="Saved resources">♡</button>
          <button class="icon-button lang-toggle" type="button" data-lang-toggle translate="no" aria-label="Translate this page to Hindi on this device" title="Translate this page to Hindi on this device">हिन्दी</button>
          <span class="sr-only" id="translation-live-status" role="status" aria-live="polite" translate="no"></span>
          <button class="icon-button" type="button" data-theme-toggle aria-label="Change theme">☾</button>
          <button class="icon-button menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open navigation">≡</button>
        </div>
      </div>`;
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
            <p>Education within reach: learn freely, build skills and make government accountable. A volunteer-led, free-first discovery platform built for people across India.</p>
          </div>
          <div>
            <div class="footer-title">Explore</div>
            <div class="footer-links">
              ${navLink("learn", "Nursery to PhD")}${navLink("skills", "Teacher training & skills")}${navLink("tools", "Digital tools")}${navLink("exams", "Competitive exams")}
            </div>
          </div>
          <div>
            <div class="footer-title">Mission</div>
            <div class="footer-links">
              ${navLink("watch", "PigBang")}${navLink("rights", "Make Government Accountable")}${navLink("about", "Why Pigsfield")}${navLink("submit", "Suggest a resource")}
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
        <button class="support-action ai-action" type="button" data-open-ai><span class="ai-dock-mark" aria-hidden="true">🧠</span> AI Studio</button>
        <button class="support-action" type="button" data-open-donate><span aria-hidden="true">♥</span> Donate</button>
        <button class="support-action feedback" type="button" data-open-feedback><span aria-hidden="true">✦</span> Feedback</button>
      </aside>

      <dialog class="site-dialog ai-studio-dialog" id="ai-studio-dialog" aria-labelledby="global-ai-title">
        <div class="dialog-head ai-dialog-head">
          <h2 id="global-ai-title"><span aria-hidden="true">🧠</span> AI Studio</h2>
          <button class="icon-button" type="button" data-close-dialog aria-label="Close AI studio">×</button>
        </div>
        <div class="dialog-body ai-dialog-body">
          <div id="global-ai-studio-mount"><div class="ai-studio-loading" role="status"><strong>🧠 Loading…</strong></div></div>
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
        <div class="dialog-head"><h2 id="translation-help-title">Use your browser's page translator</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close translation help">×</button></div>
        <div class="dialog-body">
          <p id="translation-help-reason">On-device Hindi translation is not available to this website in the current browser.</p>
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
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
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

  function trackUse(item) {
    const recent = readJson("pf-recent-v2", []);
    const clean = Array.isArray(recent) ? recent.filter((entry) => entry.url !== item.url) : [];
    clean.unshift({ title: item.title, url: item.url, at: Date.now() });
    setJson("pf-recent-v2", clean.slice(0, 20));
  }

  PF.openExternal = function (url, title = "Resource") {
    const safe = PF.safeUrl(url);
    if (!safe) {
      PF.toast("This link could not be opened safely.");
      return;
    }
    trackUse({ title, url: safe });
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
          const id = PF.slug(`${item.title}-${sectionIndex + 1}-${groupIndex + 1}-${itemIndex + 1}`);
          entries.push({
            title: item.title || item.desc || "Resource",
            description: item.desc || group.title || section.title || "",
            section: dataLabels[key],
            url: `${PF.path(dataPages[key])}#${encodeURIComponent(id)}`,
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
      entries.push({ title: `${row.subject} NCERT roadmap`, description: row.books || "UPSC, RAS and SSC reading path", section: "Exams", url: `${PF.path("exams")}#${id}`, haystack: JSON.stringify(row).toLowerCase() });
    });
    (data.common && data.common.subjects || []).forEach((subject) => {
      const id = `subject-${PF.slug(subject.subject)}`;
      entries.push({ title: subject.subject, description: `${subject.exam || "Competitive exams"} courses, marathons and books`, section: "Exams", url: `${PF.path("exams")}#${id}`, haystack: JSON.stringify(subject).toLowerCase() });
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
    const kinds = ["catalog-section", "catalog-group", "exam-panel", "faq-item", "resource-notes"];
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

    const heroForm = qs("#hero-search-form");
    if (heroForm) heroForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = qs("input", heroForm);
      openSearch(input.value.trim());
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
    buildFooter();
    dialogMarkup();
    initializeAccordions();
    bindUi();
    setTheme(root.dataset.theme || initialTheme());
    setLanguageState("en");
    registerServiceWorker();
    document.documentElement.classList.add("js-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
