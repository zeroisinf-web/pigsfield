(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const counter = document.querySelector("#monthly-visitors");
  const countTarget = counter && counter.querySelector("[data-monthly-visitor-count]");
  const labelTarget = counter && counter.querySelector("[data-monthly-visitor-label]");
  const noteTarget = counter && counter.querySelector("small");
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
      timeZone: "Asia/Kolkata"
    }).format(date);
  }

  async function loadMonthlyVisitors() {
    if (!counter || !countTarget || !labelTarget) return;
    try {
      const response = await fetch("/api/visitors", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error("Visitor count unavailable");
      const data = await response.json();
      const count = Number(data && data.count);
      if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid visitor count");

      countTarget.textContent = new Intl.NumberFormat("en-IN").format(count);
      labelTarget.textContent = count === 1 ? "visitor check-in this month" : "visitor check-ins this month";
      const started = formatStartDate(data.startedAt);
      if (noteTarget && started) {
        noteTarget.textContent = `Best-effort since ${started}, usually one check-in per browser. No account or visitor profile.`;
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
    if ("requestIdleCallback" in window) window.requestIdleCallback(loadMonthlyVisitors, { timeout: 1200 });
    else window.setTimeout(loadMonthlyVisitors, 120);
  }
})();
