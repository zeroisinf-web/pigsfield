# Real public usage counts (optional)

By default Pigsfield counts resource usage **per device** in the visitor's browser
(open the hidden dashboard: add `#stats` to the URL, or click the taskbar clock 5×).

To collect **true aggregate counts across all visitors** — so you can see which
resources the public uses most — point the site at a tiny Google Apps Script that
appends every "use" event to a Google Sheet. It's free and needs no server.

## Steps (5 minutes)

1. Create a new Google Sheet. Note it stays private to you.
2. In the Sheet: **Extensions → Apps Script**. Delete the sample and paste `Code.gs`
   (next to this file). Save.
3. **Deploy → New deployment → type: Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, authorise, and copy the **Web app URL**
   (`https://script.google.com/macros/s/…/exec`).
4. Open `js/usage.js` and set:
   ```js
   PF.USAGE = { endpoint: "https://script.google.com/macros/s/XXXX/exec", ns: "pigsfield" };
   ```
5. Commit & push. From now on every resource open is logged as a row
   `timestamp · id · title · app`. Add a Pivot Table on the Sheet (rows = title,
   values = COUNT) to instantly rank the most-used resources.

The beacon is fire-and-forget (`navigator.sendBeacon`) — it never slows clicks and
silently does nothing if the endpoint is unreachable. No personal data is collected.
