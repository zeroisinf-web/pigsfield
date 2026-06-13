# 🐷 Pigsfield — pigsfield.com

> **Education is your Right, It must be free.**
> So we are your gateway to Every Free but Best Educational Resource.

A 100% static website (no build step, no framework, no server) with a **Windows 11 desktop UI**:
6 applications, a Netflix-style educational OTT (**PigBang**) with an embedded YouTube player,
English ⇄ हिन्दी switch, light/dark mode, global search, favourites, donate & feedback widgets.

| App | Source Excel file |
|---|---|
| 🎓 Nursery to PhD | `01 v3 Nursary to PhD.xlsx` |
| 🧑‍🏫 Teacher Training & Skills | `02 v3 Teacher Training + Vocational & Skills.xlsx` |
| 🛠️ Tools | `03 v3 Tools.xlsx` |
| 🏆 Competitive Exams | `04 v3 Compititive Exams.xlsx` |
| 🐽 PigBang (OTT) | `05 v3 PigBang.xlsx` |
| ⚖️ Make Govt Accountable | `06 v3 Make Govt Accountable.xlsx` |

## 🚀 Host on GitHub Pages (free)

1. Create a repository (e.g. `pigsfield`) on GitHub and upload **all files in this folder**.
2. Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
3. Your site is live at `https://<username>.github.io/pigsfield/`.
4. Custom domain **pigsfield.com**: Settings → Pages → Custom domain → enter `pigsfield.com`,
   then at your domain registrar add a `CNAME` record pointing `www` → `<username>.github.io`
   and the four GitHub `A` records for the apex domain (185.199.108.153 / .109 / .110 / .111).
   A `CNAME` file containing `pigsfield.com` is already included.

## ✏️ How to edit / add resources (no coding needed)

All content lives in **plain data files** in [`js/data/`](js/data/):

- `school.js`, `teach.js`, `tools.js`, `exams.js`, `govt.js` — resource apps.
  Each resource is a small block like:
  ```js
  {
   "title": "NCERT Textbooks",
   "desc": "Official free NCERT PDF textbooks",
   "links": [ { "label": "Web", "urls": ["https://ncert.nic.in/textbook.php"] } ]
  }
  ```
  Copy a block, change the text/links, save — done.
- `pigbang.js` — OTT items: `{"classes":["9-12","UG"], "subject":"Physics", "name":"…", "desc":"…", "urls":["…"]}`
- `about.js` — the About app (English + Hindi).
- UI text & translations: `js/i18n.js`.

### Re-import from Excel (bulk update)

If you prefer editing the original Excel files, regenerate the data files:

```bash
pip install openpyxl
python tools/extract.py    # reads the 6 .xlsx files → extract/*.json
python tools/convert.py    # extract/*.json → js/data/*.js
```

## 🖥️ Run locally

Just open `index.html`, or serve it:

```bash
python -m http.server 8741
# → http://localhost:8741
```

## 🧭 Features

- **Windows 11 UI** — desktop icons, draggable/resizable windows, minimize/maximize,
  centered taskbar with AI search, start menu, clock, system tray. Logo is the **desi
  Indian grey pig nose**; PigBang has its own **big-bang × pig-nose** fused logo.
- **Pigsfield AI** ✨ — the taskbar search is an AI study assistant powered by Google
  Gemini (`gemini-2.5-flash`). Upload images, audio, video, PDFs, code or text and ask
  anything; it explains concepts, writes/debugs code and summarises files. Two one-tap
  modes: **🎨 Image** (generate & download images) and **📄 File** (generate a downloadable
  file); every answer also has a "save as file" button. Bring your own free key
  (https://aistudio.google.com/apikey) — stored only in the browser. Toggle to plain
  **Resource search** any time.
- **PigBang OTT** — Netflix-style rails by level, illustrative subject symbols on every
  poster, Free/Paid filter & badges, detail pages, **in-site YouTube playback** with a
  clean "watch on YouTube" fallback when an owner blocks embedding. Real platform logos
  (YouTube, Netflix, Hotstar, Prime) appear on the relevant link buttons.
- **Competitive Exams "Command Center"** — a dedicated UI (not generic cards): an NCERT
  reading-roadmap comparison table (UPSC vs RAS vs SSC), mock-test grid, subject accordions
  with Course / Marathon / Books & Extras groups, full UPSC-IAS & RAS Prelims→Mains roadmaps
  with collapsible syllabus and official-source "Essentials", and a channels grid.
- **Smart link buttons** — every link is auto-labelled by what it is and where it goes
  (NCERT Books, YouTube Playlist, Play Store, Read on Scribd, Buy on Amazon, NPTEL Course…),
  with resource-type filters (Website / YouTube / App / PDF) and category quick-jumps.
- **Hidden usage analytics** — every resource open is counted so you can see what the
  public uses most. Open the dashboard with `#stats` in the URL or by clicking the taskbar
  clock 5×; export CSV/JSON. For real cross-visitor aggregate, wire the included Google
  Apps Script (see [analytics/SETUP.md](analytics/SETUP.md)).
- **In-site video toggle** — Start menu → *In-site video* turns embedded playback on/off
  (off = every video opens on YouTube).
- **Global search** across every resource of every app, in English or Hindi.
- **EN ⇄ हिन्दी** switch and **light/dark** mode (remembered); **Recently used** list in Start.
- **Donate widget** — UPI: `zeroisinf@ibl` · **Feedback / Join us** — `zeroisinf@gmail.com`
  (both always one tap away as red buttons on the taskbar).
- Mobile-friendly (PWA manifest included — "Add to Home screen" works).

### Enable Pigsfield AI

The AI is **off until a key is provided** (so the site stays free to host). Each visitor
clicks the search → *Pigsfield AI* and pastes their own free Gemini key, which is stored
only in their browser. To ship one shared key instead, set `AI.key`/model defaults in
[`js/ai.js`](js/ai.js) and restrict the key to your domain in Google AI Studio.

## 💗 Support

This is a volunteer-driven mission to make the best education free for everyone.

- Donate (UPI): **zeroisinf@ibl**
- Feedback / join: **zeroisinf@gmail.com**
- Follow: [X/Twitter](https://x.com/pigsfield) · [Instagram](https://www.instagram.com/pigsfield) · [YouTube](https://www.youtube.com/@pigsfield) · [Facebook](https://www.facebook.com/61579505132769/) · [LinkedIn](https://www.linkedin.com/in/priyadarshan-meghwal-431656210/)

*Change doesn't come from cursing the system, but from building alternatives.*
