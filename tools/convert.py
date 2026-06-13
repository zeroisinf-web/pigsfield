# Pigsfield — Step 2: convert extract/*.json into editable website data files (js/data/*.js).
# Every non-empty cell is mapped to title / desc / badge / links / extra — nothing is dropped.
# Usage:  python tools/convert.py
import json, os, re
from urllib.parse import urlparse, parse_qs, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXT = os.path.join(ROOT, "extract")
OUT = os.path.join(ROOT, "js", "data")
os.makedirs(OUT, exist_ok=True)

URL_RE = re.compile(r'https?://[^\s|"<>]+')

def unwrap(u):
    u = u.strip().rstrip('.,;')
    if u.startswith("https://www.google.com/search"):
        q = parse_qs(urlparse(u).query).get("q")
        if q:
            u = q[0]
    return u

def norm(u):
    return unquote(u).rstrip("/").lower()

def cell_parts(cell):
    """Return (text, [urls]) for a cell, keeping every URL (text URLs + hyperlink target)."""
    if cell is None:
        return "", []
    if isinstance(cell, str):
        v, l = cell, None
    else:
        v, l = cell.get("v") or "", cell.get("l")
    urls = [unwrap(m) for m in URL_RE.findall(v)]
    if l:
        lu = unwrap(l)
        if norm(lu) not in {norm(x) for x in urls}:
            urls.append(lu)
    text = URL_RE.sub("", v)
    lines = []
    for ln in text.splitlines():
        ln = ln.strip().strip("|").strip()
        ln = re.sub(r"\s+", " ", ln)
        if ln:
            lines.append(ln)
    return "\n".join(lines), urls

def make_item(cells, cfg, headers):
    """cfg: {title, desc, badge, links:{idx:label}, extra:[idx...]} (column indexes)."""
    item = {"title": "", "desc": "", "links": [], "extra": []}
    used = set()

    def label_for(i):
        if headers and i < len(headers) and headers[i]:
            h, _ = cell_parts(headers[i])
            h = re.sub(r"^\[|\]$", "", h.splitlines()[0]).strip() if h else ""
            if h:
                return h
        return "Link"

    def grab(i):
        return cell_parts(cells[i]) if i is not None and i < len(cells) else ("", [])

    ti = cfg.get("title")
    t, turls = grab(ti)
    if ti is not None:
        used.add(ti)
    item["title"] = t
    if turls:
        item["links"].append({"label": label_for(ti), "urls": turls})

    di = cfg.get("desc")
    if di is not None:
        used.add(di)
        d, durls = grab(di)
        item["desc"] = d
        if durls:
            item["links"].append({"label": "Source", "urls": durls})

    bi = cfg.get("badge")
    if bi is not None:
        used.add(bi)
        b, burls = grab(bi)
        if b:
            item["badge"] = b
        if burls:
            item["links"].append({"label": label_for(bi), "urls": burls})

    for i, label in (cfg.get("links") or {}).items():
        used.add(i)
        txt, urls = grab(i)
        if urls:
            item["links"].append({"label": label, "urls": urls})
        if txt and txt not in ("—", "-"):
            item["extra"].append({"label": label, "text": txt})

    for i in cfg.get("extra", []):
        used.add(i)
        txt, urls = grab(i)
        lab = label_for(i)
        if txt and txt not in ("—", "-"):
            item["extra"].append({"label": lab, "text": txt})
        if urls:
            item["links"].append({"label": lab, "urls": urls})

    # Safety net: any column not covered by config still gets captured.
    for i in range(len(cells)):
        if i in used or cells[i] is None:
            continue
        txt, urls = cell_parts(cells[i])
        lab = label_for(i)
        if txt and txt not in ("—", "-"):
            item["extra"].append({"label": lab, "text": txt})
        if urls:
            item["links"].append({"label": lab, "urls": urls})

    if not item["extra"]:
        del item["extra"]
    if not item["links"]:
        del item["links"]
    return item


def rows_map(rows):
    return {r["row"]: r["cells"] for r in rows}


STD5 = {"title": 0, "desc": 1, "links": {2: "Web", 3: "YouTube", 4: "App"}}
STD3 = {"title": 0, "desc": 1, "links": {2: "Web"}}
TOOLS = {"title": 0, "desc": 1, "links": {2: "Web", 3: "App", 4: "Tutorial"}}


