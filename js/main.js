/* Pigsfield — boot */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    window.PF.initDesktop();
    /* open the flagship app on first visit so the desktop isn't empty */
    if (!localStorage.getItem("pf-visited")) {
      localStorage.setItem("pf-visited", "1");
      setTimeout(() => window.PF.openApp("school"), 1700);
    }
  });
})();
