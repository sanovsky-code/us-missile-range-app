"""Build and run a focused notebook query asking for coordinates of all N/A sites.

Saves response to data/notebook-responses/na-coords.txt
"""
import glob
import os
import re
import subprocess
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESPONSES_DIR = os.path.join(BASE, "data", "notebook-responses")


def extract_na_sites():
    files = sorted(glob.glob(os.path.join(RESPONSES_DIR, "*.txt")))
    out = defaultdict(set)
    for fname in files:
        # skip sub-directories
        if os.path.isdir(fname):
            continue
        with open(fname, "r", encoding="utf-8") as f:
            raw = f.read()
        chunks = []
        current = None
        for line in raw.split("\n"):
            if line.startswith("SITE|"):
                if current:
                    chunks.append(current)
                current = line
            elif current and not line.startswith(("Answer:", "New conversation:")):
                current += " " + line.strip()
        if current:
            chunks.append(current)
        for c in chunks:
            c = re.sub(r"\s+", " ", c).strip()
            parts = c.split("|")
            if len(parts) < 10:
                continue
            country = parts[1].strip()
            name = parts[2].strip()
            lat = parts[3].strip().upper()
            lon = parts[4].strip().upper()
            if lat in ("N/A", "NA", "-", "") or lon in ("N/A", "NA", "-", ""):
                out[country].add(name)
    return out


def main():
    na = extract_na_sites()
    flat_list = []
    for country, names in sorted(na.items()):
        for name in sorted(names):
            flat_list.append((country, name))
    print(f"Need coordinates for {len(flat_list)} sites")

    # Format the prompt
    site_lines = "\n".join(f"- {country}: {name}" for country, name in flat_list)
    prompt = f"""For each of the following sites, give the geographic coordinates (latitude and longitude in decimal degrees, with negative values for south and west). Use the sources, and only the sources. If the sources do not contain coordinates for a site, output COORDS|country|site_name|N/A|N/A.

Output one line per site in this exact format (no extra commentary):
COORDS|country|site_name|latitude|longitude

Sites:
{site_lines}

Begin immediately with COORDS| lines."""

    out_file = os.path.join(RESPONSES_DIR, "na-coords.txt")
    print(f"Running query, output -> {out_file}")
    proc = subprocess.run(
        ["python", "-m", "notebooklm", "ask", "--new", "-y", prompt],
        capture_output=True, text=True, timeout=900,
        encoding="utf-8", errors="replace",
    )
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(proc.stdout)
    print(f"Done. Exit code: {proc.returncode}")
    # Quick summary
    with open(out_file, "r", encoding="utf-8") as f:
        content = f.read()
    coords = re.findall(r"^COORDS\|", content, flags=re.MULTILINE)
    print(f"COORDS lines: {len(coords)}")


if __name__ == "__main__":
    main()
