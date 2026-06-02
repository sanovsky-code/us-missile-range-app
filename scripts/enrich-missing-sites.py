"""Top-up enrichment for sites that missed the initial enrichment batch.

Finds sites that have no `citations` field set in the Sites sheet (so they
were added after the initial enrichment ran). For each such site, queries
the NotebookLM for a rich description AND any radars at that site,
in batches grouped by country.

Saves responses to data/notebook-responses/site-descriptions-v2/
and data/notebook-responses/radar-descriptions-v2/ then runs apply-enrichment
logic to merge them in.
"""
import os
import json
import subprocess
import openpyxl
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL = os.path.join(BASE, "data", "us_missile_range_data.xlsx")
RESPONSES_DIR = os.path.join(BASE, "data", "notebook-responses")
DESC_V2_DIR = os.path.join(RESPONSES_DIR, "site-descriptions-v2")
RADAR_V2_DIR = os.path.join(RESPONSES_DIR, "radar-descriptions-v2")
os.makedirs(DESC_V2_DIR, exist_ok=True)
os.makedirs(RADAR_V2_DIR, exist_ok=True)

BATCH_SIZE = 6
MAX_PARALLEL = 5


def load_missing_sites():
    """Return sites that have no citations (i.e. weren't enriched)."""
    wb = openpyxl.load_workbook(EXCEL)
    sheet = wb["Sites"]
    headers = [c.value for c in sheet[1]]
    name_col = headers.index("site_name") + 1
    country_col = headers.index("country") + 1
    id_col = headers.index("site_id") + 1
    desc_col = headers.index("description") + 1
    cite_col = headers.index("citations") + 1 if "citations" in headers else None

    missing = []
    for row in range(2, sheet.max_row + 1):
        sid = sheet.cell(row=row, column=id_col).value
        name = sheet.cell(row=row, column=name_col).value
        country = sheet.cell(row=row, column=country_col).value
        desc = sheet.cell(row=row, column=desc_col).value or ""
        cites = sheet.cell(row=row, column=cite_col).value if cite_col else None
        if not name:
            continue
        # Missing if no citations OR description too short
        if not cites or len(desc) < 200:
            missing.append({"site_id": sid, "name": name, "country": country or ""})
    return missing


def make_desc_prompt(country: str, sites: list) -> str:
    names_list = "\n".join(f"- {s['name']}" for s in sites)
    return f"""For each of the following sites in {country}, write a detailed Wikipedia-style description (200-300 words) based on the sources. Cite sources inline using [1], [2] style.

Sites:
{names_list}

Format your response EXACTLY like this (one block per site, separated by ###):

SITE_BEGIN: {sites[0]['name']}
<detailed description with [1] [2] inline citations covering location, history, founding year, governing organization, key facilities/radars, notable activities, current status>
SITE_END

###

If a site has no information in the sources, write 'No detailed information available in sources.' between SITE_BEGIN/SITE_END.

Begin immediately with the first SITE_BEGIN: line."""


def make_radar_prompt(country: str, sites: list) -> str:
    names_list = "\n".join(f"- {s['name']}" for s in sites)
    return f"""For each of the following sites in {country}, list all radar systems present at that site, with detailed descriptions (150-250 words per radar) based on the sources. Cite inline using [1], [2].

Sites:
{names_list}

Format EXACTLY like this (one RADAR_BEGIN/RADAR_END block per radar):

RADAR_BEGIN: <radar name> | <site name>
<detailed description with [1] [2] inline citations covering: type, frequency band, manufacturer, year built, capabilities, purpose, current status>
RADAR_END

###

If a site has no radars in the sources, skip it. Begin immediately with RADAR_BEGIN."""


def build_batches(sites):
    by_country = defaultdict(list)
    for s in sites:
        by_country[s["country"]].append(s)
    batches = []
    for country, country_sites in by_country.items():
        for i in range(0, len(country_sites), BATCH_SIZE):
            batches.append((country, country_sites[i:i + BATCH_SIZE]))
    return batches


def run_query(out_dir: str, batch_idx: int, country: str, sites: list, prompt: str) -> dict:
    out_file = os.path.join(out_dir, f"batch-{batch_idx:03d}-{country.replace(' ', '_')[:20]}.json")
    if os.path.exists(out_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("answer"):
                return {"batch_idx": batch_idx, "country": country, "status": "cached"}
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
        return {"batch_idx": batch_idx, "country": country,
                "status": "ok" if proc.returncode == 0 else "error"}
    except subprocess.TimeoutExpired:
        return {"batch_idx": batch_idx, "country": country, "status": "timeout"}


def run_pass(out_dir: str, prompt_fn, label: str, batches: list):
    print(f"\n=== {label}: {len(batches)} batches, {MAX_PARALLEL} parallel ===")
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as ex:
        futures = {ex.submit(run_query, out_dir, i, country, sites, prompt_fn(country, sites)): (i, country)
                   for i, (country, sites) in enumerate(batches)}
        for fut in as_completed(futures):
            res = fut.result()
            print(f"  [{res['status']:8}] batch {res['batch_idx']:3} ({res['country']})")


def main():
    missing = load_missing_sites()
    print(f"Sites missing enrichment: {len(missing)}")
    by_country = defaultdict(int)
    for s in missing:
        by_country[s["country"]] += 1
    for c, n in sorted(by_country.items(), key=lambda x: -x[1])[:10]:
        print(f"  {c}: {n}")

    batches = build_batches(missing)
    print(f"\nTotal batches: {len(batches)}")

    run_pass(DESC_V2_DIR, make_desc_prompt, "DESCRIPTIONS", batches)
    run_pass(RADAR_V2_DIR, make_radar_prompt, "RADARS", batches)

    print(f"\nDone.")
    print(f"  Descriptions saved to {DESC_V2_DIR}")
    print(f"  Radars saved to {RADAR_V2_DIR}")


if __name__ == "__main__":
    main()
