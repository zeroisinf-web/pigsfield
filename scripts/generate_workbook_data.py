from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List
from zipfile import ZipFile
import xml.etree.ElementTree as ET


NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
WORKBOOK_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}

URL_RE = re.compile(r"https?://[^\s<>\"]+")
NUMERIC_ROW_RE = re.compile(r"^\d+(?:\.\d+)?$")

SHEET_NAME_ALIASES = {
    "n5": "N-5",
    "nurseryto5": "N-5",
    "s1nurseryto5": "N-5",
    "68": "6-8",
    "s2class68": "6-8",
    "912": "9-12",
    "s3class912": "9-12",
    "ug": "UG",
    "pg": "PG",
    "phd": "PHD",
    "tt": "TT",
    "teachertraining": "TT",
    "vocskill": "Voc&Skill",
    "vocationalskills": "Voc&Skill",
    "universal": "Universal",
    "comp": "COMP",
    "competitive": "COMP",
    "tools": "Tools",
    "pigflix": "Pigflix",
}


def normalize_key(value: str = "") -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def normalize_sheet_reference(value: str = "") -> str | None:
    cleaned = normalize_key(value)
    if not cleaned:
        return None
    return SHEET_NAME_ALIASES.get(cleaned)


def split_urls(value: str = "") -> List[str]:
    if not value:
        return []
    urls = []
    seen = set()
    for match in URL_RE.findall(value.replace("\r", "\n")):
        href = match.rstrip("),.;")
        if href and href not in seen:
            seen.add(href)
            urls.append(href)
    return urls


def parse_also_in(value: str = "") -> List[str]:
    refs = []
    seen = set()
    parts = re.split(r"[,/\n]+", value or "")
    for part in parts:
        ref = normalize_sheet_reference(part)
        if ref and ref not in seen:
            seen.add(ref)
            refs.append(ref)
    return refs


def clean_category_title(value: str = "") -> str:
    return re.sub(r"\s+", " ", value).strip(" -")


def clean_tools_category_title(value: str = "") -> str:
    title = clean_category_title(value)
    if "—" in title:
        title = title.split("—", 1)[0].strip()
    title = re.sub(r"^\d+\.\s*", "", title)
    return title


def clean_comp_phase_title(value: str = "") -> str:
    return clean_category_title(value)


def clean_comp_subject_title(value: str = "") -> str:
    title = clean_category_title(value)
    title = re.sub(r"^\d+\.\s*", "", title)
    return title


def strip_leading_symbols(value: str = "") -> str:
    return re.sub(r"^[^A-Za-z0-9]+", "", clean_category_title(value)).strip()


def split_pigflix_section_title(value: str = "") -> Dict[str, str]:
    cleaned = strip_leading_symbols(value)
    parts = re.split(r"\s+[—-]\s+", cleaned, maxsplit=1)
    title = clean_category_title(parts[0]) if parts else ""
    description = clean_category_title(parts[1]) if len(parts) > 1 else ""
    return {
        "title": title,
        "description": description,
    }


def is_numeric_row(value: str = "") -> bool:
    return bool(NUMERIC_ROW_RE.match((value or "").strip()))

def load_shared_strings(archive: ZipFile) -> List[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall("m:si", NS):
        strings.append("".join(node.text or "" for node in item.iterfind(".//m:t", NS)))
    return strings


def resolve_cell_value(cell: ET.Element, shared_strings: List[str]) -> str:
    cell_type = cell.attrib.get("t")
    value = cell.find("m:v", NS)
    inline = cell.find("m:is", NS)

    if cell_type == "s" and value is not None:
        return shared_strings[int(value.text)]
    if cell_type == "inlineStr" and inline is not None:
        return "".join(node.text or "" for node in inline.iterfind(".//m:t", NS))
    if value is not None and value.text is not None:
        return value.text
    return ""


def load_sheets(archive: ZipFile) -> Dict[str, List[Dict[str, str]]]:
    shared_strings = load_shared_strings(archive)
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    relationship_map = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}

    sheets = {}
    for sheet in workbook.find("m:sheets", WORKBOOK_NS):
        name = sheet.attrib["name"]
        relation_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        sheet_path = f"xl/{relationship_map[relation_id]}"
        worksheet = ET.fromstring(archive.read(sheet_path))
        rows = []
        for row in worksheet.findall(".//m:sheetData/m:row", NS):
            cells = {}
            for cell in row.findall("m:c", NS):
                ref = cell.attrib.get("r", "")
                column = "".join(ch for ch in ref if ch.isalpha())
                cells[column] = resolve_cell_value(cell, shared_strings)
            rows.append(cells)
        sheets[name] = rows

    return sheets


