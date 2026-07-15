(function () {
  "use strict";

  const PF = (window.PF = window.PF || {});
  const YT_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com"
  ]);
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,100}$/;

  function parseTime(value) {
    if (!value) return 0;
    if (/^\d+s?$/.test(value)) return Math.max(0, parseInt(value, 10) || 0);
    const match = String(value).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!match) return 0;
    return (parseInt(match[1], 10) || 0) * 3600 + (parseInt(match[2], 10) || 0) * 60 + (parseInt(match[3], 10) || 0);
  }

  function parse(url) {
    let parsed;
    try { parsed = new URL(url); } catch (_) { return null; }
    const host = parsed.hostname.toLowerCase();
    if (!YT_HOSTS.has(host) || parsed.protocol !== "https:") return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    let videoId = "";
    let playlistId = parsed.searchParams.get("list") || "";

    if (host === "youtu.be") videoId = segments[0] || "";
    else if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
    else if (["shorts", "live", "embed"].includes(segments[0]) && segments[1] !== "videoseries") videoId = segments[1] || "";
    else if (segments[0] === "embed" && segments[1] === "videoseries") playlistId = parsed.searchParams.get("list") || "";

    const start = parseTime(parsed.searchParams.get("start") || parsed.searchParams.get("t"));
    const index = Math.max(0, Math.min(9999, parseInt(parsed.searchParams.get("index"), 10) || 0));

    if (VIDEO_ID.test(videoId)) {
      return {
        kind: "video",
        videoId,
        playlistId: PLAYLIST_ID.test(playlistId) ? playlistId : "",
        start,
        index,
        original: parsed.href
      };
    }

    if ((parsed.pathname === "/playlist" || segments[1] === "videoseries") && PLAYLIST_ID.test(playlistId)) {
      return { kind: "playlist", playlistId, start, index, original: parsed.href };
    }

    return null;
  }

  function isYouTube(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && YT_HOSTS.has(parsed.hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function embedUrl(media) {
    const path = media.kind === "video" ? media.videoId : "videoseries";
    const url = new URL(`https://www.youtube-nocookie.com/embed/${path}`);
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("rel", "0");
    if (media.kind === "playlist") {
      url.searchParams.set("listType", "playlist");
      url.searchParams.set("list", media.playlistId);
    } else if (media.playlistId) {
      url.searchParams.set("list", media.playlistId);
    }
    if (media.start) url.searchParams.set("start", String(media.start));
    if (media.index) url.searchParams.set("index", String(media.index));
    if (/^https?:$/.test(location.protocol)) {
      url.searchParams.set("origin", location.origin);
      url.searchParams.set("widget_referrer", location.href);
    }
    return url.href;
  }

  let apiPromise = null;
  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const prior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prior === "function") prior();
        resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("YouTube Player API unavailable"));
      document.head.appendChild(script);
      setTimeout(() => {
        if (window.YT && window.YT.Player) resolve(window.YT);
      }, 4000);
    });
    return apiPromise;
  }

  let dialog;
  let frameHost;
  let errorBox;
  let sourceLink;
  let titleTarget;
  let activePlayer = null;
  let activeIframe = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "player-dialog";
    dialog.setAttribute("aria-labelledby", "player-title");
    dialog.innerHTML = `
      <div class="player-head">
        <strong id="player-title">Pigsfield player</strong>
        <button class="icon-button player-close" type="button" aria-label="Close video">×</button>
      </div>
      <div class="player-frame" id="player-frame"></div>
      <div class="player-error" id="player-error" role="status" hidden></div>
      <div class="player-fallback">
        <span>If playback is blocked by the owner, age settings or a privacy extension, use the original source.</span>
        <a class="button small ghost" id="player-source" target="_blank" rel="noopener">Watch on YouTube ↗</a>
      </div>`;
    document.body.appendChild(dialog);
    frameHost = dialog.querySelector("#player-frame");
    errorBox = dialog.querySelector("#player-error");
    sourceLink = dialog.querySelector("#player-source");
    titleTarget = dialog.querySelector("#player-title");
    dialog.querySelector(".player-close").addEventListener("click", close);
    dialog.addEventListener("cancel", () => close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    return dialog;
  }

  function close() {
    if (activePlayer && typeof activePlayer.destroy === "function") {
      try { activePlayer.destroy(); } catch (_) {}
    }
    activePlayer = null;
    if (activeIframe) {
      activeIframe.remove();
    }
    activeIframe = null;
    if (frameHost) frameHost.textContent = "";
    if (dialog && dialog.open) dialog.close();
  }

  function playerError(code) {
    const messages = {
      2: "This video address is invalid.",
      5: "The video could not play in this browser. Open it on YouTube instead.",
      100: "This video was removed or is private.",
      101: "The owner has disabled playback on other websites.",
      150: "The owner has disabled playback on other websites.",
      153: "Your browser or privacy extension suppressed the site identity YouTube requires. Allow referrers for this site, or open the video on YouTube."
    };
    errorBox.textContent = messages[code] || "YouTube could not play this item here. The original source is still available.";
    errorBox.hidden = false;
  }

  async function play(url, title) {
    const media = parse(url);
    if (!media) {
      if (isYouTube(url)) {
        PF.openExternal(url, title || "YouTube resource");
        PF.toast("This YouTube page is not a direct video or playlist, so it opened at the source.");
      } else PF.openExternal(url, title || "Resource");
      return;
    }

    close();
    ensureDialog();
    titleTarget.textContent = title || (media.kind === "playlist" ? "YouTube playlist" : "YouTube video");
    errorBox.hidden = true;
    errorBox.textContent = "";
    sourceLink.href = media.original;

    const iframe = document.createElement("iframe");
    iframe.id = `pf-youtube-${Date.now()}`;
    iframe.title = title ? `${title} — YouTube player` : "YouTube video player";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.loading = "eager";
    iframe.src = embedUrl(media);
    activeIframe = iframe;
    frameHost.appendChild(iframe);
    dialog.showModal();

    try {
      const YT = await loadApi();
      if (!activeIframe || activeIframe !== iframe || !document.contains(iframe)) return;
      activePlayer = new YT.Player(iframe, {
        events: {
          onError: (event) => playerError(Number(event.data)),
          onReady: () => {
            if (activeIframe === iframe) iframe.referrerPolicy = "strict-origin-when-cross-origin";
          }
        }
      });
    } catch (_) {
      // The iframe is still fully usable without the optional JavaScript API.
    }
  }

  PF.YouTube = { parse, isYouTube, embedUrl, play, close, parseTime };
})();
