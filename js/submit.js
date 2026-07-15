(function () {
  "use strict";
  const form = document.querySelector("#submit-resource-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const subject = `Pigsfield: ${data.get("type")} — ${data.get("title")}`;
    const body = [
      `Contribution type: ${data.get("type")}`,
      `Area: ${data.get("area")}`,
      `Title: ${data.get("title")}`,
      `Original URL: ${data.get("url") || "Not provided"}`,
      `Name/organization: ${data.get("name") || "Not provided"}`,
      "",
      "Details:",
      data.get("details")
    ].join("\n");
    location.href = `mailto:zeroisinf@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
})();
