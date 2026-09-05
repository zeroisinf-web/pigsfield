(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const counter = document.querySelector("#visitor-counter");
  const rollingTarget = counter && counter.querySelector("[data-visitor-rolling]");
  const totalTarget = counter && counter.querySelector("[data-visitor-total]");
  const noteTarget = counter && counter.querySelector("[data-visitor-note]");
  const guide = document.querySelector("[data-home-video]");
  let playerPromise = null;

  function loadPlayer() {
    if (PF.YouTube && typeof PF.YouTube.play === "function") return Promise.resolve(PF.YouTube);
    if (playerPromise) return playerPromise;
    playerPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "js/player.js";
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

  async function loadVisitorCounts() {
    if (!counter || !rollingTarget || !totalTarget) return;
    try {
      const response = await fetch("/api/visitors", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error("Visitor count unavailable");
      const data = await response.json();
      const rolling = Number(data && data.rolling);
      const total = Number(data && data.total);
      // The rolling window can legitimately be 0 on a quiet day; a total cannot, because
      // this very request just added to it.
      if (!Number.isSafeInteger(rolling) || rolling < 0) throw new Error("Invalid visitor count");
      if (!Number.isSafeInteger(total) || total < 1) throw new Error("Invalid visitor total");

      const number = new Intl.NumberFormat("en-IN");
      rollingTarget.textContent = number.format(rolling);
      totalTarget.textContent = number.format(total);
      const started = formatStartDate(data.startedAt);
      if (noteTarget) {
        noteTarget.textContent = started
          ? `Best-effort, usually one check-in per browser each day. Counting since ${started}. No account or visitor profile.`
          : "Best-effort, usually one check-in per browser each day. No account or visitor profile.";
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
