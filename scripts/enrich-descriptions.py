"""Query NotebookLM in batches for rich Wikipedia-style site descriptions with inline citations.

Workflow:
1. Read all sites from Excel
2. Group sites by country, split into chunks of ~7 per query
3. For each chunk, run a `notebooklm ask --json` query asking for rich descriptions
4. Parse --json response: extract per-site descriptions and citation->source_id mapping
5. Map notebook source UUIDs to our SRC-NNNN ids using Sources sheet
6. Update Sites sheet with rich descriptions + a citation list

Runs queries in parallel via subprocess. Saves raw responses to data/notebook-responses/site-desc-*.json.
"""
import os
import sys
import json
import re
import subprocess
import time
import openpyxl
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL = os.path.join(BASE, "data", "us_missile_range_data.xlsx")
RESPONSES_DIR = os.path.join(BASE, "data", "notebook-responses")
DESC_DIR = os.path.join(RESPONSES_DIR, "site-descriptions")
os.makedirs(DESC_DIR, exist_ok=True)

BATCH_SIZE = 7
MAX_PARALLEL = 6


def load_sites_and_sources():
    wb = openpyxl.load_workbook(EXCEL)
    sites_sheet = wb["Sites"]
    sources_sheet = wb["Sources"]

    s_headers = [c.value for c in sites_sheet[1]]
    site_id_col = s_headers.index("site_id") + 1
    name_col = s_headers.index("site_name") + 1
    country_col = s_headers.index("country") + 1

    sites = []
    for row in range(2, sites_sheet.max_row + 1):
        sid = sites_sheet.cell(row=row, column=site_id_col).value
        name = sites_sheet.cell(row=row, column=name_col).value
        country = sites_sheet.cell(row=row, column=country_col).value
        if sid and name:
            sites.append({"site_id": sid, "name": name, "country": country or ""})

    src_headers = [c.value for c in sources_sheet[1]]
    sid_col = src_headers.index("source_id") + 1
    uuid_col = src_headers.index("notebook_uuid") + 1
    uuid_to_src = {}
    for row in range(2, sources_sheet.max_row + 1):
        uuid = sources_sheet.cell(row=row, column=uuid_col).value
        src_id = sources_sheet.cell(row=row, column=sid_col).value
        if uuid and src_id:
            uuid_to_src[uuid] = src_id

    return sites, uuid_to_src, wb


def build_batches(sites):
    by_country = defaultdict(list)
    for s in sites:
        by_country[s["country"]].append(s)
    batches = []
    for country, country_sites in by_country.items():
        for i in range(0, len(country_sites), BATCH_SIZE):
            batches.append((country, country_sites[i:i + BATCH_SIZE]))
    return batches


def make_prompt(country: str, sites: list) -> str:
    names_list = "\n".join(f"- {s['name']}" for s in sites)
    return f"""For each of the following sites in {country}, write a detailed Wikipedia-style description (200-300 words) based on the sources. Cite sources inline using [1], [2] style.

Sites:
{names_list}

Format your response EXACTLY like this (one block per site, separated by ###):

SITE_BEGIN: {sites[0]['name']}
<detailed description with [1] [2] inline citations>
SITE_END

###

SITE_BEGIN: <next site name>
<description>
SITE_END

Include for each site (where the sources cover it): location, history, founding year, governing organization, key facilities/radars, notable activities, current status. If the sources have no information about a site, write 'No detailed information available in sources.' and SITE_END.

Begin immediately with the first SITE_BEGIN: line."""


def run_query(batch_idx: int, country: str, sites: list) -> dict:
    prompt = make_prompt(country, sites)
    out_file = os.path.join(DESC_DIR, f"batch-{batch_idx:03d}-{country.replace(' ', '_')[:20]}.json")
    if os.path.exists(out_file):
        # Resume - skip if already done
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("answer"):
                return {"batch_idx": batch_idx, "country": country, "status": "cached", "file": out_file}
        except Exception:
            pass

    try:
        proc = subprocess.run(
            ["python", "-m", "notebooklm", "ask", "--new", "-y", "--json", prompt],
            capture_output=True, text=True, timeout=600,
            encoding="utf-8", errors="replace",
        )
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(proc.stdout)
        return {"batch_idx": batch_idx, "country": country, "status": "ok" if proc.returncode == 0 else "error",
                "file": out_file, "stderr": proc.stderr[:500] if proc.stderr else ""}
    except subprocess.TimeoutExpired:
        return {"batch_idx": batch_idx, "country": country, "status": "timeout", "file": out_file}
    except Exception as e:
        return {"batch_idx": batch_idx, "country": country, "status": f"exception: {e}", "file": out_file}


def main():
    sites, uuid_to_src, wb = load_sites_and_sources()
    print(f"Loaded {len(sites)} sites, {len(uuid_to_src)} source UUIDs")

    batches = build_batches(sites)
    print(f"Built {len(batches)} batches (max {BATCH_SIZE} sites each)")

    print(f"\nRunning queries in parallel ({MAX_PARALLEL} at a time)...")
    results = []
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as ex:
        futures = {ex.submit(run_query, i, country, sites): (i, country)
                   for i, (country, sites) in enumerate(batches)}
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            print(f"  [{res['status']:8}] batch {res['batch_idx']:3} ({res['country']})")

    print(f"\nDone. Results saved to {DESC_DIR}")
    ok = sum(1 for r in results if r["status"] in ("ok", "cached"))
    print(f"OK/cached: {ok}, Failed: {len(results) - ok}")


if __name__ == "__main__":
    main()
