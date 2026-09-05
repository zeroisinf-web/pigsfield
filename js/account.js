(function () {
  "use strict";

  // Optional sign-in, presented where it is actually useful: inside the saved-list dialog.
  //
  // Guest mode is the default and stays complete. Nothing on Pigsfield is behind an account,
  // there is no sign-in wall, no banner and no prompt anywhere else on the site. An account
  // does exactly one thing — carry a saved list between a shared PC and a phone — so it is
  // offered at the moment a person is looking at that list, and nowhere else.
  //
  // No request is made until the dialog is opened, so a visitor who never signs in never
  // pays for this feature, not even one round trip.

  const PF = window.PF;
  if (!PF) return;

  let state = null; // null = not checked yet
  let checking = false;

  const strip = () => document.querySelector("#account-strip");

  function ensureStrip() {
    const body = document.querySelector("#saved-dialog .dialog-body");
    if (!body || strip()) return strip();
    const element = document.createElement("div");
    element.id = "account-strip";
    element.className = "account-strip";
    element.hidden = true;
    body.insertBefore(element, body.firstChild);
    return element;
  }

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    let body = null;
    try {
      body = await response.json();
    } catch (_) {}
    return { ok: response.ok, status: response.status, body: body || {} };
  }

  function render() {
    const element = ensureStrip();
    if (!element) return;

    // Accounts are not configured on this deployment: show nothing rather than advertising
    // a feature that cannot work.
    if (!state || state.available === false) {
      element.hidden = true;
      element.innerHTML = "";
      return;
    }

    element.hidden = false;
    if (state.signedIn) {
      element.innerHTML = `
        <div class="account-row">
          <span class="account-status" data-account-state="in">Your saved list syncs across your devices.</span>
          <button class="button small ghost" type="button" data-account-signout>Sign out</button>
        </div>`;
      element.querySelector("[data-account-signout]").addEventListener("click", signOut);
      return;
    }

    element.innerHTML = `
      <form class="account-row" data-account-form>
        <label class="account-label" for="account-email">Optional: sync this list to another device</label>
        <div class="account-controls">
          <input id="account-email" name="email" type="email" autocomplete="email" required
                 placeholder="you@example.com" spellcheck="false">
          <button class="button small brand" type="submit">Email me a link</button>
        </div>
        <small class="account-note">No password. Pigsfield never stores your email address — only a one-way hash of it. Everything here already works without signing in.</small>
        <p class="account-message" role="status" aria-live="polite" hidden></p>
      </form>`;
    element.querySelector("[data-account-form]").addEventListener("submit", requestLink);
  }

  function message(text, tone) {
    const node = strip() && strip().querySelector(".account-message");
    if (!node) return;
    node.hidden = false;
    node.textContent = text;
    node.dataset.tone = tone || "";
  }

  async function requestLink(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector("#account-email");
    const button = form.querySelector("button[type=submit]");
    const email = String(input.value || "").trim();
    if (!email) return;

    button.disabled = true;
    message("Sending…", "");
    try {
      const result = await api("/api/auth/request", { method: "POST", body: JSON.stringify({ email }) });
      if (result.ok) {
        message(result.body.message || "Check your email for a sign-in link.", "ok");
        input.value = "";
      } else {
        message(result.body.error || "That did not work. Please try again.", "error");
      }
    } catch (_) {
      message("No connection. Check your network and try again.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (_) {}
    state = { signedIn: false, available: true };
    render();
    PF.toast && PF.toast("Signed out. Your saved list stays on this device.");
  }

  /**
   * Push this browser's list up and take the union back.
   *
   * The server merges rather than overwrites, so signing in on a new device can only ever
   * make the list longer. A failure here is silent by design: syncing is a convenience, and
   * a person looking at their saved list should not be shown a network error about it.
   */
  async function sync() {
    try {
      const result = await api("/api/saved", { method: "PUT", body: JSON.stringify({ items: PF.getSaved() }) });
      if (result.ok && Array.isArray(result.body.items)) PF.replaceSaved(result.body.items);
    } catch (_) {}
  }

  async function check({ force = false } = {}) {
    if (checking || (state && !force)) return state;
    checking = true;
    try {
      const result = await api("/api/auth/session");
      state = result.body && typeof result.body.signedIn === "boolean" ? result.body : { signedIn: false, available: false };
    } catch (_) {
      state = { signedIn: false, available: false };
    } finally {
      checking = false;
    }
    return state;
  }

  // Only ever triggered by opening the saved dialog, so guests make no request at all.
  document.addEventListener("click", (event) => {
    if (!event.target.closest || !event.target.closest("[data-open-saved]")) return;
    check().then(() => {
      render();
      if (state && state.signedIn) sync();
    });
  });

  // Arriving back from a magic link: confirm, sync, and clean the marker out of the URL so
  // it is not shared or bookmarked.
  if (new URLSearchParams(location.search).get("signed-in") === "1") {
    const url = new URL(location.href);
    url.searchParams.delete("signed-in");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    check({ force: true }).then(() => {
      if (state && state.signedIn) {
        sync().then(() => PF.toast && PF.toast("Signed in. Your saved list now syncs."));
      }
    });
  }

  PF.account = { check, sync, render, get state() { return state; } };
})();
