(function () {
  "use strict";

  // A know-your-rights card: one portrait image with the helpline and the first steps from
  // a resource's practical guide, made to be forwarded on WhatsApp where a link often is
  // not opened. It is drawn here, in the browser, from the card already on the page, so no
  // image is stored per resource and nothing is sent anywhere. Loaded by js/site.js the
  // first time someone presses "Share as image".

  const PF = window.PF;
  if (!PF) return;

  const W = 1080;
  const H = 1350;
  const PAD = 72;
  const FONT = '"Google Sans Flex", "Noto Sans Devanagari", "Nirmala UI", Mangal, system-ui, sans-serif';
  const INK = "#17202c";
  const GREEN = "#0a4a3d";
  const ORANGE = "#f2542d";

  function field(article, pattern) {
    const label = Array.from(article.querySelectorAll(".resource-notes strong")).find((node) => pattern.test(node.textContent));
    const value = label && label.parentElement.querySelector("p");
    return value ? value.textContent.trim().replace(/\s+/g, " ") : "";
  }

  function lines(ctx, text, width, max) {
    const words = String(text).split(" ");
    const out = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    if (out.length > max) {
      out.length = max;
      out[max - 1] = `${out[max - 1].replace(/\s*\S*$/, "")}…`;
    }
    return out;
  }

  function write(ctx, text, x, y, { size, weight = 500, color = INK, width = W - PAD * 2, max = 3, gap = 1.28 }) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    const rows = lines(ctx, text, width, max);
    rows.forEach((row, index) => ctx.fillText(row, x, y + index * size * gap));
    return y + rows.length * size * gap;
  }

  function roundRect(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }

  function draw(article) {
    const title = article.querySelector("h3").textContent.trim();
    const against = field(article, /किसके खिलाफ/);
    const who = field(article, /कौन कर सकता/);
    const helpline = field(article, /Helpline/i);
    const steps = field(article, /Step-by-Step/i).split(/\s*\|\s*/).map((step) => step.replace(/^\d+\.\s*/, "")).filter(Boolean);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = GREEN;
    ctx.fillRect(0, 0, W, 150);
    write(ctx, "जानिए अपना अधिकार", PAD, 96, { size: 54, weight: 800, color: "#ffffff", max: 1 });
    ctx.textAlign = "right";
    write(ctx, "Know your rights", W - PAD, 92, { size: 30, weight: 700, color: "#ffb42e", max: 1 });
    ctx.textAlign = "left";

    let y = write(ctx, title, PAD, 246, { size: 58, weight: 800, color: GREEN, max: 2, gap: 1.18 }) + 18;
    for (const [label, value] of [["किसके खिलाफ", against], ["कौन शिकायत कर सकता है", who]]) {
      if (!value) continue;
      y = write(ctx, label, PAD, y + 16, { size: 26, weight: 800, color: "#c3350f", max: 1 }) + 4;
      y = write(ctx, value, PAD, y + 4, { size: 32, max: 2 });
    }

    if (helpline) {
      ctx.font = `800 40px ${FONT}`;
      const rows = lines(ctx, helpline, W - PAD * 2 - 64, 2);
      const box = 96 + rows.length * 52;
      roundRect(ctx, PAD, y + 28, W - PAD * 2, box, 28, ORANGE);
      write(ctx, "हेल्पलाइन · Helpline", PAD + 32, y + 82, { size: 26, weight: 700, color: "#ffffff", max: 1 });
      write(ctx, helpline, PAD + 32, y + 138, { size: 40, weight: 800, color: "#ffffff", max: 2, width: W - PAD * 2 - 64, gap: 1.3 });
      y += 28 + box;
    }

    y = write(ctx, "क्या करें · What to do", PAD, y + 76, { size: 30, weight: 800, color: GREEN, max: 1 }) + 6;
    const footer = H - 132;
    steps.forEach((step, index) => {
      if (y + 60 > footer) return;
      ctx.fillStyle = "#0f7a63";
      ctx.beginPath();
      ctx.arc(PAD + 22, y + 22, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "center";
      write(ctx, String(index + 1), PAD + 22, y + 32, { size: 26, weight: 800, color: "#ffffff", max: 1 });
      ctx.textAlign = "left";
      const room = Math.min(2, Math.floor((footer - y) / 40));
      y = write(ctx, step, PAD + 64, y + 32, { size: 30, max: room, width: W - PAD * 2 - 64, gap: 1.3 }) + 14;
    });

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, H - 110, W, 110);
    ctx.fillStyle = ORANGE;
    ctx.fillRect(0, H - 110, W, 6);
    // The address is one unbroken word, so it is shrunk to fit rather than wrapped.
    const address = `pigsfield.com${location.pathname}`;
    let size = 28;
    ctx.font = `800 ${size}px ${FONT}`;
    while (size > 18 && ctx.measureText(address).width > 680) ctx.font = `800 ${--size}px ${FONT}`;
    write(ctx, address, PAD, H - 44, { size, weight: 800, color: GREEN, max: 1, width: 680 });
    ctx.textAlign = "right";
    write(ctx, "Free · No login", W - PAD, H - 44, { size: 26, weight: 700, color: "#4b5563", max: 1 });
    ctx.textAlign = "left";
    return { canvas, title };
  }

  let dialog = null;
  let objectUrl = "";

  function preview(blob, name, title) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "site-dialog rights-card-dialog";
      dialog.setAttribute("aria-labelledby", "rights-card-title");
      dialog.innerHTML = `<div class="dialog-head"><h2 id="rights-card-title">Know-your-rights card</h2><button class="icon-button" type="button" data-close-dialog aria-label="Close image card">×</button></div>
        <div class="dialog-body"><img class="rights-card-preview" alt=""><p>Save the image, then send it on WhatsApp or print it for a notice board.</p><a class="button brand" data-rights-card-download>Download image</a></div>`;
      dialog.querySelector("[data-close-dialog]").addEventListener("click", () => PF.closeDialog(dialog));
      dialog.addEventListener("click", (event) => { if (event.target === dialog) PF.closeDialog(dialog); });
      document.body.appendChild(dialog);
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    const image = dialog.querySelector("img");
    image.src = objectUrl;
    image.alt = `Know-your-rights card: ${title}`;
    const download = dialog.querySelector("[data-rights-card-download]");
    download.href = objectUrl;
    download.download = name;
    if (PF.applyLanguageTo) PF.applyLanguageTo(dialog);
    PF.showDialog(dialog);
  }

  PF.rightsCard = async function (article) {
    if (!article) return;
    try { await document.fonts.load(`800 40px "Google Sans Flex"`); } catch (_) {}
    const { canvas, title } = draw(article);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) { PF.toast("The image card could not be drawn in this browser."); return; }
    const name = `pigsfield-${(article.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "rights")}.png`;
    const file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
    const url = `${location.origin}${location.pathname}#${encodeURIComponent(article.id)}`;
    const phone = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (phone && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, text: `${title}\nPigsfield पर मुफ़्त 👉 ${url}` });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    preview(blob, name, title);
  };
})();