def build_resource_sheet(rows: List[Dict[str, str]]) -> Dict[str, object]:
    groups = []
    current_group = None

    for row in rows[2:]:
        marker = (row.get("A") or "").strip()
        if not marker:
            continue

        if is_numeric_row(marker):
            if current_group is None:
                current_group = {"title": "Resources", "entries": []}
                groups.append(current_group)
            current_group["entries"].append(
                {
                    "index": marker,
                    "type": clean_category_title(row.get("B") or ""),
                    "title": clean_category_title(row.get("C") or ""),
                    "description": clean_category_title(row.get("D") or ""),
                    "links": split_urls(row.get("E") or ""),
                    "alsoIn": parse_also_in(row.get("F") or ""),
                }
            )
            continue

        if row.get("B") or row.get("C") or row.get("D") or row.get("E") or row.get("F"):
            continue

        current_group = {"title": clean_category_title(marker), "entries": []}
        groups.append(current_group)

    return {
        "sectionTitle": clean_category_title(rows[0].get("A") or ""),
        "groups": [group for group in groups if group["entries"]],
    }


def build_tools_sheet(rows: List[Dict[str, str]]) -> Dict[str, object]:
    categories = []
    current_category = None

    for row in rows[2:]:
        marker = (row.get("A") or "").strip()
        if not marker:
            continue

        if is_numeric_row(marker):
            if current_category is None:
                current_category = {"title": "Tools", "entries": []}
                categories.append(current_category)
            current_category["entries"].append(
                {
                    "index": marker,
                    "icon": row.get("B") or "",
                    "title": clean_category_title(row.get("C") or ""),
                    "description": clean_category_title(row.get("D") or ""),
                    "platform": clean_category_title(row.get("E") or ""),
                    "webLinks": split_urls(row.get("F") or ""),
                    "appLinks": split_urls(row.get("G") or ""),
                    "tutorialLinks": split_urls(row.get("H") or ""),
                }
            )
            continue

        current_category = {"title": clean_tools_category_title(marker), "entries": []}
        categories.append(current_category)

    return {
        "title": clean_category_title(rows[0].get("A") or ""),
        "categories": [category for category in categories if category["entries"]],
    }


def build_comp_sheet(rows: List[Dict[str, str]]) -> Dict[str, object]:
    phases = []
    current_phase = None
    current_subject = None

    for row in rows[2:]:
        marker = (row.get("A") or "").strip()
        if not marker:
            continue

        if is_numeric_row(marker):
            if current_phase is None:
                current_phase = {"title": "Competitive Exams", "subjects": []}
                phases.append(current_phase)
            if current_subject is None:
                current_subject = {"title": "General", "entries": []}
                current_phase["subjects"].append(current_subject)
            current_subject["entries"].append(
                {
                    "index": marker,
                    "subject": clean_category_title(row.get("B") or ""),
                    "topic": clean_category_title(row.get("C") or ""),
                    "teacher": clean_category_title(row.get("D") or ""),
                    "medium": clean_category_title(row.get("E") or ""),
                    "youtubeLinks": split_urls(row.get("F") or ""),
                    "pdfLinks": split_urls(row.get("G") or ""),
                    "pdfSource": clean_category_title(row.get("H") or ""),
                    "bestForExams": clean_category_title(row.get("I") or ""),
                }
            )
            continue

        if marker.upper().startswith("PHASE"):
            current_phase = {"title": clean_comp_phase_title(marker), "subjects": []}
            phases.append(current_phase)
            current_subject = None
            continue

        if marker[0].isdigit():
            if current_phase is None:
                current_phase = {"title": "Competitive Exams", "subjects": []}
                phases.append(current_phase)
            current_subject = {"title": clean_comp_subject_title(marker), "entries": []}
            current_phase["subjects"].append(current_subject)

    return {
        "title": clean_category_title(rows[0].get("A") or ""),
        "phases": [phase for phase in phases if phase["subjects"]],
    }


