/* Pigsfield — boot */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    window.PF.initDesktop();
    /* Removed auto-open app on first visit — desktop now appears empty initially */
    // if (!localStorage.getItem("pf-visited")) {
    //   localStorage.setItem("pf-visited", "1");
    //   setTimeout(() => window.PF.openApp("school"), 1700);
    // }
  });
})();