def simple_sheet(rows, cfg, header_row=2, title_row=1, section_detect=False):
    """Sheets that are: [title row][header row][data rows...] with optional inline section rows."""
    rm = rows_map(rows)
    headers = rm.get(header_row, [])
    title, _ = cell_parts(rm.get(title_row, [""])[0] if rm.get(title_row) else "")
    groups, cur = [], {"title": "", "items": []}
    for r in rows:
        if r["row"] <= header_row:
            continue
        cells = r["cells"]
        nonempty = [i for i, c in enumerate(cells) if c]
        if section_detect and nonempty == [0] and isinstance(cells[0], str) and not URL_RE.search(cells[0]):
            if cur["items"]:
                groups.append(cur)
            cur = {"title": cells[0].strip(), "items": []}
            continue
        item = make_item(cells, cfg, headers)
        if item["title"] or item["desc"] or item.get("links") or item.get("extra"):
            cur["items"].append(item)
    if cur["items"]:
        groups.append(cur)
    return {"title": title, "groups": groups}


def segment(rows, lo, hi):
    return [r for r in rows if lo <= r["row"] <= hi]


def js_write(name, varname, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Auto-generated from the Pigsfield Excel sheets by tools/convert.py\n")
        f.write("// Safe to edit by hand — this is the live data of the website.\n")
        f.write("window.PF_DATA = window.PF_DATA || {};\n")
        f.write("window.PF_DATA." + varname + " = ")
        f.write(json.dumps(obj, ensure_ascii=False, indent=1))
        f.write(";\n")
    print("wrote", path)


def load(name):
    with open(os.path.join(EXT, name), encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- 01 school
def build_school():
    d = load("01 v3 Nursary to PhD.json")
    sections = []
    for sheet, sid, cfg in [
        ("0-5", "n5", STD5), ("6-8", "c68", STD5), ("9-12", "c912", STD5),
        ("UG", "ug", STD5), ("PG", "pg", STD5), ("PHD", "phd", STD3),
    ]:
        s = simple_sheet(d[sheet], cfg)
        s["id"] = sid
        sections.append(s)
    js_write("school.js", "school", {"sections": sections})


# ---------------------------------------------------------------- 02 teach
def build_teach():
    d = load("02 v3 Teacher Training + Vocational & Skills.json")
    tt = simple_sheet(d["TT"], STD5, section_detect=True)
    tt["id"] = "tt"
    vs = simple_sheet(d["Voc&Skills"], STD5, section_detect=True)
    vs["id"] = "vs"
    js_write("teach.js", "teach", {"sections": [tt, vs]})


# ---------------------------------------------------------------- 03 tools
def build_tools():
    d = load("03 v3 Tools.json")
    s = simple_sheet(d["Tools"], TOOLS, section_detect=True)
    s["id"] = "tools"
    js_write("tools.js", "tools", {"sections": [s]})


# ---------------------------------------------------------------- 04 exams
def build_exams():
    d = load("04 v3 Compititive Exams.json")
    rows = d["Common & Specific"]
    rm = rows_map(rows)
    sections = []

    # 1. NCERT roadmap (rows 1-9)
    seg = segment(rows, 2, 9)
    headers = rm[1]
    intro = make_item([rm[1][0]], {"title": 0}, None)
    intro["title"] = "Standard Books (NCERT & NIOS) — free official textbooks"
    items = [make_item(r["cells"], {"title": 0, "extra": [1, 2, 3, 4]}, headers) for r in seg]
    sections.append({"id": "books", "title": "NCERT / NIOS Standard Books Roadmap",
                     "groups": [{"title": "", "items": [intro] + items}]})

    # 2. Mock tests (row 11)
    t = make_item(rm[11], {"title": 0, "links": {2: "Tests & PYQs"}}, None)
    t["title"] = "Mock Tests, Test Series & Previous Year Papers"
    sections.append({"id": "tests", "title": "Mock Tests & PYQs",
                     "groups": [{"title": "", "items": [t]}]})

    # NOTE: build_exams() is the OLD single-sheet builder, kept for reference only.
    # The live builder is build_exams2() (4-sheet workbook). Not called from __main__.
    return


def _txt(cell):
    return cell_parts(cell)[0]
def _urls(cell):
    return cell_parts(cell)[1]


def _firstrest(t):
    lines = (t or "").split("\n")
    return lines[0].strip(), "\n".join(lines[1:]).strip()
def _marksline(t):
    for l in (t or "").split("\n"):
        if "Mark" in l or "Duration" in l:
            return l.strip()
    return ""


def build_exams2():
    """Competitive-Exams builder for the 3-sheet workbook (Common & Specific, IAS, RAS).
       Sections are delimited by explicit single-cell divider rows; each section holds
       'papers', each paper may have nested 'subs'. Channels live in Common (rows 42+)."""
    d = load("04 v3 Compititive Exams.json")

    # ---- Common & Specific ----
    cs = d["Common & Specific"]
    m = rows_map(cs)
    note_t, note_u = cell_parts(m[1][0])
    hdr = m[1] + [None] * 5
    headers = ["Subject", _txt(hdr[1]), _txt(hdr[2]), _txt(hdr[3]), _txt(hdr[4])]

    roadmap_rows = []
    for r in segment(cs, 2, 9):
        c = r["cells"] + [None] * 5
        roadmap_rows.append({"subject": _txt(c[0]), "upsc": _txt(c[1]),
                             "ras": _txt(c[2]), "ssc": _txt(c[3]), "books": _txt(c[4])})

    test_urls = []
    if 11 in m:
        for c in m[11]:
            if c is not None:
                test_urls += cell_parts(c)[1]

    subjects, cur = [], ""
    for r in segment(cs, 14, 40):
        c = r["cells"] + [None] * 5
        s = _txt(c[0])
        if s:
            cur = s
        exam = _txt(c[1])
        course, marathon, books = _urls(c[2]), _urls(c[3]), _urls(c[4])
        extras = [t for ci in (2, 3, 4) for t in [_txt(c[ci])] if t and not t.startswith("http")]
        if course or marathon or books or exam:
            subjects.append({"subject": cur, "exam": exam, "course": course,
                             "marathon": marathon, "books": books, "extras": extras})

    # channels: rows after the "Some Useful Channels" divider
    channels = []
    for r in cs:
        if r["row"] <= 41:
            continue
        c = r["cells"] + [None] * 3
        name = _txt(c[0]).strip("[]").strip()
        urls = _urls(c[1]) + _urls(c[0])
        if name and urls:
            channels.append({"focus": name, "exams": "", "urls": urls})

    # ---- IAS / RAS: nested sections → papers → subs ----
    def build_track(sheet, ess_marker):
        rows = d[sheet]
        sections, essentials, ess_title, in_ess = [], [], "", False
        cur_sec, cur_paper = None, [None]

        def newsec(title, sub=""):
            s = {"title": title, "sub": sub, "items": []}
            sections.append(s)
            return s

        for r in rows:
            if r["row"] == 1:
                continue
            c = r["cells"] + [None] * 5
            c0t, c0u = cell_parts(c[0])
            c1t, c1u = cell_parts(c[1])
            nonempty = [i for i in range(5)
                        if c[i] is not None and (cell_parts(c[i])[0] or cell_parts(c[i])[1])]

            if not in_ess and (c1t == ess_marker or c0t.endswith("Essentials")):
                in_ess = True
                ess_title = c0t or "Essentials"
                continue
            if in_ess:
                if c0t or c1t or c1u:
                    essentials.append({"topic": c0t, "srcText": c1t,
                                       "srcUrl": (c1u[0] if c1u else "")})
                continue

            # divider (only col0) → new section boundary
            if nonempty == [0]:
                head, rest = _firstrest(c0t)
                cur_sec = newsec(head, rest)
                cur_paper[0] = None
                continue

            if cur_sec is None:
                cur_sec = newsec("", "")
            course, marathon, books = _urls(c[2]), _urls(c[3]), _urls(c[4])
            has_links = bool(course or marathon or books)
            src = c1u[0] if c1u else ""

            if c0t:                                   # a paper / top-level subject
                head, _ = _firstrest(c0t)
                marks = _marksline(c0t)
                fl, rest = _firstrest(c1t)
                if fl and len(fl) < 70 and ";" not in fl and has_links:
                    # col1 is the paper's first sub-subject (links belong to it)
                    sub = {"name": fl, "topics": rest, "src": src,
                           "course": course, "marathon": marathon, "books": books}
                    paper = {"name": head, "marks": marks, "topics": "", "src": "",
                             "course": [], "marathon": [], "books": [], "subs": [sub]}
                else:
                    paper = {"name": head, "marks": marks, "topics": c1t, "src": src,
                             "course": course, "marathon": marathon, "books": books, "subs": []}
                cur_sec["items"].append(paper)
                cur_paper[0] = paper
            else:                                     # col0 blank → sub-subject
                fl, rest = _firstrest(c1t)
                sub = {"name": fl, "topics": rest, "src": src,
                       "course": course, "marathon": marathon, "books": books}
                if cur_paper[0] is not None:
                    cur_paper[0]["subs"].append(sub)
                else:
                    paper = dict(sub, marks="", subs=[])
                    cur_sec["items"].append(paper)
                    cur_paper[0] = paper
        return {"sections": sections, "essTitle": ess_title, "essentials": essentials}

    ias = build_track("IAS", "Official source to study")
    ras = build_track("RAS", "Best official source")

    js_write("exams.js", "exams", {
        "roadmap": {"note": {"text": note_t, "urls": note_u}, "headers": headers, "rows": roadmap_rows},
        "tests": {"urls": test_urls},
        "common": {"subjects": subjects},
        "ias": ias, "ras": ras,
        "channels": channels,
    })


# ---------------------------------------------------------------- 06 govt
def build_govt():
    d = load("06 v3 Make Govt Accountable.json")
    rows = d["Accountability "]
    rm = rows_map(rows)
    headers = rm[2]
    title, _ = cell_parts(rm[1][0])
    cfg = {"title": 1, "desc": 2, "badge": 0,
           "links": {5: "Official Website", 6: "YouTube Tutorial"},
           "extra": [3, 4, 7, 8, 9]}
    groups, by_tier = [], {}
    for r in rows:
        if r["row"] < 3:
            continue
        item = make_item(r["cells"], cfg, headers)
        tier = item.get("badge", "")
        if tier not in by_tier:
            by_tier[tier] = {"title": tier, "items": []}
            groups.append(by_tier[tier])
        by_tier[tier]["items"].append(item)
    js_write("govt.js", "govt", {"sections": [{"id": "arsenal", "title": title, "groups": groups}]})


# ---------------------------------------------------------------- 05 pigbang
CLASS_FIX = {"2026-06-08 00:00:00": "6-8", "2026-09-12 00:00:00": "9-12"}

def split_classes(s):
    if not s:
        return []
    s = CLASS_FIX.get(s.strip(), s.strip())
    out = []
    for part in s.split(","):
        p = part.strip()
        p = CLASS_FIX.get(p, p)
        if p in ("0-5", "N-5"):
            p = "N-5"
        if p == "PhD, PG":
            out += ["PhD", "PG"]
        elif p:
            out.append(p)
    return out

def build_pigbang():
    d = load("05 v3 PigBang.json")
    tabs = []
    for sheet, tid in [("Movies & Shows", "movies"), ("Channels", "channels"), ("Apps & Games", "apps")]:
        rows = d[sheet]
        rm = rows_map(rows)
        note_text, note_urls = ("", [])
        hdr = rm[1]
        if len(hdr) > 5 and hdr[5]:
            note_text, note_urls = cell_parts(hdr[5])
        items = []
        for r in rows:
            if r["row"] < 2:
                continue
            c = r["cells"] + [None] * (6 - len(r["cells"]))
            cls_txt, _ = cell_parts(c[0])
            subj, _ = cell_parts(c[1])
            name, name_urls = cell_parts(c[2])
            desc, desc_urls = cell_parts(c[3])
            link_txt, urls = cell_parts(c[4])
            price, _ = cell_parts(c[5])
            urls = name_urls + desc_urls + urls
            item = {"classes": split_classes(cls_txt), "subject": subj,
                    "name": name, "desc": desc, "urls": urls}
            if price:
                item["price"] = price
            if link_txt:
                item["linkNote"] = link_txt
            if name == "Name" and desc == "Description":
                continue  # stray duplicated header row inside the sheet
            if name or urls:
                items.append(item)
        tab = {"id": tid, "items": items}
        if note_text or note_urls:
            tab["note"] = {"text": note_text, "urls": note_urls}
        tabs.append(tab)
    js_write("pigbang.js", "pigbang", {"tabs": tabs})


if __name__ == "__main__":
    build_school()
    build_teach()
    build_tools()
    build_exams2()
    build_govt()
    build_pigbang()
    print("done")
