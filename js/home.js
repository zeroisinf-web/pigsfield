(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const counter = document.querySelector("#visitor-counter");
  const periodTarget = counter && counter.querySelector("[data-visitor-period]");
  const totalTarget = counter && counter.querySelector("[data-visitor-total]");
  const noteTarget = counter && counter.querySelector("[data-visitor-note]");
  const guide = document.querySelector("[data-home-video]");
  let playerPromise = null;

  function loadPlayer() {
    if (PF.YouTube && typeof PF.YouTube.play === "function") return Promise.resolve(PF.YouTube);
    if (playerPromise) return playerPromise;
    playerPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "js/player.js?v=9e832378a791";
      script.async = true;
      script.onload = () => PF.YouTube && typeof PF.YouTube.play === "function"
        ? resolve(PF.YouTube)
        : reject(new Error("Video player unavailable"));
      script.onerror = () => reject(new Error("Video player unavailable"));
      document.head.appendChild(script);
    }).catch((error) => {
      playerPromise = null;
      throw error;
    });
    return playerPromise;
  }

  function formatStartDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata"
    }).format(date);
  }

  // Requests can finish out of order (the first read and an early check-in); only the newest
  // answer is drawn, so a slower read never paints over the count that includes this visit.
  let requested = 0;
  let drawn = 0;

  async function requestVisitorCounts(method) {
    const order = ++requested;
    const response = await fetch("/api/visitors", {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error("Visitor count unavailable");
    const data = await response.json();
    const period = Number(data && data.rolling);
    const total = Number(data && data.total);
    // The period can legitimately be 0 early on a quiet day; a total cannot, because it
    // carries every check-in since launch.
    if (!Number.isSafeInteger(period) || period < 0) throw new Error("Invalid visitor count");
    if (!Number.isSafeInteger(total) || total < 1) throw new Error("Invalid visitor total");
    if (order < drawn) return;
    drawn = order;

    const number = new Intl.NumberFormat("en-IN");
    periodTarget.textContent = number.format(period);
    totalTarget.textContent = number.format(total);
    const started = formatStartDate(data.startedAt);
    if (noteTarget) {
      noteTarget.textContent = `Best-effort count of real people: a browser is counted once a day, only after someone scrolls, taps or types. Bots, crawlers and cloud servers are left out.${started ? ` Counting since ${started}.` : ""}`;
    }
    counter.dataset.state = "ready";
  }

  function loadVisitorCounts() {
    if (!counter || !periodTarget || !totalTarget) return;
    requestVisitorCounts("GET").catch(() => {
      if (!drawn) counter.dataset.state = "unavailable";
    });
  }

  // The check-in waits for something a crawler does not do: a real tap, click, key press or
  // scroll gesture while the page is on screen. Browsers driven by automation announce it
  // through navigator.webdriver and are never counted. A restored scroll position is not a
  // person, so "scroll" itself is not one of the signals.
  function armCheckIn() {
    if (!counter || !periodTarget || !totalTarget || navigator.webdriver) return;
    const signals = ["pointerdown", "keydown", "touchstart", "wheel"];
    const options = { capture: true, passive: true };
    const checkIn = (event) => {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      signals.forEach((name) => window.removeEventListener(name, checkIn, options));
      requestVisitorCounts("POST").catch(() => {});
    };
    signals.forEach((name) => window.addEventListener(name, checkIn, options));
  }

  if (guide) {
    guide.addEventListener("click", async (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      try {
        const player = await loadPlayer();
        player.play(guide.href, guide.dataset.title || "How to use Pigsfield");
      } catch (_) {
        window.location.assign(guide.href);
      }
    });
    const warmPlayer = () => { loadPlayer().catch(() => {}); };
    guide.addEventListener("pointerenter", warmPlayer, { once: true });
    guide.addEventListener("focus", warmPlayer, { once: true });
  }

  if (counter) {
    if ("requestIdleCallback" in window) window.requestIdleCallback(loadVisitorCounts, { timeout: 1200 });
    else window.setTimeout(loadVisitorCounts, 120);
    armCheckIn();
  }
})();
