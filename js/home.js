(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const counter = document.querySelector("#visitor-counter");
  const periodTarget = counter && counter.querySelector("[data-visitor-period]");
  const totalTarget = counter && counter.querySelector("[data-visitor-total]");
  const totalLabel = counter && counter.querySelector("[data-visitor-total-label]");
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
    const total = Number(data && data.people);
    // The period can legitimately be 0 early on a quiet day; the people total cannot, because
    // it carries every check-in since launch.
    if (!Number.isSafeInteger(period) || period < 0) throw new Error("Invalid visitor count");
    if (!Number.isSafeInteger(total) || total < 1) throw new Error("Invalid visitor total");
    if (order < drawn) return;
    drawn = order;

    const number = new Intl.NumberFormat("en-IN");
    periodTarget.textContent = number.format(period);
    totalTarget.textContent = number.format(total);
    const since = formatStartDate(data.peopleSince);
    if (totalLabel && since) totalLabel.textContent = `real people since ${since}`;
    if (noteTarget) {
      noteTarget.textContent = "Best-effort count of real people, not bots: each browser counts once a day as a visit and once ever as a person, only after someone scrolls, taps or types. People before October 2026 are estimated from earlier visits.";
    }
    counter.dataset.state = "ready";
  }

  function loadVisitorCounts() {
    if (!counter || !periodTarget || !totalTarget) return;
    requestVisitorCounts("GET").catch(() => {
      if (!drawn) counter.dataset.state = "unavailable";
    });
  }

  // The 30-day figure is live: it is re-read every minute while the page is on screen, and
  // again when someone comes back to the tab, so other people's visits show up as they happen.
  const REFRESH_MS = 60000;
  function keepVisitorCountsLive() {
    if (!counter || !periodTarget || !totalTarget) return;
    window.setInterval(() => {
      if (document.visibilityState === "visible") requestVisitorCounts("GET").catch(() => {});
    }, REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && drawn) requestVisitorCounts("GET").catch(() => {});
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
    keepVisitorCountsLive();
  }
})();
