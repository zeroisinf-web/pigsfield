# Pigsfield — Step 1: extract every non-empty cell + hyperlink from the Excel files.
# Usage:  python tools/extract.py  (run from the Pigsfield folder; xlsx files in ../Downloads or same folder)
import openpyxl, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FILES = [
    "01 v3 Nursary to PhD.xlsx",
    "02 v3 Teacher Training + Vocational & Skills.xlsx",
    "03 v3 Tools.xlsx",
    "04 v3 Compititive Exams.xlsx",
    "05 v3 PigBang.xlsx",
    "06 v3 Make Govt Accountable.xlsx",
]

def find(fname):
    for base in (os.path.join(ROOT, "source-excel"), ROOT, os.path.dirname(ROOT), os.getcwd()):
        p = os.path.join(base, fname)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(fname)

def main():
    outdir = os.path.join(ROOT, "extract")
    os.makedirs(outdir, exist_ok=True)
    for f in FILES:
        wb = openpyxl.load_workbook(find(f), data_only=True)
        fdata = {}
        for ws in wb.worksheets:
            rows = []
            for row in ws.iter_rows():
                r, has = [], False
                for cell in row:
                    v = cell.value
                    link = cell.hyperlink.target if cell.hyperlink else None
                    if v is not None or link:
                        has = True
                    if v is None and link is None:
                        r.append(None)
                    elif link:
                        r.append({"v": str(v) if v is not None else None, "l": link})
                    else:
                        r.append(str(v))
                if has:
                    while r and r[-1] is None:
                        r.pop()
                    rows.append({"row": row[0].row, "cells": r})
            fdata[ws.title] = rows
        out = os.path.join(outdir, f.replace(".xlsx", "") + ".json")
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(fdata, fh, ensure_ascii=False, indent=1)
        print(f, "->", {k: len(v) for k, v in fdata.items()})

if __name__ == "__main__":
    main()