def build_pigflix_sheet(rows: List[Dict[str, str]]) -> Dict[str, object]:
    hero_parts = [
        clean_category_title(part)
        for part in re.split(r"\s+·\s+", rows[0].get("A") or "")
        if clean_category_title(part)
    ]
    tabs = []
    current_tab = None
    current_subject = None

    for row in rows[2:]:
        marker = (row.get("A") or "").strip()
        if not marker:
            continue

        if is_numeric_row(marker):
            if current_tab is None:
                current_tab = {"title": "Pigflix", "subjects": []}
                tabs.append(current_tab)
            if current_subject is None:
                current_subject = {"title": "Highlights", "description": "", "entries": []}
                current_tab["subjects"].append(current_subject)

            current_subject["entries"].append(
                {
                    "index": marker,
                    "tab": clean_category_title(row.get("B") or "") or current_tab["title"],
                    "subject": clean_category_title(row.get("C") or "") or current_subject["title"],
                    "title": clean_category_title(row.get("D") or ""),
                    "type": clean_category_title(row.get("E") or ""),
                    "age": clean_category_title(row.get("F") or ""),
                    "vibe": clean_category_title(row.get("G") or ""),
                    "description": clean_category_title(row.get("H") or ""),
                    "links": split_urls(row.get("I") or ""),
                }
            )
            continue

        has_inline_values = any((row.get(column) or "").strip() for column in ["B", "C", "D", "E", "F", "G", "H", "I"])
        if has_inline_values or marker.startswith("🎬"):
            continue

        if "📂" in marker or "📁" in marker:
            if current_tab is None:
                current_tab = {"title": "Pigflix", "subjects": []}
                tabs.append(current_tab)

            current_subject = {
                **split_pigflix_section_title(marker),
                "entries": [],
            }
            current_tab["subjects"].append(current_subject)
            continue

        current_tab = {
            "title": strip_leading_symbols(marker),
            "subjects": [],
        }
        tabs.append(current_tab)
        current_subject = None

    return {
        "title": strip_leading_symbols(hero_parts[0]) if hero_parts else "Pigflix",
        "subtitle": hero_parts[1] if len(hero_parts) > 1 else "",
        "audience": hero_parts[2] if len(hero_parts) > 2 else "",
        "note": hero_parts[3] if len(hero_parts) > 3 else "",
        "tabs": [
            {
                **tab,
                "subjects": [subject for subject in tab["subjects"] if subject["entries"]],
            }
            for tab in tabs
            if any(subject["entries"] for subject in tab["subjects"])
        ],
    }


def build_payload(sheets: Dict[str, List[Dict[str, str]]]) -> Dict[str, object]:
    resource_sheet_names = ["N-5", "6-8", "9-12", "UG", "PG", "PHD", "TT", "Voc&Skill", "Universal"]
    resource_sheets = {
        name: build_resource_sheet(sheets[name]) for name in resource_sheet_names
    }

    return {
        "resourceSheets": resource_sheets,
        "tools": build_tools_sheet(sheets["Tools"]),
        "competition": build_comp_sheet(sheets["COMP"]),
        "pigflix": build_pigflix_sheet(sheets["Pigflix"]),
    }


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    workbook_path = repo_root / "Nursary to PhD _ Tools _ Comp _ Pigflix.xlsx"
    output_path = repo_root / "src" / "workbookData.json"

    with ZipFile(workbook_path) as archive:
        payload = build_payload(load_sheets(archive))

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
