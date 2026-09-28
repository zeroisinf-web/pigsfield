(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const counter = document.querySelector("#visitor-counter");
  const periodTarget = counter && counter.querySelector("[data-visitor-period]");
  const periodLabel = counter && counter.querySelector("[data-visitor-period-label]");
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

  /** "2026-09" → "September", read in UTC because Cloudflare's days are UTC days. */
  function monthName(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    return new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(date);
  }

  async function loadVisitorCounts() {
    if (!counter || !periodTarget || !totalTarget) return;
    try {
      const response = await fetch("/api/visitors", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error("Visitor count unavailable");
      const data = await response.json();
      const fromCloudflare = data && data.source === "cloudflare";
      // Cloudflare answers with a calendar month; the fallback check-in counter answers with
      // a rolling 30 days. Each figure is labelled with what it actually covers.
      const period = Number(data && (fromCloudflare ? data.monthUniques : data.rolling));
      const total = Number(data && data.total);
      // The period can legitimately be 0 early on a quiet day; a total cannot, because
      // this very visit is part of it.
      if (!Number.isSafeInteger(period) || period < 0) throw new Error("Invalid visitor count");
      if (!Number.isSafeInteger(total) || total < 1) throw new Error("Invalid visitor total");

      const number = new Intl.NumberFormat("en-IN");
      periodTarget.textContent = number.format(period);
      totalTarget.textContent = number.format(total);
      if (fromCloudflare) {
        const month = monthName(data.month);
        const since = formatStartDate(data.firstDay);
        if (periodLabel) periodLabel.textContent = month ? `unique visitors in ${month}` : "unique visitors this month";
        if (totalLabel) totalLabel.textContent = since ? `unique visitors since ${since}` : "unique visitors since launch";
        if (noteTarget) {
          noteTarget.textContent = `Counted by Cloudflare: unique visitors on each day, added up — someone who returns on another day counts again, and some automated traffic is included. ${data.stale ? "Showing the last figures Cloudflare gave." : "Updated hourly."}`;
        }
      } else {
        const started = formatStartDate(data.startedAt);
        if (noteTarget) {
          noteTarget.textContent = started
            ? `Best-effort, usually one check-in per browser each day. Counting since ${started}. No account or visitor profile.`
            : "Best-effort, usually one check-in per browser each day. No account or visitor profile.";
        }
      }
      counter.dataset.state = "ready";
    } catch (_) {
      counter.dataset.state = "unavailable";
    }
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
  }
})();
