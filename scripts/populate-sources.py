"""Populate Sources sheet from notebook source-list.json"""
import json
import os
import re
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_JSON = os.path.join(BASE, "data", "notebook-responses", "source-list.json")
EXCEL = os.path.join(BASE, "data", "us_missile_range_data.xlsx")


def classify_source_type(url: str, title: str) -> str:
    """Classify into one of: Official, Government, Contractor, News, Academic, Industry, Other"""
    if not url:
        return "Other"
    u = url.lower()
    t = title.lower()
    if any(d in u for d in [".mil", ".gov", "spaceforce.mil", "af.mil", "navy.mil", "army.mil",
                            "nasa.gov", "missiledefense.mil", "darpa.mil"]):
        return "Official"
    if any(d in u for d in [".gov.", "ecfr.gov", "nuke.fas.org", "fas.org",
                            "defense.gov", "smdc.army.mil"]):
        return "Government"
    if "wikipedia.org" in u:
        return "Academic"
    if any(d in u for d in [".edu", "lincoln", "mit.edu"]):
        return "Academic"
    if any(w in t for w in ["news", "times", "post", "reuters", "ap", "bbc", "warriormaven"]):
        return "News"
    if any(d in u for d in ["lockheedmartin", "raytheon", "boeing", "northrop", "spacex",
                            "missiledefenseadvocacy", "thedefensewatch"]):
        return "Industry"
    return "Other"


def style_header(sheet):
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFFFF")
        cell.fill = PatternFill(start_color="FF1E3A5F", end_color="FF1E3A5F", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    sheet.auto_filter.ref = sheet.dimensions


def main():
    with open(SOURCE_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    sources = data["sources"]
    print(f"Loaded {len(sources)} sources from notebook")

    wb = openpyxl.load_workbook(EXCEL)
    sheet = wb["Sources"]
    # Clear existing rows
    sheet.delete_rows(1, sheet.max_row)
    sheet.append(["source_id", "source_title", "source_url", "source_type",
                  "publisher", "publication_date", "access_date",
                  "reliability_score", "notes", "notebook_uuid"])

    for src in sources:
        idx = src["index"]
        title = (src.get("title") or "").strip()
        url = (src.get("url") or "").strip()
        nb_uuid = src.get("id") or ""
        src_type = classify_source_type(url, title)
        # Reliability heuristic
        if src_type == "Official":
            reliability = 95
        elif src_type == "Government":
            reliability = 90
        elif src_type == "Academic":
            reliability = 85
        elif src_type == "Industry":
            reliability = 75
        elif src_type == "News":
            reliability = 70
        else:
            reliability = 65
        # Extract publisher from URL
        publisher = ""
        m = re.search(r"https?://(?:www\.)?([^/]+)", url)
        if m:
            publisher = m.group(1)

        sheet.append([
            f"SRC-{idx:04d}",
            title,
            url,
            src_type,
            publisher,
            "",  # publication_date
            "2026-05-27",
            reliability,
            "",
            nb_uuid,
        ])

    style_header(sheet)
    widths = [12, 60, 70, 14, 30, 16, 14, 12, 30, 38]
    for i, w in enumerate(widths, start=1):
        sheet.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    wb.save(EXCEL)
    print(f"Wrote {len(sources)} sources to Sources sheet")


if __name__ == "__main__":
    main()
