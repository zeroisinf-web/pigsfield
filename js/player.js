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

    const officialPlaylistEmbed = segments[0] === "embed" && !segments[1] && parsed.searchParams.get("listType") === "playlist";
    if ((parsed.pathname === "/playlist" || segments[1] === "videoseries" || officialPlaylistEmbed) && PLAYLIST_ID.test(playlistId)) {
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
    const embed = media.kind === "video"
      ? `https://www.youtube-nocookie.com/embed/${media.videoId}`
      : "https://www.youtube-nocookie.com/embed/videoseries";
    const url = new URL(embed);
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("controls", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("rel", "0");
    if (media.playlistId) {
      url.searchParams.set("listType", "playlist");
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
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("YouTube Player API unavailable"));
      };
      document.head.appendChild(script);
      setTimeout(() => {
        if (window.YT && window.YT.Player) resolve(window.YT);
        else {
          apiPromise = null;
          reject(new Error("YouTube Player API timed out"));
        }
      }, 8000);
    });
    return apiPromise;
  }

  let dialog;
  let playerStage;
  let frameHost;
  let errorBox;
  let sourceLink;
  let titleTarget;
  let playlistPanel;
  let playlistList;
  let playlistCount;
  let activePlayer = null;
  let activeIframe = null;
  let activePlaylistSignature = "";

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
      <div class="player-stage" id="player-stage">
        <div class="player-frame" id="player-frame"></div>
        <aside class="player-playlist" id="player-playlist" aria-labelledby="player-playlist-title" hidden>
          <div class="player-playlist-head">
            <span><strong id="player-playlist-title">Complete playlist</strong><small id="player-playlist-count"></small></span>
            <span aria-hidden="true">☷</span>
          </div>
          <ol class="player-playlist-list" id="player-playlist-list" aria-label="Playlist videos"></ol>
        </aside>
      </div>
      <div class="player-error" id="player-error" role="status" hidden></div>
      <div class="player-fallback">
        <span>If playback is blocked by the owner, age settings or a privacy extension, use the original source.</span>
        <a class="button small ghost" id="player-source" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>
      </div>`;
    document.body.appendChild(dialog);
    playerStage = dialog.querySelector("#player-stage");
    frameHost = dialog.querySelector("#player-frame");
    errorBox = dialog.querySelector("#player-error");
    sourceLink = dialog.querySelector("#player-source");
    titleTarget = dialog.querySelector("#player-title");
    playlistPanel = dialog.querySelector("#player-playlist");
    playlistList = dialog.querySelector("#player-playlist-list");
    playlistCount = dialog.querySelector("#player-playlist-count");
    dialog.querySelector(".player-close").addEventListener("click", close);
    playlistList.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("button[data-playlist-index]");
      if (!button || !playlistList.contains(button) || !activePlayer || typeof activePlayer.playVideoAt !== "function") return;
      const index = Number(button.dataset.playlistIndex);
      if (!Number.isInteger(index) || index < 0) return;
      activePlayer.playVideoAt(index);
    });
    dialog.addEventListener("cancel", () => close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    return dialog;
  }

  function resetPlaylist() {
    activePlaylistSignature = "";
    if (playlistList) playlistList.textContent = "";
    if (playlistCount) playlistCount.textContent = "";
    if (playlistPanel) playlistPanel.hidden = true;
    if (playerStage) playerStage.classList.remove("has-playlist");
    if (dialog) dialog.classList.remove("has-playlist");
  }

  function updatePlaylistSelection(index, title) {
    if (!playlistList) return;
    playlistList.querySelectorAll("button[data-playlist-index]").forEach((button) => {
      const active = Number(button.dataset.playlistIndex) === index;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
      const name = button.querySelector(".player-playlist-name");
      if (name) name.textContent = active && title ? title : name.dataset.defaultLabel;
    });
  }

  function renderPlaylist(ids, currentIndex, currentTitle) {
    if (!playlistList || !playlistPanel || !playerStage) return;
    const playable = Array.isArray(ids) ? ids.filter((id) => VIDEO_ID.test(String(id || ""))) : [];
    if (!playable.length) {
      resetPlaylist();
      return;
    }

    const signature = playable.join("|");
    if (signature !== activePlaylistSignature) {
      const fragment = document.createDocumentFragment();
      playable.forEach((videoId, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        const image = document.createElement("img");
        const copy = document.createElement("span");
        const name = document.createElement("span");
        const id = document.createElement("small");
        button.type = "button";
        button.className = "player-playlist-item";
        button.dataset.playlistIndex = String(index);
        button.setAttribute("aria-label", `Play playlist video ${index + 1}`);
        // Same-origin, like every other thumbnail on the site: the player is the
        // privacy-enhanced surface, so it must not call Google to draw its own sidebar.
        image.src = `/api/poster?u=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "strict-origin-when-cross-origin";
        copy.className = "player-playlist-copy";
        name.className = "player-playlist-name";
        name.dataset.defaultLabel = `Video ${index + 1}`;
        name.textContent = name.dataset.defaultLabel;
        id.textContent = videoId;
        copy.append(name, id);
        button.append(image, copy);
        item.appendChild(button);
        fragment.appendChild(item);
      });
      playlistList.textContent = "";
      playlistList.appendChild(fragment);
      activePlaylistSignature = signature;
    }

    playlistCount.textContent = `${playable.length} playable ${playable.length === 1 ? "video" : "videos"}`;
    playlistPanel.hidden = false;
    playerStage.classList.add("has-playlist");
    dialog.classList.add("has-playlist");
    updatePlaylistSelection(currentIndex, currentTitle);
  }

  function refreshPlaylist(player) {
    if (!player || typeof player.getPlaylist !== "function") return;
    let ids = [];
    let index = 0;
    let title = "";
    try { ids = player.getPlaylist() || []; } catch (_) {}
    try { index = Math.max(0, Number(player.getPlaylistIndex()) || 0); } catch (_) {}
    try { title = String((player.getVideoData() || {}).title || "").trim(); } catch (_) {}
    renderPlaylist(ids, index, title);
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
    resetPlaylist();
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
          onReady: (event) => {
            if (activeIframe === iframe) iframe.referrerPolicy = "strict-origin-when-cross-origin";
            refreshPlaylist(event.target);
          },
          onStateChange: (event) => {
            if (activeIframe === iframe) refreshPlaylist(event.target);
          }
        }
      });
    } catch (_) {
      // The iframe is still fully usable without the optional JavaScript API.
    }
  }

  PF.YouTube = { parse, isYouTube, embedUrl, play, close, parseTime };
})();
