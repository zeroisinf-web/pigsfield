/* Pigsfield — core helpers: state, i18n, logo, YouTube parsing, favorites, toast */
(function () {
  "use strict";
  const PF = (window.PF = {});

  /* ---------------- state ---------------- */
  PF.state = {
    lang: localStorage.getItem("pf-lang") || "en",
    theme: localStorage.getItem("pf-theme") ||
      (matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  };

  PF.t = function (key) {
    const d = window.PF_I18N[PF.state.lang] || window.PF_I18N.en;
    return key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), d)
        ?? key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : key), window.PF_I18N.en);
  };

  /* ---------------- MAIN logo: desi grey pig snout with 3D wireframe grid ----------------
     A rounded squircle snout (slate grey, 3D-shaded) wrapped in a fine mesh grid, with two
     recessed nostril holes — matches the Pigsfield brand mark. Unique gradient/clip ids per
     call so multiple inline copies don't collide. */
  PF._lid = 0;
  PF.pigLogo = function (size) {
    const u = "pl" + (++PF._lid);
    const SQ = "M32 13 C42 13 50 15 54 20 C57 25 57 39 54 44 C50 50 42 53 32 53 C22 53 14 50 10 44 C7 39 7 25 10 20 C14 15 22 13 32 13 Z";
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" ${size ? `width="${size}" height="${size}"` : ""} aria-hidden="true">
      <defs>
        <radialGradient id="${u}g" cx="50%" cy="36%" r="70%">
          <stop offset="0" stop-color="#dad8dd"/><stop offset=".55" stop-color="#aeabb3"/><stop offset="1" stop-color="#827f88"/>
        </radialGradient>
        <clipPath id="${u}c"><path d="${SQ}"/></clipPath>
      </defs>
      <path d="${SQ}" fill="url(#${u}g)" stroke="#5f5b66" stroke-width="2.6"/>
      <g clip-path="url(#${u}c)" stroke="#ffffff" stroke-opacity=".55" stroke-width=".9" fill="none">
        <path d="M32 12 C31 28 31 38 32 54"/>
        <path d="M23 13 C18 28 18 40 25 53"/><path d="M41 13 C46 28 46 40 39 53"/>
        <path d="M15 17 C11 30 12 42 20 51"/><path d="M49 17 C53 30 52 42 44 51"/>
        <path d="M9 23 C24 19 40 19 55 23"/><path d="M8 32 C24 30 40 30 56 32"/>
        <path d="M9 41 C24 46 40 46 55 41"/><path d="M14 48 C24 51 40 51 50 48"/>
      </g>
      <g>
        <ellipse cx="24" cy="34" rx="6.2" ry="9.2" fill="#4f4c56"/>
        <ellipse cx="24" cy="33.4" rx="5.1" ry="8.1" fill="#fbfbfc"/>
        <ellipse cx="40" cy="34" rx="6.2" ry="9.2" fill="#4f4c56"/>
        <ellipse cx="40" cy="33.4" rx="5.1" ry="8.1" fill="#fbfbfc"/>
      </g>
    </svg>`;
  };
  /* alias kept so existing callers keep working */
  PF.noseLogo = function () { return PF.pigLogo(); };

  /* ---------------- PigBang logo: grey "big bang" starburst with pig-nose core ----------------
     Many radiating tapered rays + scattered sparks in greys, with two white nostril
     teardrops at the centre. Rays generated so it reads as a firework explosion. */
  PF.pigbangLogo = function (size) {
    const cx = 36, cy = 36, greys = ["#4a4750", "#615d67", "#7d7984", "#9c98a3", "#56525c", "#888491"];
    let rays = "";
    const N = 34;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const inner = 8 + (i % 3 ? 0 : 1);
      const len = 9 + ((i * 7) % 11) + (i % 2 ? 5 : 0);     // 9..24
      const x1 = cx + Math.cos(a) * inner, y1 = cy + Math.sin(a) * inner;
      const x2 = cx + Math.cos(a) * (inner + len), y2 = cy + Math.sin(a) * (inner + len);
      const w = (1.1 + (i % 4) * 0.7).toFixed(1);
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${greys[i % greys.length]}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    let dots = "";
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + 0.4, r = 30 + (i % 3) * 3.5;
      dots += `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="${(0.8 + (i % 2) * 0.9).toFixed(1)}" fill="${greys[(i + 2) % greys.length]}"/>`;
    }
    const nose =
      `<ellipse cx="30.5" cy="38" rx="4" ry="6.4" fill="#fbfbfc" stroke="#615d68" stroke-width="1.4" transform="rotate(-9 30.5 38)"/>` +
      `<ellipse cx="41.5" cy="38" rx="4" ry="6.4" fill="#fbfbfc" stroke="#615d68" stroke-width="1.4" transform="rotate(9 41.5 38)"/>`;
    return `<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" ${size ? `width="${size}" height="${size}"` : ""} aria-hidden="true">${rays}${dots}${nose}</svg>`;
  };

  /* ---------------- brand icons for link chips (YouTube + OTT) ---------------- */
  PF.BRAND_SVG = {
    youtube: '<svg viewBox="0 0 28 20"><rect width="28" height="20" rx="5" fill="#FF0000"/><path d="M11 5.5 L20 10 L11 14.5 Z" fill="#fff"/></svg>',
    netflix: '<svg viewBox="0 0 14 20"><path d="M2 0h3l4.2 11V0H12v20l-2.8.2L5 8.4V20H2z" fill="#E50914"/></svg>',
    prime: '<svg viewBox="0 0 28 20"><rect width="28" height="20" rx="4" fill="#00A8E1"/><text x="14" y="13.5" font-size="8" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">prime</text></svg>',
    hotstar: '<svg viewBox="0 0 20 20"><path d="M10 1l2.2 5.6 6 .3-4.7 3.8 1.7 5.8L10 13.9 4.8 16.3l1.7-5.8L1.8 6.9l6-.3z" fill="#1f80e0"/></svg>',
  };
  PF.brandKey = function (linkKey) {
    if (["video", "playlist", "channel", "ytsearch"].includes(linkKey)) return "youtube";
    if (["netflix", "hotstar", "prime"].includes(linkKey)) return linkKey;
    return null;
  };
  // returns an HTML span: brand SVG when one exists, else the emoji
  PF.chipIcon = function (linkKey, emoji) {
    const b = PF.brandKey(linkKey);
    if (b) return `<span class="lico ${b}">${PF.BRAND_SVG[b]}</span>`;
    return `<span class="lemo">${emoji || "🔗"}</span>`;
  };

  /* ---------------- app registry (filled by app modules) ---------------- */
  PF.apps = {};   // id -> {icon, color, render(winBody), search()}
  PF.appOrder = ["school", "teach", "tools", "exams", "pigbang", "govt", "about"];
  PF.appMeta = {
    school:  { glyph: "🎓", color: "linear-gradient(135deg,#e84f7d,#b03060)" },
    teach:   { glyph: "🧑‍🏫", color: "linear-gradient(135deg,#8a5fc4,#5b3a8e)" },
    tools:   { glyph: "🛠️", color: "linear-gradient(135deg,#4f8fe8,#2f5fb0)" },
    exams:   { glyph: "🏆", color: "linear-gradient(135deg,#e8a04f,#c06a18)" },
    pigbang: { glyph: "", color: "linear-gradient(135deg,#ff5c8d,#8a1538)" },  // nose svg
    govt:    { glyph: "⚖️", color: "linear-gradient(135deg,#6e6e76,#3c3c44)" },
    about:   { glyph: "", color: "linear-gradient(135deg,#f4a7bd,#e8628c)" },  // pig svg
  };
  PF.appIcon = function (id) {
    const m = PF.appMeta[id];
    if (id === "about") return PF.pigLogo();
    if (id === "pigbang") return PF.pigbangLogo();
    return m ? m.glyph : "📦";
  };

  /* ---------------- YouTube parsing ---------------- */
  PF.parseYouTube = function (url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const h = u.hostname.replace(/^www\.|^m\./, "");
    if (h === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id ? { type: "video", id, list: u.searchParams.get("list") } : null;
    }
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(h)) return null;
    const p = u.pathname;
    const list = u.searchParams.get("list");
    if (p === "/watch") {
      const id = u.searchParams.get("v");
      return id ? { type: "video", id, list } : (list ? { type: "playlist", id: list } : null);
    }
    let m = p.match(/^\/(?:live|shorts|embed)\/([\w-]{6,})/);
    if (m) return { type: "video", id: m[1], list };
    if (p === "/playlist" && list) return { type: "playlist", id: list };
    return { type: "page" }; // channel/@handle/search — not embeddable
  };
  PF.ytEmbedUrl = function (info) {
    if (!info) return null;
    // Use youtube.com (more permissive for embedding than nocookie) and pass a valid
    // &origin so the player can verify the host — this is what fixes player error 153/150.
    const origin = /^https?:$/.test(location.protocol)
      ? "&origin=" + encodeURIComponent(location.origin) : "";
    const common = "?autoplay=1&rel=0&playsinline=1&enablejsapi=1&modestbranding=1" + origin;
    if (info.type === "video")
      return "https://www.youtube.com/embed/" + info.id + common +
             (info.list ? "&list=" + encodeURIComponent(info.list) : "");
    if (info.type === "playlist")
      return "https://www.youtube.com/embed/videoseries" + common +
             "&list=" + encodeURIComponent(info.id);
    return null;
  };
  PF.isEmbeddable = function (url) {
    const i = PF.parseYouTube(url);
    return !!(i && (i.type === "video" || i.type === "playlist"));
  };

  /* ---------------- link opener ----------------
     The in-site embedded player was removed by request — every link opens directly
     in a new tab (most reliable; no YouTube embedding restrictions). */
  PF.openLink = function (url) {
    if (url) window.open(url, "_blank", "noopener");
  };
  PF.openPlayer = function (url) { PF.openLink(url); };   // back-compat no-op shims
  PF.closePlayer = function () {};
  PF.embedOn = false;

  /* ---------------- favorites ---------------- */
  const FKEY = "pf-favs";
  PF.favs = JSON.parse(localStorage.getItem(FKEY) || "[]");
  PF.isFav = (id) => PF.favs.some((f) => f.id === id);
  PF.toggleFav = function (fav) {
    const i = PF.favs.findIndex((f) => f.id === fav.id);
    if (i >= 0) PF.favs.splice(i, 1); else PF.favs.unshift(fav);
    PF.favs = PF.favs.slice(0, 60);
    localStorage.setItem(FKEY, JSON.stringify(PF.favs));
    if (PF.renderStartFavs) PF.renderStartFavs();
  };

  /* ---------------- recents (PigBang) ---------------- */
  const RKEY = "pf-recent";
  PF.recents = JSON.parse(localStorage.getItem(RKEY) || "[]");
  PF.pushRecent = function (entry) {
    PF.recents = PF.recents.filter((r) => r.name !== entry.name);
    PF.recents.unshift(entry);
    PF.recents = PF.recents.slice(0, 20);
    localStorage.setItem(RKEY, JSON.stringify(PF.recents));
  };

  /* ---------------- smart link naming ---------------- */
  PF.linkKey = function (url, colLabel) {
    const u = String(url).toLowerCase();
    if (u.includes("results?search_query")) return "ytsearch";
    const yt = PF.parseYouTube(url);
    if (yt) {
      if (yt.type === "video") return "video";
      if (yt.type === "playlist") return "playlist";
      return "channel";
    }
    if (u.includes("play.google.")) return "androidApp";
    if (u.includes("apps.apple.")) return "iosApp";
    if (u.includes("scribd.")) return "bookpdf";
    if (/\.pdf(\?|#|$)/.test(u)) return "pdf";
    if (u.includes("drive.google.") || u.includes("1drv.ms") || u.includes("share.google")) return "drive";
    if (u.includes("amzn.") || u.includes("amazon.")) return "amazon";
    if (u.includes("flipkart.")) return "flipkart";
    if (u.includes("t.me/") || u.includes("telegram.")) return "telegram";
    if (u.includes("github.")) return "github";
    if (u.includes("archive.org")) return "archive";
    if (u.includes("netflix.")) return "netflix";
    if (u.includes("hotstar.")) return "hotstar";
    if (u.includes("primevideo.")) return "prime";
    if (u.includes("jiocinema.") || u.includes("sonyliv.") || u.includes("zee5.") ||
        u.includes("cineby.") || u.includes("themoviebox") || u.includes("yarrlist")) return "ott";
    if (u.includes("textbook")) return "textbooks";
    if (/^app/i.test(String(colLabel || ""))) return "androidApp";
    if (/tutorial/.test(String(colLabel || "").toLowerCase())) return "tutorial";
    if (u.includes("coursera.") || u.includes("edx.org") || u.includes("swayam") || u.includes("nptel")) return "course";
    return "website";
  };
  PF.LN_EMOJI = {
    website: "🌐", textbooks: "📚", video: "▶️", playlist: "🎞️", channel: "📺",
    ytsearch: "🔎", androidApp: "📱", iosApp: "📱", pdf: "📄", bookpdf: "📕",
    drive: "🗂️", amazon: "🛒", flipkart: "🛒", telegram: "✈️", github: "💻",
    archive: "🎬", netflix: "🎬", hotstar: "🎬", prime: "🎬", ott: "🎬",
    tutorial: "🎓", course: "🎓",
  };

  /* friendly, recognizable names for common sites (first match wins) */
  PF.SITE_NAMES = [
    [/ncert\.nic\.in/, "NCERT"], [/epathshala/, "ePathshala"], [/diksha\.gov/, "DIKSHA"],
    [/swayam(-plus|2)?\.|swayam\.gov/, "SWAYAM"], [/nptel/, "NPTEL"],
    [/egyankosh|ignou/, "IGNOU"], [/khanacademy/, "Khan Academy"], [/vedantu/, "Vedantu"],
    [/magnetbrains/, "Magnet Brains"], [/missiongyan/, "Mission Gyan"],
    [/learnohub|examfear/, "LearnoHub"], [/tiwariacademy/, "Tiwari Academy"],
    [/nexttoppers/, "Next Toppers"], [/vmou/, "VMOU"], [/cec\.nic|cecugc|cecgurukul/, "CEC-UGC"],
    [/vlab\.co\.in/, "Virtual Labs"], [/spoken-tutorial/, "Spoken Tutorial"],
    [/inflibnet|shodhganga|shodhgangotri|ndl\.gov|ess\.inflibnet/, "INFLIBNET"],
    [/play\.google/, "Play Store"], [/apps\.apple/, "App Store"], [/scribd/, "Scribd"],
    [/drive\.google/, "Google Drive"], [/docs\.google|drive\.google/, "Google Docs"],
    [/colab\.research/, "Google Colab"], [/(^|\/\/|\.)(amzn|amazon)\./, "Amazon"],
    [/flipkart/, "Flipkart"], [/t\.me|telegram/, "Telegram"], [/github/, "GitHub"],
    [/archive\.org/, "Archive.org"], [/netflix/, "Netflix"], [/hotstar/, "Hotstar"],
    [/primevideo/, "Prime Video"], [/wikipedia/, "Wikipedia"], [/coursera/, "Coursera"],
    [/edx\.org/, "edX"], [/mit\.edu|ocw\.mit/, "MIT"], [/byjus/, "BYJU'S"],
    [/drishtiias/, "Drishti IAS"], [/upsc\.gov/, "UPSC"], [/rpsc\.rajasthan/, "RPSC"],
    [/cbseacademic|cbse\.gov/, "CBSE"], [/nios/, "NIOS"], [/pmevidya/, "PM eVIDYA"],
    [/grammarly/, "Grammarly"], [/zotero/, "Zotero"], [/mendeley/, "Mendeley"],
  ];
  PF.siteName = function (url) {
    const lu = String(url).toLowerCase();
    for (const [re, n] of PF.SITE_NAMES) if (re.test(lu)) return n;
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return PF.domain(url); }
    const skip = new Set(["www", "m", "app", "apps", "play", "web", "online", "portal",
      "store", "mobile", "en", "hi", "in", "go", "secure"]);
    const parts = host.replace(/^www\./, "").split(".").filter(Boolean);
    let core = parts.find((p) => !skip.has(p)) || parts[0] || host;
    return core.charAt(0).toUpperCase() + core.slice(1);
  };
  PF.linkName = function (url, colLabel) {
    const k = PF.linkKey(url, colLabel);
    const site = PF.siteName(url);
    const emoji = PF.LN_EMOJI[k] || "🔗";
    const tpl = {
      video: PF.t("ln.watchVideo"), playlist: PF.t("ln.ytPlaylist"),
      channel: PF.t("ln.ytChannel"), ytsearch: PF.t("ln.findTut"),
      androidApp: PF.t("ln.playStore"), iosApp: PF.t("ln.appStore"),
      bookpdf: PF.t("ln.readOn"), pdf: PF.t("ln.downloadPdf"),
      drive: PF.t("ln.drive"), amazon: PF.t("ln.buyOn"), flipkart: PF.t("ln.buyOn"),
      telegram: "Telegram", github: "GitHub", archive: PF.t("ln.watchFree"),
      netflix: PF.t("ln.watchOn"), hotstar: PF.t("ln.watchOn"),
      prime: PF.t("ln.watchOn"), ott: PF.t("ln.watchOn"),
      textbooks: PF.t("ln.booksOf"), course: PF.t("ln.courseOf"),
      tutorial: PF.t("ln.tutorial"), website: "{s}",
    }[k] || "{s}";
    return { key: k, emoji, site, name: tpl.replace("{s}", site) };
  };
  /* filter bucket for a url: web / yt / app / pdf */
  PF.linkBucket = function (url, colLabel) {
    const k = PF.linkKey(url, colLabel);
    if (["video", "playlist", "channel", "ytsearch"].includes(k)) return "yt";
    if (["androidApp", "iosApp"].includes(k)) return "app";
    if (["pdf", "bookpdf", "drive"].includes(k)) return "pdf";
    return "web";
  };

  /* ---------------- card subject symbols ---------------- */
  PF.EMOJI_RULES = [
    [/teacher|pedagog|b\.?ed\b|d\.el\.ed|शिक्षक|nishtha|ctet|uptet|tet\b/i, "🧑‍🏫"],
    [/\bai\b|artificial intel|machine learning|chatgpt|gemini|claude|deepmind|notebooklm|\bllm\b/i, "🤖"],
    [/robot/i, "🦾"],
    [/coding|programm|python|java|scratch|computer|software|developer|github|कोडिंग|full stack|web dev/i, "💻"],
    [/cyber|security|privacy|password|pwned|whistle|\btor\b/i, "🛡️"],
    [/space|isro|nasa|astronom|antriksh/i, "🚀"],
    [/biolog|neet\b|medical|जीव विज्ञान|anatomy/i, "🧬"],
    [/chemi|रसायन/i, "⚗️"],
    [/physic|भौतिक/i, "⚛️"],
    [/reasoning|logic|puzzle|तर्क|mental ability/i, "🧠"],
    [/math|algebra|quant|aptitude|arithmetic|गणित|mensuration/i, "➗"],
    [/english|grammar|vocab|phonics|अंग्रेज़|spelling/i, "🔤"],
    [/\bhindi\b|हिन्दी व्याकरण|संस्कृत/i, "✍️"],
    [/histor|इतिहास|heritage|culture|संस्कृति|art form/i, "🏛️"],
    [/geograph|भूगोल|atlas|mapping/i, "🌍"],
    [/polity|constitution|संविधान|governance|writ|court|न्याय|कानून|law\b|pil\b/i, "⚖️"],
    [/econom|अर्थव्यवस्था|budget|bank|finance|tax|money/i, "💰"],
    [/environment|ecolog|climate|पर्यावरण/i, "🌿"],
    [/current affairs|समसामयिक|daily news/i, "📰"],
    [/चुनाव|election|vote|nota|affidavit/i, "🗳️"],
    [/मानवाधिकार|human rights|nhrc|ncw\b|ncpcr/i, "🕊️"],
    [/शिकायत|complaint|grievance|lokpal|lokayukta|vigilance|\bacb\b|\bcbi\b|भ्रष्टाचार|corruption/i, "📢"],
    [/सूचना का अधिकार|\brti\b|cag\b/i, "📜"],
    [/पंचायत|gram sabha|social audit|जन सुनवाई|mgnrega/i, "👥"],
    [/exam|mock|test|pyq|परीक्षा|syllabus|prelims|mains|question/i, "📝"],
    [/music|rhyme|song|गीत|संगीत|poem/i, "🎵"],
    [/story|stories|कहानी|tales|fairy/i, "📖"],
    [/movie|film|cinema|netflix|series|\bshow\b|documentary/i, "🎬"],
    [/game|गेम|play.based/i, "🎮"],
    [/skill|vocational|\biti\b|कौशल|internship|career|apprentice/i, "🛠️"],
    [/research|phd|thesis|journal|scholar|शोध|citation|plagiar/i, "🔬"],
    [/library|book|reading|literacy|पुस्तक|textbook/i, "📚"],
    [/mental health|manodarpan|yoga|wellbeing/i, "🧘"],
    [/kids|nursery|toddler|preschool|बच्च|early childhood/i, "🧸"],
    [/video edit|photo|image|design|figma|canva|creativ/i, "🎨"],
    [/\bpdf\b|document|file manager|cloud|storage/i, "🗂️"],
    [/blood|health|hospital|रक्त/i, "🏥"],
    [/science|विज्ञान|experiment/i, "🔬"],
  ];
  PF.cardEmoji = function (text, fallback) {
    for (const [re, e] of PF.EMOJI_RULES) if (re.test(text)) return e;
    return fallback || "📁";
  };

  /* ---------------- misc ---------------- */
  PF.esc = function (s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };
  PF.domain = function (url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 30); }
  };
  PF.toast = function (msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(PF._tt);
    PF._tt = setTimeout(() => (t.hidden = true), 1800);
  };
  PF.copy = function (text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => PF.toast(PF.t("copied")))
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove(); PF.toast(PF.t("copied"));
      });
  };
  /* deterministic gradient for poster art */
  PF.hashHue = function (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  PF.posterGrad = function (name) {
    const h = PF.hashHue(name || "pig");
    const palette = [
      ["#b03060", "#5e1430"], ["#7a4eb0", "#3a2260"], ["#2f5fb0", "#15294f"],
      ["#0f8a6d", "#0a3d31"], ["#c06a18", "#5e3208"], ["#a83a4e", "#471320"],
      ["#5b6ee1", "#252e6e"], ["#8a8a92", "#3c3c44"],
    ];
    const [a, b] = palette[h % palette.length];
    const deg = 100 + (h % 140);
    return `linear-gradient(${deg}deg, ${a}, ${b})`;
  };
})();
